import { normalizeListing } from "./normalize.js";

const TIMEOUT_MS = 12000;

function walk(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) { value.forEach((child) => walk(child, output)); return output; }
  const offer = value.offers || value.offer;
  const address = value.address || value.location?.address;
  if ((value.url || value.mainEntityOfPage) && (offer?.price || value.price) && (value.name || value.headline)) {
    output.push({
      title: value.name || value.headline, description: value.description,
      url: typeof value.url === "string" ? value.url : value.mainEntityOfPage,
      price: offer?.price || value.price, surface: value.floorSize?.value || value.floorSize,
      rooms: value.numberOfRooms, city: address?.addressLocality, postalCode: address?.postalCode,
      latitude: value.geo?.latitude, longitude: value.geo?.longitude,
      publishedAt: value.datePosted, propertyType: value["@type"]
    });
  }
  Object.values(value).forEach((child) => walk(child, output));
  return output;
}

function parseJsonLd(html) {
  const rows = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    try { walk(JSON.parse(match[1]), rows); } catch { /* malformed publisher payload */ }
  }
  return rows;
}

async function publicPageConnector(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(source.url, { signal: controller.signal, headers: { "User-Agent": "RadarImmo/1.0 (+https://radar-immo-blond.vercel.app; low-frequency research collector)", Accept: "text/html,application/xhtml+xml" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    return parseJsonLd(html).map((row) => normalizeListing(row, source.id)).filter(Boolean);
  } finally { clearTimeout(timeout); }
}

export async function collectApifyBatch() {
  if (!process.env.APIFY_TOKEN || !process.env.APIFY_START_URLS_JSON) return [];
  const startUrls = JSON.parse(process.env.APIFY_START_URLS_JSON);
  if (!Array.isArray(startUrls) || !startUrls.length) return [];
  const actor = process.env.APIFY_ACTOR_ID || "dltik~pige-immo-fr-scraper";
  const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?clean=true&format=json&token=${encodeURIComponent(process.env.APIFY_TOKEN)}&timeout=240`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources: ["leboncoin", "seloger", "bienici", "pap"], startUrls, maxItems: Number(process.env.APIFY_MAX_ITEMS || 1000) }) });
  if (!response.ok) throw new Error(`Apify HTTP ${response.status}`);
  const rows = await response.json();
  return rows.map((row) => normalizeListing(row, String(row.source || row.sourceId || "multi-source").toLowerCase())).filter(Boolean);
}

export const sources = [
  { id: "pap", label: "PAP", kind: "page", url: process.env.SOURCE_URL_PAP },
  { id: "paruvendu", label: "ParuVendu", kind: "page", url: process.env.SOURCE_URL_PARUVENDU },
  { id: "geolocaux", label: "Geolocaux", kind: "page", url: process.env.SOURCE_URL_GEOLOCAUX },
  { id: "bureauxlocaux", label: "BureauxLocaux", kind: "page", url: process.env.SOURCE_URL_BUREAUXLOCAUX }
];

export async function collectSource(source) {
  if (!source.url) return [];
  return publicPageConnector(source);
}
