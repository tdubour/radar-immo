import { db } from "./lib/db.js";

export default async function handler(_request, response) {
  try {
    const runs = await db.select("radar_collection_runs", "select=*&order=started_at.desc&limit=1");
    return response.status(200).json({ ok: true, database: true, lastRun: runs[0] || null });
  } catch (error) { return response.status(503).json({ ok: false, database: false, error: error.message }); }
}
