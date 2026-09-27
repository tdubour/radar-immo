import test from "node:test";
import assert from "node:assert/strict";
import { selectChatContext } from "../src/chat-context.js";

const listings = Array.from({ length: 70 }, (_, index) => ({
  title: `Maison ${index + 1}`,
  city: "Blois",
  postalCode: "41000",
  sourceUrl: `https://example.com/${index + 1}`
}));

listings[64] = {
  title: "Maison 8 pièces 230 m² 37310 Courçay",
  city: "Courçay",
  postalCode: "37310",
  sourceUrl: "https://www.bienici.com/annonce/vente/courcay/maison/8pieces/iad-france-2019426?q=x"
};

test("places a title match beyond the first 50 listings at the front", () => {
  const selected = selectChatContext(listings, "Analyse Maison 8 pièces 230 m² 37310 Courçay", 50);
  assert.equal(selected[0].postalCode, "37310");
  assert.equal(selected.length, 50);
});

test("finds a listing from its full source URL", () => {
  const selected = selectChatContext(listings, listings[64].sourceUrl, 50);
  assert.equal(selected[0].title, listings[64].title);
});
