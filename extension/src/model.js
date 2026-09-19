import { sourceFromUrl } from "./catalog.js";

const clean = (value, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function newId(prefix = "item") {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function normalizeApp(input) {
  const id = clean(input?.id, 80).toLowerCase();
  const workspaceId = clean(input?.workspaceId, 120);
  let ingestUrl;
  try {
    ingestUrl = new URL(input?.ingestUrl).toString();
  } catch {
    throw new Error("URL d’ingestion invalide");
  }
  if (!id || !workspaceId || !clean(input?.token, 1000)) throw new Error("Application, espace et jeton obligatoires");
  if (!/^https?:$/.test(new URL(ingestUrl).protocol)) throw new Error("Seuls HTTP et HTTPS sont autorisés");
  return {
    id,
    label: clean(input?.label || id, 120),
    workspaceId,
    ingestUrl,
    token: clean(input.token, 1000),
    enabled: input?.enabled !== false
  };
}

export function normalizeSearch(input, knownAppIds = []) {
  const id = clean(input?.id, 120) || newId("search");
  let url;
  try {
    url = new URL(input?.url).toString();
  } catch {
    throw new Error("URL de recherche invalide");
  }
  const sourceId = clean(input?.sourceId || sourceFromUrl(url), 80).toLowerCase();
  if (!sourceId || sourceFromUrl(url) !== sourceId) throw new Error("La source ne correspond pas à l’URL");
  const appIds = [...new Set((input?.appIds || []).map((value) => clean(value, 80).toLowerCase()))].filter((value) => knownAppIds.includes(value));
  if (!appIds.length) throw new Error("Choisis au moins une application destinataire");
  return {
    id,
    label: clean(input?.label || id, 160),
    sourceId,
    url,
    appIds,
    enabled: input?.enabled !== false,
    intervalMinutes: Math.max(30, Math.round(Number(input?.intervalMinutes) || 1440)),
    closeTabAfterCapture: input?.closeTabAfterCapture !== false
  };
}

export function searchMatchesUrl(search, value) {
  try {
    const current = new URL(value);
    const configured = new URL(search.url);
    return search.sourceId === sourceFromUrl(value) && current.origin === configured.origin;
  } catch {
    return false;
  }
}

export function makeEnvelope({ app, search, runId, listings, capturedAt = new Date().toISOString() }) {
  return {
    context: {
      appId: app.id,
      workspaceId: app.workspaceId,
      searchId: search.id,
      runId,
      sourceId: search.sourceId,
      searchUrl: search.url,
      capturedAt
    },
    listings
  };
}

export function canonicalListingKey(listing) {
  return `${listing.sourceId}:${listing.externalId || listing.sourceUrl}`;
}
