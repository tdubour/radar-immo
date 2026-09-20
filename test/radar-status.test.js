import test from "node:test";
import assert from "node:assert/strict";
import { mergeExtensionSourceStatuses, sourceStatusText } from "../src/radar-status.js";

test("an extension collection replaces a blocked server status", () => {
  const result = mergeExtensionSourceStatuses([
    { id: "leboncoin", label: "Leboncoin", ok: false, count: 0, error: "HTTP 403" },
    { id: "bienici-41", label: "Bien'ici", ok: true, count: 12 }
  ], {
    listings: [{ sourceId: "leboncoin" }, { sourceId: "leboncoin" }], searches: [], runs: {}
  });
  assert.deepEqual(result[0], { id: "leboncoin", label: "Leboncoin", ok: true, count: 2, error: undefined, collector: "extension" });
  assert.equal(result[1].count, 12);
});

test("a completed empty extension run is available with zero results", () => {
  const [status] = mergeExtensionSourceStatuses([
    { id: "seloger", label: "SeLoger", ok: false, count: 0, error: "HTTP 403" }
  ], {
    listings: [], searches: [{ id: "search-1", sourceId: "seloger" }], runs: { "search-1": { at: "2026-09-20T10:00:00.000Z", found: 0 } }
  });
  assert.equal(status.ok, true);
  assert.equal(status.count, 0);
  assert.equal(status.collector, "extension");
});

test("keeps a useful failure message", () => {
  assert.equal(sourceStatusText({ ok: false, error: "Bloqué par le portail (HTTP 403)" }), "Bloqué par le portail (HTTP 403)");
});
