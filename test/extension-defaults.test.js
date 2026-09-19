import test from "node:test";
import assert from "node:assert/strict";
import { mergeRadarDefaults, RADAR_DEFAULT_SEARCHES } from "../extension/src/defaults.js";

test("seeds Radar Immo and the five priority portals without duplicates", () => {
  const first = mergeRadarDefaults({ apps: [], searches: [] });
  const second = mergeRadarDefaults(first);
  assert.equal(first.apps.length, 1);
  assert.equal(first.apps[0].transport, "local");
  assert.equal(first.searches.length, RADAR_DEFAULT_SEARCHES.length);
  assert.equal(second.searches.length, first.searches.length);
  assert.deepEqual([...new Set(first.searches.map((item) => item.sourceId))].sort(), ["bienici", "leboncoin", "logic-immo", "pap", "seloger"]);
});
