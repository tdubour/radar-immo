import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultRadarConfig, dedupeCandidates, evaluateCandidate, isInSearchArea } from "../src/radar.js";

test("search area includes the main radius and large extended cities", () => {
  const config = createDefaultRadarConfig();
  assert.equal(isInSearchArea({ distanceKm: 90, cityPopulation: 500 }, config), true);
  assert.equal(isInSearchArea({ distanceKm: 130, cityPopulation: 15000 }, config), true);
  assert.equal(isInSearchArea({ distanceKm: 130, cityPopulation: 9000 }, config), false);
});

test("candidate requires at least 100 euros after-tax monthly cashflow", () => {
  const config = createDefaultRadarConfig();
  assert.equal(evaluateCandidate({ distanceKm: 50, cashflowAfterTaxMonthly: 99 }, config).qualified, false);
  assert.equal(evaluateCandidate({ distanceKm: 50, cashflowAfterTaxMonthly: 100 }, config).qualified, true);
});

test("private sellers receive a ranking advantage", () => {
  const config = createDefaultRadarConfig();
  const base = { distanceKm: 50, cashflowAfterTaxMonthly: 200, bankabilityScore: 70, dataConfidence: .8 };
  assert.ok(evaluateCandidate({ ...base, sellerType: "private" }, config).score > evaluateCandidate({ ...base, sellerType: "agency" }, config).score);
});

test("deduplication keeps one source listing", () => {
  const rows = [{ sourceId: "pap", externalId: "1" }, { sourceId: "pap", externalId: "1" }];
  assert.equal(dedupeCandidates(rows).length, 1);
});
