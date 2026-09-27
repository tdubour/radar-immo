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
Maison
Prix m2 moyen
988 €
Loyer mensuel au Blanc (36300)
Appartement
Loyer mensuel/m2 moyen
10,3 €
Maison
Loyer mensuel/m2 moyen
10,6 €
Estimez un bien en ligne
` } };
  const result = extractMeilleursAgentsMarket(document, "https://www.meilleursagents.com/prix-immobilier/le-blanc-36300/");
  assert.equal(result.city, "Blanc");
  assert.equal(result.postalCode, "36300");
  assert.equal(result.apartment.salePriceM2, 1035);
  assert.equal(result.house.salePriceM2, 988);
  assert.equal(result.apartment.rentM2, 10.3);
  assert.equal(result.house.rentM2, 10.6);
});
