import type {
  FreshnessReport,
  GoldenSourceConfig,
  RemoveResult,
  SetupRequest,
  SetupResult,
  SourceState,
  SourceStatus,
  SyncReport,
} from './types.js';
import type {
  ConnectorFactory,
  IClock,
  IConfigStore,
  IStateStore,
  IVaultWriter,
  PersistedItem,
  PersistedState,
} from './ports.js';
import { toGoldenSourceMarkdown } from '../lib/markdown.js';
import { contentHash } from '../lib/content-hash.js';
import { extractPageId } from '../lib/notion-url.js';
import { pagesToDelete } from './reconcile.js';

/**
 * API port (driving side) — the domain contract, transport-independent (PRD §5).
 * The MCP tools (§9) are a 1:1 translation of this port; one could drive it from a
 * CLI or HTTP without touching the domain.
 */
export interface IGoldenSourceSync {
  setupSource(req: SetupRequest): Promise<SetupResult>;
  listSources(): Promise<SourceState[]>;
  /** `name` is a source name or the literal `"all"` (PRD §9). */
  sync(name: string): Promise<SyncReport>;
  checkFreshness(name: string): Promise<FreshnessReport>;
  status(name: string): Promise<SourceStatus>;
  removeSource(name: string, cleanup?: boolean): Promise<RemoveResult>;
}

/** Driven dependencies of the Domain Service — all SPI, all stubbable (PRD §5). */
export interface GoldenSourceSyncDeps {
  configStore: IConfigStore;
  stateStore: IStateStore;
  vaultWriter: IVaultWriter;
  clock: IClock;
  connectorFor: ConnectorFactory;
}

/** The Domain Service — the concrete API port. Pure orchestration, no transport. */
export class GoldenSourceSync implements IGoldenSourceSync {
  constructor(private readonly deps: GoldenSourceSyncDeps) {}

  async listSources(): Promise<SourceState[]> {
    const configs = await this.deps.configStore.loadAll();
    return Promise.all(configs.map((config) => this.describe(config)));
  }

  private async describe(config: GoldenSourceConfig): Promise<SourceState> {
    const persisted = await this.deps.stateStore.load(config.name);
    return toSourceState(config, persisted);
  }

  /**
   * Onboard a brand-new golden source (PRD §13). First it **tests the scope**: the connector's
   * scoped enumeration must return the zone — an enumeration error reads as "auth/connection
   * problem", and zero pages reads as "root not connected" (PRD §11.5/§12). Only once the scope
   * is proven do we **declare** the source (config file = versioned source of truth, §20.2) and
   * run the **first sync**. The token never travels through Claude's context — only its env-var
   * name (`tokenEnv`) is stored (§11).
   */
  async setupSource(req: SetupRequest): Promise<SetupResult> {
    const config = configFromRequest(req);
    const connector = this.deps.connectorFor(config);

    let items;
    try {
      items = await connector.listItems();
    } catch (error) {
      return {
        name: req.name,
        ok: false,
        message:
          `Could not reach the "${req.name}" zone: ${errorMessage(error)}. ` +
          `Check that "${req.tokenEnv}" holds a valid Read-content token and that the root page ` +
          `is connected to the integration in Notion (••• → Connections).`,
      };
    }

    if (items.length === 0) {
      return {
        name: req.name,
        ok: false,
        message:
          `The scoped search returned 0 pages for "${req.name}". The root page is not connected ` +
          `to the integration yet: in Notion, open the root page → ••• → Connections → add your ` +
          `integration, then run setup again. (Access cascades over the whole sub-tree.)`,
      };
    }

    await this.deps.configStore.upsert(config);
    const report = await this.sync(config.name);

    return {
      name: req.name,
      ok: report.status !== 'failed',
      message:
        `Source "${req.name}" set up: scope confirmed (${items.length} page(s) in the zone), ` +
        `first sync ${report.status} — ${report.written} written, ${report.unchanged} unchanged. ` +
        `Files live under ${config.target_dir}/; the brain will index them and answer with ` +
        `clickable citations.`,
    };
  }

  /**
   * Stateful delta sync + deletion reconciliation. Each enumerated page becomes one Markdown
   * note, (re)written only when the produced markdown's hash differs from the one recorded in
   * the per-source state sidecar (PRD §10) → a no-change sync rewrites nothing. A page that left
   * the perimeter has its `.md` deleted (Step 5). The watermark advances to the max
   * `last_edited_time` of the perimeter (PRD §7/§16), only on full success.
   *
   * The §7/§12 guardrail is non-negotiable: a doubtful perimeter — `listItems()` rejecting, or a
   * wholesale disappearance against a non-empty corpus — NEVER triggers a deletion; it freezes
   * the source as `partial` so a remote glitch can never wipe the golden source.
   */
  async sync(name: string): Promise<SyncReport> {
    const configs = await this.deps.configStore.loadAll();
    const config = configs.find((c) => c.name === name);
    if (!config) {
      return { name, status: 'failed', written: 0, deleted: 0, unchanged: 0 };
    }
    const previous = await this.deps.stateStore.load(config.name);
    const connector = this.deps.connectorFor(config);
    const now = this.deps.clock.now().toISOString();

    // §7/§12 guardrail (the #1 risk): a failed/incomplete enumeration must NEVER read as an
    // empty perimeter, or reconciliation would wipe the whole corpus. When `listItems()` rejects
    // (401/429/network/truncated pagination), we delete nothing, keep every tracked item, freeze
    // the watermark, and report `partial` so the next run re-pulls everything.
    let items;
    try {
      items = await connector.listItems();
    } catch {
      return this.freezeAsPartial(config, previous, now);
    }

    // §7/§12 guardrail: a lost scope / disconnected root makes Notion's `search` return ZERO
    // pages WITHOUT an error. Reconciling that against a non-empty corpus would wipe the whole
    // golden source. So a wholesale "everything vanished" is treated as suspicious, not real:
    // delete nothing, keep every tracked item, freeze the watermark, report `partial`.
    const previousCount = previous ? Object.keys(previous.items).length : 0;
    if (items.length === 0 && previousCount > 0) {
      return this.freezeAsPartial(config, previous, now);
    }

    const nextItems: Record<string, PersistedItem> = {};
    let written = 0;
    let unchanged = 0;
    let perimeterMax: string | null = null;
    let allOk = true;

    for (const item of items) {
      const vaultPath = `${config.target_dir}/${item.id}.md`;
      const tracked = previous?.items[item.id];
      try {
        const markdown = toGoldenSourceMarkdown(config.name, item, await connector.fetchContent(item));
        const hash = contentHash(markdown);
        if (tracked && tracked.contentHash === hash) {
          nextItems[item.id] = tracked;
          unchanged += 1;
        } else {
          await this.deps.vaultWriter.write(vaultPath, markdown);
          nextItems[item.id] = {
            title: item.title,
            vaultPath,
            lastEditedTime: item.lastEditedTime,
            contentHash: hash,
            lastWrittenAt: now,
          };
          written += 1;
        }
      } catch {
        // §10/§12: when in doubt we don't write — keep the last good version of this item
        // (incremental persistence) and mark the whole sync partial so the watermark freezes.
        allOk = false;
        if (tracked) nextItems[item.id] = tracked;
      }
      if (perimeterMax === null || item.lastEditedTime > perimeterMax) {
        perimeterMax = item.lastEditedTime;
      }
    }

    // Deletion reconciliation (PRD §7): a page that left the enumerated perimeter (deleted or
    // moved out of scope) has its `.md` removed and is dropped from the state map. We only get
    // here once `listItems()` resolved — a failed/incomplete enumeration never reaches this
    // point, so the non-negotiable §7/§12 guardrail (never delete on a doubtful perimeter) holds.
    let deleted = 0;
    for (const stale of pagesToDelete(items, previous?.items ?? {})) {
      await this.deps.vaultWriter.delete(stale.vaultPath);
      deleted += 1;
    }

    // The watermark advances to the perimeter max only on a fully successful sync; a partial
    // sync freezes it at the previous value, so the next run re-pulls the missed edits (PRD §10).
    const status = allOk ? 'ok' : 'partial';
    await this.deps.stateStore.save(config.name, {
      schemaVersion: 1,
      name: config.name,
      connector: config.connector.type,
      rootPageId: rootPageIdOf(config, previous),
      watermark: allOk ? perimeterMax : (previous?.watermark ?? null),
      lastSyncAt: now,
      lastSyncStatus: status,
      items: nextItems,
    });

    return { name, status, written, deleted, unchanged };
  }

  /**
   * The §7/§12 guardrail outcome: a doubtful perimeter (enumeration failure, or a wholesale
   * disappearance) must change nothing on disk. We persist a `partial` marker with the watermark
   * frozen and every tracked item kept, so the next run re-pulls and reconciles from solid ground.
   */
  private async freezeAsPartial(
    config: GoldenSourceConfig,
    previous: PersistedState | null,
    now: string,
  ): Promise<SyncReport> {
    await this.deps.stateStore.save(config.name, {
      schemaVersion: 1,
      name: config.name,
      connector: config.connector.type,
      rootPageId: rootPageIdOf(config, previous),
      watermark: previous?.watermark ?? null,
      lastSyncAt: now,
      lastSyncStatus: 'partial',
      items: previous?.items ?? {},
    });
    return { name: config.name, status: 'partial', written: 0, deleted: 0, unchanged: 0 };
  }

  checkFreshness(_name: string): Promise<FreshnessReport> {
    return notImplemented('checkFreshness', 'Step 7');
  }

  status(_name: string): Promise<SourceStatus> {
    return notImplemented('status', 'Step 7');
  }

  removeSource(_name: string, _cleanup?: boolean): Promise<RemoveResult> {
    return notImplemented('removeSource', 'Step 7');
  }
}

/** Maps a declared config + its persisted state into the API-facing SourceState. */
export function toSourceState(
  config: GoldenSourceConfig,
  persisted: PersistedState | null,
): SourceState {
  return {
    name: config.name,
    title: config.title,
    connector: config.connector.type,
    watermark: persisted?.watermark ?? null,
    lastSyncAt: persisted?.lastSyncAt ?? null,
    lastSyncStatus: persisted?.lastSyncStatus ?? 'never',
    itemCount: persisted ? Object.keys(persisted.items).length : 0,
  };
}

/** The source's stable Notion root page id — from prior state, else extracted from the URL. */
function rootPageIdOf(config: GoldenSourceConfig, previous: PersistedState | null): string {
  return previous?.rootPageId ?? extractPageId(config.connector.config.root_page_url);
}

/** Assembles a declared config from the onboarding request — the token's env-var name only (§11). */
function configFromRequest(req: SetupRequest): GoldenSourceConfig {
  return {
    name: req.name,
    title: req.title,
    description: req.description,
    connector: {
      type: 'notion',
      config: { root_page_url: req.rootPageUrl, token_env: req.tokenEnv },
    },
    target_dir: `golden-sources/${req.name}`,
  };
}

/** A readable message from a thrown value, never leaking a token (connectors name the env var). */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notImplemented(method: string, step: string): Promise<never> {
  return Promise.reject(new Error(`${method}() is implemented in ${step}`));
}
