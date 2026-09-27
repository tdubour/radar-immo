import test from "node:test";
import assert from "node:assert/strict";
import { extractMeilleursAgentsMarket } from "../extension/src/meilleursagents.js";

test("extracts sale and rent references by property type", () => {
  const document = { body: { innerText: `
Prix immobilier au Blanc (36300)
Estimations de prix MeilleursAgents au 1 septembre 2026.
Appartement
Prix m2 moyen
1 035 €
de 589 € à 1 714 €
Maison
Prix m2 moyen
988 €
de 395 € à 1 845 €
Loyer mensuel au Blanc (36300)
Appartement
Loyer mensuel/m2 moyen
10,3 €
de 6,5 € à 17,5 €
Maison
Loyer mensuel/m2 moyen
10,6 €
de 7,3 € à 14,2 €
Estimez un bien en ligne
` } };
  const result = extractMeilleursAgentsMarket(document, "https://www.meilleursagents.com/prix-immobilier/le-blanc-36300/");
  assert.equal(result.city, "Blanc");
  assert.equal(result.postalCode, "36300");
  assert.equal(result.apartment.salePriceM2, 1035);
  assert.equal(result.house.salePriceM2, 988);
  assert.equal(result.apartment.rentM2, 10.3);
  assert.equal(result.house.rentM2, 10.6);
  assert.deepEqual([result.apartment.saleLowM2, result.apartment.saleHighM2], [589, 1714]);
  assert.deepEqual([result.house.saleLowM2, result.house.saleHighM2], [395, 1845]);
  assert.deepEqual([result.apartment.rentLowM2, result.apartment.rentHighM2], [6.5, 17.5]);
  assert.deepEqual([result.house.rentLowM2, result.house.rentHighM2], [7.3, 14.2]);
});
