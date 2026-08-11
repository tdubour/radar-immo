import { db } from "../lib/db.js";
import { collectSource, sources } from "../lib/sources.js";

export const config = { maxDuration: 300 };

async function saveListings(rows) {
  if (!rows.length) return { seen: 0, added: 0 };
  const fingerprints = rows.map((row) => `"${row.fingerprint}"`).join(",");
  const existing = await db.select("radar_listings", `select=id,fingerprint,asking_price&fingerprint=in.(${encodeURIComponent(fingerprints)})`);
  const prior = new Map(existing.map((row) => [row.fingerprint, row]));
  const saved = await db.upsert("radar_listings", rows, "fingerprint");
  const prices = saved.filter((row) => row.asking_price != null).map((row) => ({ listing_id: row.id, asking_price: row.asking_price }));
  if (prices.length) await db.upsert("radar_price_history", prices, "listing_id,asking_price");
  return { seen: rows.length, added: rows.filter((row) => !prior.has(row.fingerprint)).length };
}

export default async function handler(request, response) {
  if (request.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return response.status(401).json({ error: "Unauthorized" });
  const [run] = await db.insert("radar_collection_runs", [{ sources_attempted: sources.length }]);
  const errors = []; let succeeded = 0; let seen = 0; let added = 0;
  for (const source of sources) {
    try {
      const rows = await collectSource(source);
      const result = await saveListings(rows);
      seen += result.seen; added += result.added; succeeded += 1;
    } catch (error) { errors.push({ source: source.id, message: error.message }); }
  }
  const status = errors.length === 0 ? "success" : succeeded ? "partial" : "failed";
  await db.update("radar_collection_runs", `id=eq.${run.id}`, { finished_at: new Date().toISOString(), status, sources_succeeded: succeeded, listings_seen: seen, listings_new: added, errors });
  return response.status(status === "failed" ? 500 : 200).json({ ok: status !== "failed", status, sources: { attempted: sources.length, succeeded }, listings: { seen, added }, errors });
}
