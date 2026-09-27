import test from "node:test";
import assert from "node:assert/strict";
import { enrichRadarEstimates, isLandListing, isProfessionalListing, quickEstimateListing } from "../src/radar-estimator.js";

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
  assert.equal(result.quickProject.financing.downPayment, 1500);
  assert.equal(result.quickProject.financing.durationYears, 25);
  assert.equal(result.quickProject.longTerm.vacancyMonths, 1);
  assert.equal(result.quickProject.longTerm.vacancyPct, 0);
  assert.equal(result.quickProject.projection.years, 25);
});

test("demo listings are removed before analysis", () => {
  const result = enrichRadarEstimates([
    ...rows,
    { ...rows[0], fingerprint: "demo", sourceId: "demo", title: "Bien exemple" },
    { ...rows[0], fingerprint: "source", title: "Appartement Orléans La Source Université" },
    { ...rows[0], fingerprint: "new", title: "Programme neuf à Bourges" }
  ]);
  assert.equal(result.length, 3);
});

test("land listings are excluded without rejecting homes that mention their plot", () => {
  const land = { ...rows[0], fingerprint: "land", propertyType: "Terrain", title: "Terrain constructible 6233 m²" };
  const activityLand = { ...rows[0], fingerprint: "activity-land", propertyType: null, title: "Terrain d'activité à vendre Jargeau" };
  const house = { ...rows[0], fingerprint: "house", propertyType: "Maison", title: "Maison sur terrain de 900 m²" };
  assert.equal(isLandListing(land), true);
  assert.equal(isLandListing(activityLand), true);
  assert.equal(isLandListing(house), false);
  const result = enrichRadarEstimates([land, activityLand, house]);
  assert.deepEqual(result.map((item) => item.fingerprint), ["house"]);
});

test("warehouses and professional premises are excluded from residential valuations", () => {
  const warehouse = { ...rows[0], fingerprint: "warehouse", propertyType: "Entrepôt", title: "Entrepôt 800 m²" };
  const commercial = { ...rows[0], fingerprint: "commercial", propertyType: null, title: "Vente local commercial 120 m²" };
  const homeOffice = { ...rows[0], fingerprint: "home-office", propertyType: "Maison", title: "Maison avec bureau et jardin" };
  assert.equal(isProfessionalListing(warehouse), true);
  assert.equal(isProfessionalListing(commercial), true);
  assert.equal(isProfessionalListing(homeOffice), false);
  const result = enrichRadarEstimates([warehouse, commercial, homeOffice]);
  assert.deepEqual(result.map((item) => item.fingerprint), ["home-office"]);
});

test("price history exposes the previous price", () => {
  const result = quickEstimateListing({ ...rows[0], askingPrice: 75000, priceHistory: [{ observedAt: "2026-09-01", askingPrice: 80000 }, { observedAt: "2026-09-20", askingPrice: 75000 }] }, rows);
  assert.equal(result.previousPrice, 80000);
  assert.equal(result.priceChange, -5000);
});

test("uses a dated MeilleursAgents commune reference before listing medians", () => {
  const references = {
    "blois:41000": {
      source: "meilleursagents",
      sourceUrl: "https://www.meilleursagents.com/prix-immobilier/blois-41000/",
      observedAt: "2026-09-27T02:00:00.000Z",
      apartment: { salePriceM2: 1800, rentM2: 12 },
      house: { salePriceM2: 1600, rentM2: 10 }
    }
  };
  const result = quickEstimateListing(rows[0], rows, references);
  assert.equal(result.averagePriceM2, 1800);
  assert.equal(result.marketSource, "meilleursagents");
  assert.equal(result.estimatedMonthlyRent, 480);
  assert.equal(result.comparableScope, "commune");
});
