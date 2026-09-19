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
  assert.equal(first.searches.length, 22);
  assert.equal(first.searches.filter((item) => item.sourceId === "seloger").length, 6);
  assert.equal(first.searches.filter((item) => item.sourceId === "logic-immo").length, 6);
  assert.ok(first.searches.filter((item) => ["seloger", "logic-immo"].includes(item.sourceId)).every((item) => item.url.includes("order=DateDesc")));
});

test("replaces the narrow Orléans defaults without deleting custom searches", () => {
  const merged = mergeRadarDefaults({
    defaultsVersion: 1,
    apps: [],
    searches: [
      { id: "radar-seloger-orleans-bannier", sourceId: "seloger", url: "https://www.seloger.com/ancienne-recherche", appIds: ["radar-immo"] },
      { id: "my-custom-search", sourceId: "seloger", url: "https://www.seloger.com/ma-recherche", appIds: ["radar-immo"] }
    ]
  });

  assert.equal(merged.defaultsVersion, 2);
  assert.equal(merged.searches.some((item) => item.id === "radar-seloger-orleans-bannier"), false);
  assert.equal(merged.searches.some((item) => item.id === "my-custom-search"), true);
  assert.equal(merged.searches.filter((item) => item.sourceId === "seloger").length, 7);
});
