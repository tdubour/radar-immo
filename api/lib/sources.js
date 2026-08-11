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

async function apifyConnector(source) {
  if (!process.env.APIFY_TOKEN || !source.apifyDatasetId) return [];
  const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(source.apifyDatasetId)}/items?clean=true&format=json&limit=1000&token=${encodeURIComponent(process.env.APIFY_TOKEN)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Apify HTTP ${response.status}`);
  const rows = await response.json();
  return rows.map((row) => normalizeListing(row, source.id)).filter(Boolean);
}

export const sources = [
  { id: "leboncoin", label: "Leboncoin", kind: "apify", apifyDatasetId: process.env.APIFY_DATASET_LEBONCOIN },
  { id: "seloger", label: "SeLoger", kind: "apify", apifyDatasetId: process.env.APIFY_DATASET_SELOGER },
  { id: "bienici", label: "Bien’ici", kind: "apify", apifyDatasetId: process.env.APIFY_DATASET_BIENICI },
  { id: "pap", label: "PAP", kind: "page", url: process.env.SOURCE_URL_PAP },
  { id: "paruvendu", label: "ParuVendu", kind: "page", url: process.env.SOURCE_URL_PARUVENDU },
  { id: "geolocaux", label: "Geolocaux", kind: "page", url: process.env.SOURCE_URL_GEOLOCAUX },
  { id: "bureauxlocaux", label: "BureauxLocaux", kind: "page", url: process.env.SOURCE_URL_BUREAUXLOCAUX }
];

export async function collectSource(source) {
  if (source.kind === "apify") return apifyConnector(source);
  if (!source.url) return [];
  return publicPageConnector(source);
}
