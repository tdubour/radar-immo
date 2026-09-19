import { extractListings } from "./adapters.js";
import { collectBerryPilotListing, collectBerryPilotSearch } from "./berrypilot-lbc.js";

let lastSignature = "";

async function scan(force = false) {
  const result = extractListings(document, location.href);
  const signature = `${location.href}:${result.listings.map((row) => row.externalId || row.sourceUrl).join("|")}`;
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  await chrome.runtime.sendMessage({
    type: "PAGE_EXTRACTED",
    pageUrl: location.href,
    sourceId: result.sourceId,
    listings: result.listings
  }).catch(() => undefined);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "BERRYPILOT_COLLECT_SEARCH") {
    sendResponse(collectBerryPilotSearch(document, location.href));
    return false;
  }
  if (message?.type === "BERRYPILOT_COLLECT_LISTING") {
    sendResponse(collectBerryPilotListing(document, location.href));
    return false;
  }
  if (message?.type === "SCAN_NOW") {
    scan(true).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});

setTimeout(() => scan(false), 3200);
