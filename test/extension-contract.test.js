import test from "node:test";
import assert from "node:assert/strict";
import { bearerMatches, normalizeExtensionBatch, normalizeExtensionEnvelope, normalizeExtensionListing } from "../src/extension-contract.js";

const sample = {
  sourceId: "leboncoin",
  externalId: "1234567890",
  sourceUrl: "https://www.leboncoin.fr/ad/ventes_immobilieres/1234567890",
  title: "Appartement 2 pièces à rénover",
  askingPrice: "89 000 €",
  surfaceM2: "42,5 m²",
  city: "Orléans",
  sellerType: "private"
};

test("normalizes a browser extension listing", () => {
  const listing = normalizeExtensionListing(sample, "2026-09-18T10:00:00.000Z");
  assert.equal(listing.askingPrice, 89000);
  assert.equal(listing.surfaceM2, 42.5);
  assert.equal(listing.sourceId, "leboncoin");
  assert.equal(listing.sellerType, "private");
  assert.equal(listing.fingerprint.length, 64);
});

test("deduplicates listings within a batch", () => {
  const listings = normalizeExtensionBatch({ listings: [sample, { ...sample, title: "Copie" }] });
  assert.equal(listings.length, 1);
});

test("rejects incomplete listings", () => {
  assert.throws(() => normalizeExtensionListing({ sourceId: "leboncoin" }), /Annonce invalide/);
});

test("compares bearer tokens safely", () => {
  assert.equal(bearerMatches("Bearer secret", "secret"), true);
  assert.equal(bearerMatches("Bearer wrong", "secret"), false);
});

test("keeps multi-app routing context separate from listing data", () => {
  const envelope = normalizeExtensionEnvelope({
    context: {
      appId: "radar-immo",
      workspaceId: "sologne",
      searchId: "orleans-small-flats",
      runId: "run-1",
      sourceId: "leboncoin",
      searchUrl: "https://www.leboncoin.fr/recherche?category=9"
    },
    listings: [sample]
  }, "2026-09-19T10:00:00.000Z");
  assert.equal(envelope.context.appId, "radar-immo");
  assert.equal(envelope.context.workspaceId, "sologne");
  assert.equal(envelope.listings.length, 1);
});

test("redacts contact details possibly present in visible text", () => {
  const listing = normalizeExtensionListing({
    ...sample,
    description: "Appelez le 06 12 34 56 78 ou écrivez à vendeur@example.com",
    rawText: "Contact +33 6 12 34 56 78"
  });
  assert.match(listing.description, /email masqué/);
  assert.match(listing.description, /téléphone masqué/);
  assert.doesNotMatch(listing.rawText, /12 34 56 78/);
});

test("rejects a batch routed under a different source", () => {
  assert.throws(() => normalizeExtensionEnvelope({
    context: {
      appId: "radar-immo",
      workspaceId: "sologne",
      searchId: "s1",
      runId: "run-1",
      sourceId: "seloger",
      searchUrl: "https://www.seloger.com/recherche/achat"
    },
    listings: [sample]
  }), /sourceId/);
});
