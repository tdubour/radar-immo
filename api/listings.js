import { db } from "./lib/db.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  try {
    const rows = await db.select("radar_listings", "select=*&active=eq.true&order=last_seen_at.desc&limit=500");
    const listings = rows.map((row) => ({
      id: row.id, sourceId: row.source_id, externalId: row.external_id, sourceUrl: row.source_url,
      title: row.title, description: row.description, city: row.city, postalCode: row.postal_code,
      distanceKm: row.distance_km, cityPopulation: row.city_population, propertyType: row.property_type,
      sellerType: row.seller_type, askingPrice: row.asking_price, surfaceM2: row.surface_m2,
      rooms: row.rooms, dpe: row.dpe, publishedAt: row.published_at, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at
    }));
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    return response.status(200).json({ listings, count: listings.length });
  } catch (error) { return response.status(503).json({ error: "Radar database unavailable", detail: error.message }); }
}
