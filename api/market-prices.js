import { bearerMatches } from "../src/extension-contract.js";

const json = (response, status, body) => response.status(status).json(body);
const envMap = (name) => { try { return JSON.parse(process.env[name] || "{}"); } catch { return {}; } };
const expectedToken = (request) => envMap("EXTENSION_INGEST_TOKENS")[String(request.body?.appId || "radar-immo").trim().toLowerCase()] || process.env.EXTENSION_INGEST_TOKEN;
const headers = (extra = {}) => { const key = process.env.SUPABASE_PUBLISHABLE_KEY; return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra }; };

function databaseRows(references = {}) {
  return Object.entries(references).flatMap(([key, reference]) => ["apartment", "house"].map((propertyType) => {
    const values = reference?.[propertyType];
    if (!values?.salePriceM2) return null;
    return { city_slug: key.split(":")[0], city: reference.city, postal_code: reference.postalCode, property_type: propertyType,
      sale_low_m2: values.saleLowM2, sale_average_m2: values.salePriceM2, sale_high_m2: values.saleHighM2,
      rent_low_m2: values.rentLowM2, rent_average_m2: values.rentM2, rent_high_m2: values.rentHighM2,
      source: reference.source || "meilleursagents", source_url: reference.sourceUrl,
      observed_at: reference.observedAt || new Date().toISOString(), observed_label: reference.observedLabel };
  })).filter(Boolean);
}

function referenceMap(rows = []) {
  const references = {};
  for (const row of rows) {
    const key = `${row.city_slug}:${row.postal_code}`;
    const reference = references[key] ||= { city: row.city, postalCode: row.postal_code, source: row.source, sourceUrl: row.source_url, observedAt: row.observed_at, observedLabel: row.observed_label };
    reference[row.property_type] = { salePriceM2: Number(row.sale_average_m2), saleLowM2: Number(row.sale_low_m2) || null, saleHighM2: Number(row.sale_high_m2) || null,
      rentM2: Number(row.rent_average_m2) || null, rentLowM2: Number(row.rent_low_m2) || null, rentHighM2: Number(row.rent_high_m2) || null };
  }
  return references;
}

export default async function handler(request, response) {
  const baseUrl = process.env.SUPABASE_URL;
  if (!baseUrl || !process.env.SUPABASE_PUBLISHABLE_KEY) return json(response, 503, { error: "market_database_not_configured" });
  if (request.method === "GET") {
    const result = await fetch(`${baseUrl}/rest/v1/radar_market_prices?select=*&order=city_slug,property_type`, { headers: headers() });
    if (!result.ok) return json(response, 502, { error: `market_database_http_${result.status}` });
    const rows = await result.json();
    response.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
    return json(response, 200, { updatedAt: rows.reduce((latest, row) => row.updated_at > latest ? row.updated_at : latest, ""), references: referenceMap(rows) });
  }
  if (request.method !== "POST") return json(response, 405, { error: "method_not_allowed" });
  if (!bearerMatches(request.headers.authorization, expectedToken(request))) return json(response, 401, { error: "unauthorized" });
  const rows = databaseRows(request.body?.references);
  if (!rows.length) return json(response, 400, { error: "empty_market_references" });
  const result = await fetch(`${baseUrl}/rest/v1/radar_market_prices?on_conflict=city_slug,postal_code,property_type,source`, {
    method: "POST",
    headers: headers({ "x-radar-market-secret": process.env.SUPABASE_MARKET_SYNC_SECRET, Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows)
  });
  if (!result.ok) return json(response, 502, { error: `market_database_http_${result.status}`, detail: await result.text() });
  return json(response, 200, { ok: true, upserted: rows.length });
}
