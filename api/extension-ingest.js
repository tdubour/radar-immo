import { randomUUID } from "node:crypto";
import { bearerMatches, normalizeExtensionBatch } from "../src/extension-contract.js";

const json = (response, status, body) => response.status(status).json(body);

function allowedOrigin(request) {
  const origin = request.headers.origin;
  const configured = (process.env.EXTENSION_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return origin && configured.includes(origin) ? origin : null;
}

async function persistBatch(batch) {
  const repository = process.env.RADAR_DATA_REPOSITORY;
  const token = process.env.RADAR_GITHUB_TOKEN;
  if (!repository || !token) throw new Error("storage_not_configured");
  const branch = process.env.RADAR_DATA_BRANCH || "main";
  const now = new Date();
  const batchId = `${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  const path = `data/extension-inbox/${now.toISOString().slice(0, 10)}/${batchId}.json`;
  const payload = { batchId, receivedAt: now.toISOString(), count: batch.length, listings: batch };
  const api = `https://api.github.com/repos/${repository}/contents/${path}`;
  const result = await fetch(api, {
    method: "PUT",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "radar-immo-extension-ingest"
    },
    body: JSON.stringify({ message: `data: lot extension ${batchId}`, branch, content: Buffer.from(JSON.stringify(payload, null, 2)).toString("base64") })
  });
  if (!result.ok) throw new Error(`storage_http_${result.status}`);
  return { batchId, path };
}

export default async function handler(request, response) {
  const origin = allowedOrigin(request);
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") return response.status(origin ? 204 : 403).end();
  if (request.method !== "POST") return json(response, 405, { error: "method_not_allowed" });
  if (!bearerMatches(request.headers.authorization, process.env.EXTENSION_INGEST_TOKEN)) {
    return json(response, 401, { error: "unauthorized" });
  }
  try {
    const listings = normalizeExtensionBatch(request.body);
    if (request.query?.validateOnly === "1") return json(response, 200, { ok: true, valid: listings.length });
    const stored = await persistBatch(listings);
    return json(response, 202, { ok: true, accepted: listings.length, ...stored });
  } catch (error) {
    const status = error.message === "storage_not_configured" ? 503 : 400;
    return json(response, status, { error: error.message });
  }
}

