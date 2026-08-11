import { createHash } from "node:crypto";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const number = (value) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export function fingerprint(sourceId, externalId, url, title, city, price, surface) {
  const identity = externalId ? `${sourceId}:${externalId}` : `${sourceId}|${url || ""}|${title}|${city}|${price}|${surface}`;
  return createHash("sha256").update(identity.toLowerCase()).digest("hex");
}

export function normalizeListing(input, sourceId) {
  const title = clean(input.title || input.name);
  const sourceUrl = clean(input.sourceUrl || input.url);
  const askingPrice = number(input.askingPrice ?? input.price);
  const surfaceM2 = number(input.surfaceM2 ?? input.surface);
  if (!title || !sourceUrl || !askingPrice) return null;
  const externalId = clean(input.externalId || input.id) || null;
  return {
    fingerprint: fingerprint(sourceId, externalId, sourceUrl, title, input.city, askingPrice, surfaceM2),
    source_id: sourceId,
    external_id: externalId,
    source_url: sourceUrl,
    title,
    description: clean(input.description) || null,
    city: clean(input.city) || null,
    postal_code: clean(input.postalCode) || null,
    latitude: number(input.latitude), longitude: number(input.longitude), distance_km: number(input.distanceKm),
    city_population: number(input.cityPopulation), property_type: clean(input.propertyType) || null,
    seller_type: ["private", "agency"].includes(input.sellerType) ? input.sellerType : "unknown",
    asking_price: askingPrice, surface_m2: surfaceM2, rooms: number(input.rooms), dpe: clean(input.dpe) || null,
    published_at: input.publishedAt || null, last_seen_at: new Date().toISOString(), active: true,
    raw_data: input
  };
}
