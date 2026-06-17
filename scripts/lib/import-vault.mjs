// ═══════════════════════════════════════════════════════════════════════════
// import-vault.mjs — pure core for the `import` skill (ADR 0019).
// ═══════════════════════════════════════════════════════════════════════════

import { existsSync, statSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { listFilesRelPosix } from "./fs-walk.mjs";
import { isExampleNote } from "./example-notes.mjs";

// Resolves `source` to its vault dir: a brain root resolves to <source>/vault;
// a dir that is already a vault is used as-is.
function resolveSourceVault(source) {
  const nested = join(source, "vault");
  if (existsSync(nested) && statSync(nested).isDirectory()) return nested;
  return source;
}

export function planImport({ source, dest }) {
  if (!source || !existsSync(source)) {
    throw new Error(`import: source not found — no such folder: ${source}`);
  }
  const sourceVault = resolveSourceVault(source);
  const destVault = join(dest, "vault");
  if (sourceVault === destVault || source === dest) {
    throw new Error("import: source and destination are the same brain — cannot import a brain into itself");
  }

  const notes = [];
  const collisions = [];
  const skippedExamples = [];
  for (const relpath of listFilesRelPosix(sourceVault)) {
    // Hidden/system entries (.obsidian, .DS_Store, any dotfile/dot-dir) never travel.
    if (relpath.split("/").some((seg) => seg.startsWith("."))) continue;
    // Demo notes never travel (guard the new brain's RAG). Only .md can be one.
    if (relpath.endsWith(".md") && isExampleNote(readFileSync(join(sourceVault, relpath), "utf8"))) {
      skippedExamples.push(relpath);
      continue;
    }
    // Everything else — notes AND attachments — is an import candidate, unless it
    // would clobber an existing file in the destination vault.
    if (existsSync(join(destVault, relpath))) {
      collisions.push(relpath);
      continue;
    }
    notes.push(relpath);
  }
  if (notes.length + collisions.length + skippedExamples.length === 0) {
    throw new Error(`import: nothing to import — no notes found under ${sourceVault} (is this the right folder?)`);
  }
  return { sourceVault, notes, collisions, skippedExamples };
}

// Human summary of a plan (counts + where it read from). Pure → unit-tested; the
// CLI entry and the `import` skill only print it.
export function formatPlan(plan) {
  return [
    `📋 Import plan (read from ${plan.sourceVault}):`,
    `   • ${plan.notes.length} note(s)/attachment(s) to import`,
    `   • ${plan.collisions.length} collision(s) (already in your vault → will be skipped, never overwritten)`,
    `   • ${plan.skippedExamples.length} example note(s) skipped (demo content)`,
  ].join("\n");
}

// Human summary of an apply result. Pure → unit-tested.
export function formatApplyResult(result) {
  return [
    `✅ Import done: ${result.copied.length} note(s)/attachment(s) copied into your vault.`,
    `   • ${result.skipped.length} skipped (name collision — your existing notes were left untouched).`,
  ].join("\n");
}

// Copies the planned notes into <dest>/vault, preserving subfolders. Never
// overwrites: a collision is skipped and reported. No business logic — drives
// off the plan produced by planImport.
export function applyImport(plan, { dest }) {
  const destVault = join(dest, "vault");
  const copied = [];
  for (const relpath of plan.notes) {
    const target = join(destVault, relpath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(plan.sourceVault, relpath), target);
    copied.push(relpath);
  }
  // Collisions are never overwritten — they are reported, untouched.
  return { copied, skipped: [...plan.collisions] };
}
