import { createHash, timingSafeEqual } from "node:crypto";

export const EXTENSION_CONTRACT_VERSION = 1;
export const MAX_EXTENSION_BATCH_SIZE = 100;

const clean = (value, max = 2000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const redactContacts = (value, max) => clean(value, max)
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email masqué]")
  .replace(/(?<!\d)(?:\+33[ .-]?|0)[1-9](?:[ .-]?\d{2}){4}(?!\d)/g, "[téléphone masqué]");
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeExtensionListing(input, receivedAt = new Date().toISOString()) {
  const sourceId = clean(input?.sourceId, 80).toLowerCase();
  const sourceUrl = safeUrl(input?.sourceUrl);
  const title = clean(input?.title, 300);
  const askingPrice = numberOrNull(input?.askingPrice);
  const surfaceM2 = numberOrNull(input?.surfaceM2);
  if (!sourceId || !sourceUrl || !title || !askingPrice || askingPrice < 1000) {
    throw new Error("Annonce invalide : sourceId, sourceUrl, title et askingPrice sont obligatoires");
  }
  const externalId = clean(input?.externalId, 160) || null;
  const fingerprintSeed = externalId ? `${sourceId}:${externalId}` : `${sourceId}:${sourceUrl}`;
  return {
    contractVersion: EXTENSION_CONTRACT_VERSION,
    fingerprint: createHash("sha256").update(fingerprintSeed).digest("hex"),
    sourceId,
    externalId,
    sourceUrl,
    title,
    description: redactContacts(input?.description, 5000),
    askingPrice,
    surfaceM2,
    rooms: numberOrNull(input?.rooms),
    bedrooms: numberOrNull(input?.bedrooms),
    postalCode: clean(input?.postalCode, 10) || null,
    city: clean(input?.city, 120) || null,
    district: clean(input?.district, 160) || null,
    propertyType: clean(input?.propertyType, 100) || null,
    dpe: /^[A-G]$/i.test(clean(input?.dpe, 1)) ? clean(input.dpe, 1).toUpperCase() : null,
    sellerType: ["private", "agency", "unknown"].includes(input?.sellerType) ? input.sellerType : "unknown",
    publishedAt: input?.publishedAt ? clean(input.publishedAt, 40) : null,
    capturedAt: input?.capturedAt ? clean(input.capturedAt, 40) : receivedAt,
    receivedAt,
    hasWorksSignal: Boolean(input?.hasWorksSignal),
    rawText: redactContacts(input?.rawText, 8000)
  };
}

export function normalizeExtensionBatch(body, receivedAt = new Date().toISOString()) {
  const rows = Array.isArray(body?.listings) ? body.listings : [];
  if (!rows.length || rows.length > MAX_EXTENSION_BATCH_SIZE) {
    throw new Error(`Le lot doit contenir entre 1 et ${MAX_EXTENSION_BATCH_SIZE} annonces`);
  }
  const normalized = rows.map((row) => normalizeExtensionListing(row, receivedAt));
  return [...new Map(normalized.map((row) => [row.fingerprint, row])).values()];
}

export function normalizeExtensionContext(input, receivedAt = new Date().toISOString()) {
  const appId = clean(input?.appId, 80).toLowerCase();
  const workspaceId = clean(input?.workspaceId, 120);
  const searchId = clean(input?.searchId, 120);
  const runId = clean(input?.runId, 160);
  const sourceId = clean(input?.sourceId, 80).toLowerCase();
  const searchUrl = safeUrl(input?.searchUrl);
  if (!appId || !workspaceId || !searchId || !runId || !sourceId || !searchUrl) {
    throw new Error("Contexte invalide : appId, workspaceId, searchId, runId, sourceId et searchUrl sont obligatoires");
  }
  return {
    appId,
    workspaceId,
    searchId,
    runId,
    sourceId,
    searchUrl,
    capturedAt: input?.capturedAt ? clean(input.capturedAt, 40) : receivedAt
  };
}

export function normalizeExtensionEnvelope(body, receivedAt = new Date().toISOString()) {
  const context = normalizeExtensionContext(body?.context, receivedAt);
  const listings = normalizeExtensionBatch(body, receivedAt);
  if (listings.some((listing) => listing.sourceId !== context.sourceId)) {
    throw new Error("Le sourceId des annonces doit correspondre au contexte de recherche");
  }
  return {
    contractVersion: EXTENSION_CONTRACT_VERSION,
    context,
    listings
  };
}

export function bearerMatches(header, expected) {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
