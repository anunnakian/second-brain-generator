// ═══════════════════════════════════════════════════════════════════════════
// git-init.mjs — décision PURE : faut-il initialiser un dépôt git ?
// Le flux « copie détachée » supprime le .git d'origine ; sans dépôt, le hook
// auto-commit n'a aucun socle. On (re)crée donc un dépôt local s'il n'y en a pas.
// ═══════════════════════════════════════════════════════════════════════════
import { existsSync } from "node:fs";
import { join } from "node:path";

export function shouldInitGit(root) {
  return !existsSync(join(root, ".git"));
}
