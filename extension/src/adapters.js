import { isListingUrl, sourceFromUrl } from "./catalog.js";

const clean = (value, max = 5000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function parseFrenchNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/[\s\u00a0\u202f]/g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractExternalId(value) {
  try {
    const url = new URL(value);
    const queryId = url.searchParams.get("id") || url.searchParams.get("classifiedId");
    if (queryId) return queryId;
    return url.pathname.match(/(?:^|[\/-])(\d{6,})(?:\.html?|\/|$)/)?.[1] || null;
  } catch {
    return null;
  }
}

export function inferFields(text) {
  const value = clean(text, 4000);
  const priceMatch = value.match(/(\d[\d\s\u00a0\u202f]{2,})\s*€/);
  const surfaceMatch = value.match(/(\d+(?:[,.]\d+)?)\s*m[²2]/i);
  const roomsMatch = value.match(/(\d+)\s*(?:pi[eè]ces?|p\b)/i);
  const bedroomsMatch = value.match(/(\d+)\s*(?:chambres?|ch\b)/i);
  const postalMatch = value.match(/\b((?:0[1-9]|[1-8]\d|9[0-5])\d{3})\b/);
  const parenthesizedCityMatch = postalMatch
    ? value.match(new RegExp(`([A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’ -]{1,80})\\s*\\(\\s*${postalMatch[1]}\\s*\\)`))
    : null;
  const dpeMatch = value.match(/(?:DPE|classe\s+[ée]nergie)\s*[:\-]?\s*([A-G])\b/i);
  return {
    askingPrice: parseFrenchNumber(priceMatch?.[1]),
    surfaceM2: parseFrenchNumber(surfaceMatch?.[1]),
    rooms: parseFrenchNumber(roomsMatch?.[1]),
    bedrooms: parseFrenchNumber(bedroomsMatch?.[1]),
    postalCode: postalMatch?.[1] || null,
    city: clean(parenthesizedCityMatch?.[1], 120) || null,
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
  const rawText = clean(card?.textContent || anchor.textContent, 4000);
  const fields = inferFields(rawText);
  const title = titleFromCard(card, anchor);
  if (!title || !fields.askingPrice || fields.askingPrice < 1000) return null;
  return {
    sourceId,
    externalId: extractExternalId(sourceUrl),
    sourceUrl,
    title,
    description: "",
    ...fields,
    city: fields.city || null,
    district: null,
    propertyType: null,
    capturedAt: new Date().toISOString(),
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

function jsonLdListings(document, pageUrl, sourceId) {
  const rows = [];
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
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
          description: clean(item.value?.description, 5000),
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
          capturedAt: new Date().toISOString(),
          rawText: ""
        });
      }
    } catch {
      // Une balise JSON-LD invalide ne doit pas bloquer l'extraction DOM.
    }
  }
  return rows.filter((row) => row.title && row.askingPrice >= 1000);
}

export function extractListings(document, pageUrl) {
  const sourceId = sourceFromUrl(pageUrl);
  if (!sourceId) return { sourceId: null, listings: [] };
  const anchors = [...document.querySelectorAll("a[href]")];
  const fromDom = anchors.map((anchor) => cardToListing(anchor, pageUrl, sourceId)).filter(Boolean);
  const combined = [...jsonLdListings(document, pageUrl, sourceId), ...fromDom];
  const unique = [...new Map(combined.map((row) => [row.externalId || row.sourceUrl, row])).values()];
  return { sourceId, listings: unique.slice(0, 100) };
}
