import test from "node:test";
import assert from "node:assert/strict";
import { enrichRadarEstimates, quickEstimateListing } from "../src/radar-estimator.js";

const rows = [
  { fingerprint: "a", sourceId: "bienici", sourceUrl: "https://www.bienici.com/annonce/a", title: "Appartement 2 pièces 40 m²", city: "Blois", postalCode: "41000", askingPrice: 80000, surfaceM2: 40, rooms: 2 },
  { fingerprint: "b", sourceId: "bienici", sourceUrl: "https://www.bienici.com/annonce/b", title: "Appartement 2 pièces 45 m²", city: "Blois", postalCode: "41000", askingPrice: 99000, surfaceM2: 45, rooms: 2 },
  { fingerprint: "c", sourceId: "pap", sourceUrl: "https://www.pap.fr/annonces/c", title: "Appartement 3 pièces 50 m²", city: "Blois", postalCode: "41000", askingPrice: 115000, surfaceM2: 50, rooms: 3 }
];

test("quick estimator calculates market comparison and three strategies", () => {
  const result = quickEstimateListing(rows[0], rows);
  assert.equal(Math.round(result.pricePerM2), 2000);
  assert.equal(result.comparableScope, "ville");
  assert.ok(Number.isFinite(result.longTermCashflowMonthly));
  assert.ok(Number.isFinite(result.shortTermCashflowMonthly));
  assert.ok(Number.isFinite(result.estimatedResaleProfit));
  assert.ok(result.quickProject.acquisition.purchasePrice === 80000);
});

test("demo listings are removed before analysis", () => {
  const result = enrichRadarEstimates([...rows, { ...rows[0], fingerprint: "demo", sourceId: "demo", title: "Bien exemple" }]);
  assert.equal(result.length, 3);
});

test("price history exposes the previous price", () => {
  const result = quickEstimateListing({ ...rows[0], askingPrice: 75000, priceHistory: [{ observedAt: "2026-09-01", askingPrice: 80000 }, { observedAt: "2026-09-20", askingPrice: 75000 }] }, rows);
  assert.equal(result.previousPrice, 80000);
  assert.equal(result.priceChange, -5000);
});

