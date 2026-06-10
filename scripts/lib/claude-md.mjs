// ═══════════════════════════════════════════════════════════════════════════
// claude-md.mjs — detection of the "bootstrap stub" CLAUDE.md (pre-install).
//
// The template ships a bootstrap-stub CLAUDE.md carrying a marker: it signals to
// Claude that the repo is not installed yet and invites it to guide the user to
// `node installer.mjs`. The installer must be able to overwrite it (and ONLY it)
// with the real generated CLAUDE.md — without ever overwriting a real user
// constitution.
// ═══════════════════════════════════════════════════════════════════════════

export const INSTALLER_STUB_MARKER = "<!-- second-brain-generator:installer-stub -->";

// True if a CLAUDE.md's content carries the bootstrap-stub marker.
export function isInstallerStub(content) {
  return content.includes(INSTALLER_STUB_MARKER);
}
