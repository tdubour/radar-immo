import { readFile } from "node:fs/promises";
import { EXTENSION_CONTRACT_VERSION, MAX_EXTENSION_BATCH_SIZE } from "../src/extension-contract.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "method_not_allowed" });
  const config = JSON.parse(await readFile(new URL("../config/extension-sources.json", import.meta.url), "utf8"));
  response.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  return response.status(200).json({
    ...config,
    contract: {
      version: EXTENSION_CONTRACT_VERSION,
      ingestUrl: "/api/extension-ingest",
      maxBatchSize: MAX_EXTENSION_BATCH_SIZE,
      requiredFields: ["sourceId", "sourceUrl", "title", "askingPrice"]
    }
  });
}

