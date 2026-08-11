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
  const title = clean(input.title || input.name || input.headline);
  const sourceUrl = clean(input.sourceUrl || input.url || input.link || input.adUrl);
  const askingPrice = number(input.askingPrice ?? input.price ?? input.priceValue);
  const surfaceM2 = number(input.surfaceM2 ?? input.surface ?? input.livingArea ?? input.area);
  if (!title || !sourceUrl || !askingPrice) return null;
  const externalId = clean(input.externalId || input.id) || null;
  return {
    fingerprint: fingerprint(sourceId, externalId, sourceUrl, title, input.city, askingPrice, surfaceM2),
    source_id: sourceId,
    external_id: externalId,
    source_url: sourceUrl,
    title,
    description: clean(input.description) || null,
    city: clean(input.city || input.location?.city || input.address?.city) || null,
    postal_code: clean(input.postalCode || input.zipCode || input.location?.postalCode || input.address?.postalCode) || null,
    latitude: number(input.latitude ?? input.location?.latitude ?? input.coordinates?.lat), longitude: number(input.longitude ?? input.location?.longitude ?? input.coordinates?.lng), distance_km: number(input.distanceKm),
    city_population: number(input.cityPopulation), property_type: clean(input.propertyType) || null,
    seller_type: ["private", "particulier"].includes(String(input.sellerType || input.ownerType).toLowerCase()) ? "private" : ["agency", "pro", "professional"].includes(String(input.sellerType || input.ownerType).toLowerCase()) ? "agency" : "unknown",
    asking_price: askingPrice, surface_m2: surfaceM2, rooms: number(input.rooms), dpe: clean(input.dpe) || null,
    published_at: input.publishedAt || input.datePosted || input.publicationDate || null, last_seen_at: new Date().toISOString(), active: true,
    raw_data: input
  };
}
