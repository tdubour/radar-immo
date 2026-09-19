import test from "node:test";
import assert from "node:assert/strict";
import { canonicalListingKey, makeEnvelope, normalizeApp, normalizeSearch } from "../extension/src/model.js";

const app = normalizeApp({ id: "Radar-Immo", label: "Radar", workspaceId: "sologne", ingestUrl: "https://example.com/api/ingest", token: "secret" });

test("normalizes an application destination", () => {
  assert.equal(app.id, "radar-immo");
  assert.equal(app.workspaceId, "sologne");
});

test("one search can target several applications", () => {
  const search = normalizeSearch({
    id: "small-flats",
    label: "Petites surfaces",
    url: "https://www.leboncoin.fr/recherche?category=9",
    sourceId: "leboncoin",
    appIds: ["radar-immo", "berrypilot"],
    intervalMinutes: 10
  }, ["radar-immo", "berrypilot"]);
  assert.deepEqual(search.appIds, ["radar-immo", "berrypilot"]);
  assert.equal(search.intervalMinutes, 30);
});

test("builds a routed envelope without putting secrets in it", () => {
  const search = { id: "s1", sourceId: "leboncoin", url: "https://www.leboncoin.fr/recherche", appIds: [app.id] };
  const listing = { sourceId: "leboncoin", externalId: "42", sourceUrl: "https://www.leboncoin.fr/ad/ventes_immobilieres/42", title: "T2", askingPrice: 80000 };
  const envelope = makeEnvelope({ app, search, runId: "run-1", listings: [listing], capturedAt: "2026-09-19T10:00:00.000Z" });
  assert.equal(envelope.context.appId, "radar-immo");
  assert.equal(envelope.token, undefined);
  assert.equal(canonicalListingKey(listing), "leboncoin:42");
});
