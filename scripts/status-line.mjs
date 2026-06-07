#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// status-line.mjs — produit UNE ligne de statut pour la `statusLine` de Claude
// Code (cf. .claude/settings.json). Affichage DÉTERMINISTE et PERSISTANT, rendu
// nativement sur les deux surfaces (terminal CLI ET onglet Code de Claude Desktop)
// — contrairement au `systemMessage` du hook SessionStart, ignoré par Desktop.
//
// Contrat statusLine : lit un JSON de session sur stdin (ignoré ici), écrit UNE
// ligne sur stdout. Réexécuté en continu → doit rester RAPIDE, LECTURE SEULE et
// IDEMPOTENT : jamais de `git pull`, jamais d'écriture (ça, c'est le rôle du hook
// SessionStart, lancé une seule fois au démarrage).
//
// Multi-OS : pur Node, aucune dépendance bash/jq/sqlite3-CLI.
//   - git via child_process (lecture seule : branche, short SHA, propreté)
//   - comptage des .md via fs
//   - lecture de la DB RAG via better-sqlite3 (dans rag/node_modules) ; dégrade
//     proprement si le module/DB n'est pas chargeable.
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasGeminiKey } from "./lib/gemini-key.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const VAULT = join(REPO, "vault");
const DB_PATH = join(REPO, "rag", ".cache", "vault.db");
const ENV_PATH = join(REPO, ".env");

// Exécute git en lecture seule et renvoie la sortie (chaîne vide si échec).
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

// ─── Segment git : branche + short SHA + marqueur « modifs non commitées » ────
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) || "?";
const short = git(["rev-parse", "--short", "HEAD"]) || "?";
const dirty = git(["status", "--porcelain"]).length > 0 ? "*" : "";
const gitSeg = `⎇ ${branch} ${short}${dirty}`;

// ─── Segment RAG : docCount (db) vs fichiers .md sur disque ───────────────────
function countMarkdown(dir) {
  let n = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += countMarkdown(p);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) n++;
  }
  return n;
}
const scanned = countMarkdown(VAULT);

let docs = null;
if (existsSync(DB_PATH)) {
  try {
    const require = createRequire(join(REPO, "rag", "package.json"));
    const Database = require("better-sqlite3");
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    docs = db.prepare("SELECT COUNT(*) AS n FROM documents").get().n;
    db.close();
  } catch {
    docs = null; // dégrade : module absent, DB en cours d'écriture, etc.
  }
}

let ragSeg;
if (scanned === 0) {
  ragSeg = "🧠 RAG vide";
} else if (docs === null) {
  ragSeg = "🧠 RAG ?";
} else {
  const remaining = scanned - docs;
  ragSeg = remaining <= 0 ? `🧠 RAG ${docs}/${scanned}` : `🧠 RAG ${docs}/${scanned} (${remaining}⏳)`;
}

// ─── Segment clé : balise FORT si la clé Gemini manque (RAG inopérant) ────────
const envContent = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : null;
const keySeg = hasGeminiKey(envContent) ? null : "⚠️ clé Gemini absente";

// ─── Une seule ligne, segments séparés par « · » ─────────────────────────────
process.stdout.write([gitSeg, ragSeg, keySeg].filter(Boolean).join(" · "));
