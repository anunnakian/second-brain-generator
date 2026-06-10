import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeEmbedder } from "./fake-embedder.js";

test("FakeEmbedder: discriminates two texts and carries the dimension via its identity", async () => {
  const embedder = new FakeEmbedder(8);

  const pelagie = await embedder.embedQuery("Pélagie de Mollecuisse");
  const autre = await embedder.embedQuery("something else entirely");

  // What makes a fake usable as a double: two different texts yield two
  // different vectors (otherwise retrieval would match everything).
  assert.notDeepEqual(pelagie, autre);
  // It stays deterministic: no network, no key, a pure function.
  assert.deepEqual(pelagie, await embedder.embedQuery("Pélagie de Mollecuisse"));
  // The dimension produced IS the one announced by the identity (the swap pivot).
  assert.equal(pelagie.length, embedder.identity.dimension);
});
