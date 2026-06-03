// ═══════════════════════════════════════════════════════════════════════════
// git-init.mjs — décision PURE des actions git à l'installation.
//
// But : garantir que le second cerveau de l'utilisateur n'a AUCUN lien vers le
// repo du starter, SANS aucune opération irréversible (on ne supprime jamais le
// .git). On se contente, au pire, de retirer le remote hérité (recouvrable).
// La vraie garantie anti-fuite vit ailleurs : le push opt-in du hook auto-commit
// (cf. scripts/auto-commit.mjs, `secondbrain.autopush`).
//
// Entrées (toutes booléennes, calculées par bootstrap.mjs) :
//  - hasDotGit    : un dossier .git existe-t-il déjà (clone) ?
//  - wasStub      : CLAUDE.md était-il encore l'amorce AVANT génération
//                   (= repo pas encore installé) ?
//  - isMaintainer : ce dossier est-il le repo de dev du template
//                   (présence de CLAUDE.local.md, gitignoré, jamais chez un user) ?
// ═══════════════════════════════════════════════════════════════════════════

export function planGitSetup({ hasDotGit, wasStub, isMaintainer }) {
  // Repo de dev du mainteneur ou cerveau déjà installé : on ne touche à rien
  // (garde-fou + idempotence).
  if (isMaintainer || !wasStub) {
    return { init: false, stripRemote: false, commit: false };
  }
  // Install fraîche d'un utilisateur : init si pas de dépôt, sinon retirer le
  // remote hérité ; dans les deux cas, committer les fichiers générés.
  return { init: !hasDotGit, stripRemote: hasDotGit, commit: true };
}
