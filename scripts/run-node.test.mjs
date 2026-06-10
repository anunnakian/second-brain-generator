import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildNodeRunnerSh, minimalPathEnv } from "./lib/rag-launcher.mjs";

// Behavioral test: the generated launcher must REALLY execute node and relay the
// hook's arguments to it. Guardrail against a broken wrapper (the worst case would
// be a silent failure — hence this test that requires an observable execution).
// POSIX only (run-node.sh); skipped on Windows (covered by run-node.cmd).
test(
  "run-node.sh: executes node and relays the arguments (no silent failure)",
  { skip: process.platform === "win32" ? "POSIX only" : false },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "run-node-"));
    try {
      const script = join(dir, "run-node.sh");
      writeFileSync(script, buildNodeRunnerSh());
      const out = execFileSync(
        "/bin/sh",
        [script, "-e", "process.stdout.write('NODE_RAN:'+process.argv.length)"],
        { encoding: "utf8" },
      );
      assert.match(out, /NODE_RAN:/); // node did run via the wrapper
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

// Hermetic proof that the BROADENED COVERAGE actually resolves node (not just that
// the chain forwards). We build a temporary HOME with a fake node placed under a
// manager directory EXCLUSIVE to this HOME (~/.volta/bin) printing a unique marker,
// then run run-node.sh in an IMPOVERISHED PATH (minimalPathEnv → PATH="").
// Since `add` prepends, ~/.volta/bin ends up at the HEAD of PATH (after the system
// directories) → it's THAT node that must run. If the marker prints, Volta support
// is proven; otherwise the test fails (a system node would have won).
// POSIX only (run-node.sh).
test(
  "run-node.sh: the broadened coverage (Volta) resolves node from a hermetic HOME",
  { skip: process.platform === "win32" ? "POSIX only" : false },
  () => {
    const home = mkdtempSync(join(tmpdir(), "run-node-home-"));
    try {
      const voltaBin = join(home, ".volta", "bin");
      mkdirSync(voltaBin, { recursive: true });
      const fakeNode = join(voltaBin, "node");
      writeFileSync(fakeNode, "#!/bin/sh\necho VOLTA_NODE_MARKER\n", { mode: 0o755 });

      const script = join(home, "run-node.sh");
      writeFileSync(script, buildNodeRunnerSh());

      const out = execFileSync("/bin/sh", [script, "-e", "0"], {
        encoding: "utf8",
        env: minimalPathEnv("darwin", { HOME: home }), // PATH="" → node can come ONLY from the self-heal
      });
      assert.match(out, /VOLTA_NODE_MARKER/); // it's indeed the node from ~/.volta/bin that ran
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);
