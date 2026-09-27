const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const STOP_WORDS = new Set(["avec", "dans", "cette", "annonce", "analyse", "maison", "appartement", "pieces", "metres", "carres", "projet", "radar", "immo", "bienici", "https", "vente", "achat"]);

function relevanceScore(listing, query) {
  const haystack = normalize([listing.title, listing.city, listing.postalCode, listing.sourceId, listing.sourceUrl].join(" "));
  const normalizedQuery = normalize(query);
  const title = normalize(listing.title);
  const url = normalize(listing.sourceUrl).split("?")[0];
  let score = 0;
  if (title.length > 8 && normalizedQuery.includes(title)) score += 100;
  if (url.length > 12 && normalizedQuery.includes(url)) score += 120;
  const tokens = [...new Set(normalizedQuery.match(/[a-z0-9]+/g) || [])]
    .filter((token) => (token.length >= 4 || /^\d{5,}$/.test(token)) && !STOP_WORDS.has(token));
  for (const token of tokens) if (haystack.includes(token)) score += /^\d+$/.test(token) ? 12 : 4;
  return score;
}

export function selectChatContext(listings = [], query = "", limit = 50) {
  const scored = listings.map((listing, index) => ({ listing, index, relevance: relevanceScore(listing, query) }));
  const relevant = scored.filter((item) => item.relevance > 0).sort((a, b) => b.relevance - a.relevance || a.index - b.index);
  const selected = [...relevant];
  const included = new Set(relevant.map((item) => item.index));
  for (const item of scored) {
    if (selected.length >= limit) break;
    if (!included.has(item.index)) selected.push(item);
  }
  return selected.slice(0, limit).map((item) => item.listing);
}
