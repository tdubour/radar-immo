// extension/src/catalog.js
var SOURCES = Object.freeze({
  leboncoin: {
    id: "leboncoin",
    label: "Leboncoin",
    hosts: ["leboncoin.fr"],
    listingPaths: [/\/ad\/(?:ventes_immobilieres|bureaux_commerces)\//i, /\/(?:ventes_immobilieres|bureaux_commerces)\//i]
  },
  seloger: {
    id: "seloger",
    label: "SeLoger",
    hosts: ["seloger.com"],
    listingPaths: [/\/annonces?\//i]
  },
  bienici: {
    id: "bienici",
    label: "Bien\u2019ici",
    hosts: ["bienici.com"],
    listingPaths: [/\/annonce\//i]
  },
  pap: {
    id: "pap",
    label: "PAP",
    hosts: ["pap.fr"],
    listingPaths: [/\/annonces?\//i]
  },
  "logic-immo": {
    id: "logic-immo",
    label: "Logic-Immo",
    hosts: ["logic-immo.com"],
    listingPaths: [/\/detail-(?:vente|location)(?:-|\/)\S*/i, /\/annonces?\//i]
  }
});
function sourceFromUrl(value) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return Object.values(SOURCES).find((source) => source.hosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)))?.id || null;
  } catch {
    return null;
  }
}
function isListingUrl(sourceId, value) {
  try {
    const url = new URL(value);
    const source = SOURCES[sourceId];
    return Boolean(source && source.listingPaths.some((pattern) => pattern.test(url.pathname)));
  } catch {
    return false;
  }
}

// extension/src/adapters.js
var clean = (value, max = 5e3) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
function parseFrenchNumber(value) {
  if (value === null || value === void 0) return null;
  const normalized = String(value).replace(/[\s\u00a0\u202f]/g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
function extractExternalId(value) {
  try {
    const url = new URL(value);
    const queryId = url.searchParams.get("id") || url.searchParams.get("classifiedId");
    if (queryId) return queryId;
    return url.pathname.match(/(?:^|[\/-])(\d{6,})(?:\.html?|\/|$)/)?.[1] || null;
  } catch {
    return null;
  }
}
function inferFields(text) {
  const value = clean(text, 4e3);
  const priceMatch = value.match(/(\d[\d\s\u00a0\u202f]{2,})\s*€/);
  const surfaceMatch = value.match(/(\d+(?:[,.]\d+)?)\s*m[²2]/i);
  const roomsMatch = value.match(/(\d+)\s*(?:pi[eè]ces?|p\b)/i);
  const bedroomsMatch = value.match(/(\d+)\s*(?:chambres?|ch\b)/i);
  const postalMatch = value.match(/\b((?:0[1-9]|[1-8]\d|9[0-5])\d{3})\b/);
  const dpeMatch = value.match(/(?:DPE|classe\s+[ée]nergie)\s*[:\-]?\s*([A-G])\b/i);
  return {
    askingPrice: parseFrenchNumber(priceMatch?.[1]),
    surfaceM2: parseFrenchNumber(surfaceMatch?.[1]),
    rooms: parseFrenchNumber(roomsMatch?.[1]),
    bedrooms: parseFrenchNumber(bedroomsMatch?.[1]),
    postalCode: postalMatch?.[1] || null,
    dpe: dpeMatch?.[1]?.toUpperCase() || null,
    sellerType: /particulier/i.test(value) ? "private" : /(agence|professionnel|pro\b)/i.test(value) ? "agency" : "unknown",
    hasWorksSignal: /(à\s+rénover|a\s+renover|travaux|dans\s+son\s+jus|rafraîchir|rafraichir)/i.test(value)
  };
}
function absoluteUrl(href, pageUrl) {
  try {
    const url = new URL(href, pageUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
function closestCard(anchor) {
  return anchor.closest("article, li, [data-testid], [data-qa-id], [class*='card'], [class*='Card']") || anchor.parentElement?.parentElement || anchor.parentElement;
}
function titleFromCard(card, anchor) {
  return clean(card?.querySelector("h1, h2, h3, [itemprop='name'], [data-testid*='title']")?.textContent || anchor.getAttribute("title") || anchor.textContent, 300);
}
function cardToListing(anchor, pageUrl, sourceId) {
  const sourceUrl = absoluteUrl(anchor.getAttribute("href"), pageUrl);
  if (!sourceUrl || !isListingUrl(sourceId, sourceUrl)) return null;
  const card = closestCard(anchor);
  const rawText = clean(card?.textContent || anchor.textContent, 4e3);
  const fields = inferFields(rawText);
  const title = titleFromCard(card, anchor);
  if (!title || !fields.askingPrice || fields.askingPrice < 1e3) return null;
  return {
    sourceId,
    externalId: extractExternalId(sourceUrl),
    sourceUrl,
    title,
    description: "",
    ...fields,
    city: null,
    district: null,
    propertyType: null,
    capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
    rawText: rawText.slice(0, 1800)
  };
}
function walkJson(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, output);
    return output;
  }
  if (value.item) walkJson(value.item, output);
  if (value.itemListElement) walkJson(value.itemListElement, output);
  const offer = value.offers || value.offer;
  const url = value.url || value.item?.url;
  const name = value.name || value.headline;
  const price = offer?.price || value.price;
  if (url && name && price) output.push({ url, name, price, value });
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object" && nested !== value.item && nested !== value.itemListElement) walkJson(nested, output);
  }
  return output;
}
function jsonLdListings(document2, pageUrl, sourceId) {
  const rows = [];
  for (const script of document2.querySelectorAll("script[type='application/ld+json']")) {
    try {
      for (const item of walkJson(JSON.parse(script.textContent || "null"))) {
        const sourceUrl = absoluteUrl(item.url, pageUrl);
        if (!sourceUrl || !isListingUrl(sourceId, sourceUrl)) continue;
        const address = item.value?.address || item.value?.item?.address || {};
        rows.push({
          sourceId,
          externalId: extractExternalId(sourceUrl),
          sourceUrl,
          title: clean(item.name, 300),
          description: clean(item.value?.description, 5e3),
          askingPrice: parseFrenchNumber(item.price),
          surfaceM2: parseFrenchNumber(item.value?.floorSize?.value),
          rooms: parseFrenchNumber(item.value?.numberOfRooms),
          bedrooms: parseFrenchNumber(item.value?.numberOfBedrooms),
          postalCode: clean(address.postalCode, 10) || null,
          city: clean(address.addressLocality, 120) || null,
          district: null,
          propertyType: clean(item.value?.["@type"], 100) || null,
          dpe: null,
          sellerType: "unknown",
          hasWorksSignal: /(à\s+rénover|travaux|dans\s+son\s+jus)/i.test(item.value?.description || ""),
          capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
          rawText: ""
        });
      }
    } catch {
    }
  }
  return rows.filter((row) => row.title && row.askingPrice >= 1e3);
}
function extractListings(document2, pageUrl) {
  const sourceId = sourceFromUrl(pageUrl);
  if (!sourceId) return { sourceId: null, listings: [] };
  const anchors = [...document2.querySelectorAll("a[href]")];
  const fromDom = anchors.map((anchor) => cardToListing(anchor, pageUrl, sourceId)).filter(Boolean);
  const combined = [...jsonLdListings(document2, pageUrl, sourceId), ...fromDom];
  const unique = [...new Map(combined.map((row) => [row.externalId || row.sourceUrl, row])).values()];
  return { sourceId, listings: unique.slice(0, 100) };
}

// extension/src/content.js
var lastSignature = "";
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
  }).catch(() => void 0);
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCAN_NOW") return false;
  scan(true).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
setTimeout(() => scan(false), 3200);
