import test from "node:test";
import assert from "node:assert/strict";
import { extractExternalId, inferFields, parseFrenchNumber } from "../extension/src/adapters.js";
import { isListingUrl, sourceFromUrl } from "../extension/src/catalog.js";

test("detects the five supported portals", () => {
  assert.equal(sourceFromUrl("https://www.leboncoin.fr/recherche?category=9"), "leboncoin");
  assert.equal(sourceFromUrl("https://www.seloger.com/recherche/achat"), "seloger");
  assert.equal(sourceFromUrl("https://www.bienici.com/recherche/achat"), "bienici");
  assert.equal(sourceFromUrl("https://www.pap.fr/annonce/vente"), "pap");
  assert.equal(sourceFromUrl("https://www.logic-immo.com/vente-immobilier"), "logic-immo");
});

test("parses French real-estate card values", () => {
  const fields = inferFields("Appartement à rénover 42,5 m² 2 pièces 1 chambre DPE E 89 000 € 45000 particulier");
  assert.equal(fields.askingPrice, 89000);
  assert.equal(fields.surfaceM2, 42.5);
  assert.equal(fields.rooms, 2);
  assert.equal(fields.bedrooms, 1);
  assert.equal(fields.dpe, "E");
  assert.equal(fields.hasWorksSignal, true);
  assert.equal(fields.sellerType, "private");
});

test("recognizes listing links and stable external ids", () => {
  const url = "https://www.leboncoin.fr/ad/ventes_immobilieres/2945678123";
  assert.equal(isListingUrl("leboncoin", url), true);
  assert.equal(extractExternalId(url), "2945678123");
  assert.equal(parseFrenchNumber("125 500 €"), 125500);
  const logicUrl = "https://www.logic-immo.com/detail-vente-271905933.htm";
  assert.equal(isListingUrl("logic-immo", logicUrl), true);
  assert.equal(extractExternalId(logicUrl), "271905933");
  assert.equal(isListingUrl("logic-immo", "https://www.logic-immo.com/detail-annonce/vente/centre-val-de-loire/loir-et-cher-41/chaumont-sur-tharonne-41600/269YI2AE6N73"), true);
  assert.equal(isListingUrl("logic-immo", "https://www.logic-immo.com/wl-cdp/26EXCK96LWNL"), true);
});
