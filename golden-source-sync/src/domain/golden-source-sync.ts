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
  PersistedState,
} from './ports.js';
import { toGoldenSourceMarkdown } from '../lib/markdown.js';

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

  setupSource(_req: SetupRequest): Promise<SetupResult> {
    return notImplemented('setupSource', 'Step 6');
  }

  /**
   * Step 2 — write each enumerated page as one Markdown note under the source's
   * target dir. Delta/state/watermark and deletion reconciliation come in Steps 3/5;
   * for now every page is (re)written and the report counts writes only.
   */
  async sync(name: string): Promise<SyncReport> {
    const configs = await this.deps.configStore.loadAll();
    const config = configs.find((c) => c.name === name);
    if (!config) {
      return { name, status: 'failed', written: 0, deleted: 0, unchanged: 0 };
    }
    const connector = this.deps.connectorFor(config);
    const items = await connector.listItems();
    let written = 0;
    for (const item of items) {
      const body = await connector.fetchContent(item);
      const markdown = toGoldenSourceMarkdown(config.name, item, body);
      await this.deps.vaultWriter.write(`${config.target_dir}/${item.id}.md`, markdown);
      written += 1;
    }
    return { name, status: 'ok', written, deleted: 0, unchanged: 0 };
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

function notImplemented(method: string, step: string): Promise<never> {
  return Promise.reject(new Error(`${method}() is implemented in ${step}`));
}
