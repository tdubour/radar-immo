import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const config = JSON.parse(await readFile(new URL("config/radar-sources.json", root), "utf8"));
const previous = JSON.parse(await readFile(new URL("data/listings.json", root), "utf8"));
const history = JSON.parse(await readFile(new URL("data/history.json", root), "utf8"));
const now = new Date().toISOString();

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const numeric = (value) => {
  const parsed = Number(clean(value).replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const comparable = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
const radians = (value) => value * Math.PI / 180;
const distanceKm = (a, b) => {
  const dLat = radians(b.latitude - a.latitude); const dLon = radians(b.longitude - a.longitude);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
};

function parseCard(row, source) {
  const text = clean(row.text);
  const prices = [...text.matchAll(/([0-9][0-9 .]{2,})\s*€/g)].map((match) => numeric(match[1])).filter(Boolean);
  const surfaceMatch = text.match(/([0-9]+(?:[,.][0-9]+)?)\s*m[²2]/i);
  const roomsMatch = text.match(/([0-9]+)\s*pi[eè]ces?/i);
  const postalMatch = text.match(/\b(18|28|36|37|41|45)\d{3}\b/);
  const dpeMatch = text.match(/(?:DPE|classe énergie|énergie)\s*[:\-]?\s*([A-G])\b/i);
  const cityMatch = text.match(/\b(?:18|28|36|37|41|45)\d{3}\s+([A-ZÀ-Ÿ][A-Za-zÀ-ÿ' -]+?)(?:\s*\(|\s+[0-9]|$)/);
  const askingPrice = prices.length ? Math.max(...prices) : null;
  if (!row.url || !askingPrice || askingPrice < 10000 || askingPrice > 750000 || /viager|résidence\s+(services?|seniors?)|programme\s+neuf|terrain\s+non\s+constructible|parking\s+seul/i.test(text)) return null;
  const externalId = row.url.match(/(?:\/|=)([0-9]{6,})(?:[/?#-]|$)/)?.[1] || null;
  const title = clean(row.title || text.split(/\n|\|/)[0]).slice(0, 240);
  if (!title) return null;
  const fingerprint = hash(externalId ? `${source.id}:${externalId}` : `${source.id}:${row.url}`);
  return {
    fingerprint, sourceId: source.id.replace(/-\d+$/, ""), externalId, sourceUrl: row.url, title,
    description: text.slice(0, 1500), askingPrice, surfaceM2: numeric(surfaceMatch?.[1]), rooms: numeric(roomsMatch?.[1]),
    postalCode: postalMatch?.[0] || null, city: clean(cityMatch?.[1]) || null, dpe: dpeMatch?.[1]?.toUpperCase() || null,
    sellerType: /particulier/i.test(text) ? "private" : /agence|professionnel|\bpro\b/i.test(text) ? "agency" : "unknown",
    firstSeenAt: previous.listings?.find((item) => item.fingerprint === fingerprint)?.firstSeenAt || now,
    lastSeenAt: now
  };
}

async function extractSource(page, source) {
  const targets = source.targets || [{ url: source.url }];
  const listings = [];
  for (const target of targets) {
    const response = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(source.waitMs ?? 3500);
    for (const label of ["Tout accepter", "Accepter", "J’accepte", "Continuer sans accepter"]) {
      const button = page.getByRole("button", { name: label, exact: false }).first();
      if (await button.isVisible().catch(() => false)) { await button.click().catch(() => {}); break; }
    }
    await page.waitForTimeout(source.waitMs ? 400 : 1500);
    const title = await page.title();
    const body = clean(await page.locator("body").innerText().catch(() => ""));
    if (response?.status() >= 400 || /access denied|captcha|vérifier que vous êtes humain|forbidden/i.test(`${title} ${body.slice(0, 500)}`)) throw new Error(`Blocage HTTP/navigation (${response?.status() || "?"})`);
    const cards = await page.locator("a[href]").evaluateAll((anchors, linkPattern) => {
      const matcher = new RegExp(linkPattern, "i"); const seen = new Set(); const output = [];
      for (const anchor of anchors) {
        const url = anchor.href; if (!url || !matcher.test(new URL(url).pathname) || seen.has(url)) continue;
        seen.add(url);
        let container = anchor;
        for (let i = 0; i < 5 && container.parentElement; i += 1) {
          if ((container.innerText || "").length >= 50) break;
          container = container.parentElement;
        }
        const heading = container.querySelector("h1,h2,h3,[role=heading]");
        const image = container.querySelector("img[alt]");
        output.push({ url, title: heading?.textContent || image?.alt || anchor.getAttribute("aria-label") || "", text: (container.innerText || anchor.innerText || "").slice(0, 2500) });
      }
      return output;
    }, source.linkPattern);
    const locationHint = target.postalCode ? ` ${target.postalCode} ${target.city}` : "";
    listings.push(...cards.map((row) => parseCard({ ...row, text: `${row.text}${locationHint}` }, source)).filter(Boolean));
  }
  return [...new Map(listings.map((row) => [row.fingerprint, row])).values()].slice(0, config.maxListingsPerPage);
}

async function extractSitemap(page, source) {
  const response = await fetch(source.url, { headers: { "User-Agent": "RadarImmo/1.0 (+https://radar-immo-blond.vercel.app)" } });
  if (!response.ok) throw new Error(`Sitemap HTTP ${response.status}`);
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => match[1].replace(/&amp;/g, "&").trim())
    .filter((url) => source.targetSlugs.some((slug) => comparable(url).includes(comparable(slug))))
    .slice(0, config.maxListingsPerPage);
  const rows = [];
  for (const url of urls) {
    try {
      const navigation = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (navigation?.status() >= 400) continue;
      const text = clean(await page.locator("body").innerText().catch(() => ""));
      const title = await page.title();
      const parsed = parseCard({ url, title, text }, source);
      if (parsed) rows.push(parsed);
      await page.waitForTimeout(250);
    } catch { /* annonce retirée ou inaccessible */ }
  }
  return rows;
}

const communeCache = new Map();
async function geocode(listing) {
  if (!listing.postalCode) return listing;
  if (!communeCache.has(listing.postalCode)) {
    const response = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${listing.postalCode}&fields=nom,centre,population,codesPostaux&format=json&geometry=centre`);
    const rows = response.ok ? await response.json() : [];
    communeCache.set(listing.postalCode, rows);
  }
  const communes = communeCache.get(listing.postalCode) || [];
  const wanted = comparable(listing.city);
  const commune = communes.find((row) => comparable(row.nom) === wanted) || communes.find((row) => comparable(row.nom).includes(wanted) || wanted.includes(comparable(row.nom))) || communes[0];
  if (!commune?.centre?.coordinates) return listing;
  const [longitude, latitude] = commune.centre.coordinates;
  const km = distanceKm(config.center, { latitude, longitude });
  return { ...listing, city: commune.nom, cityPopulation: commune.population || 0, latitude, longitude, distanceKm: Math.round(km * 10) / 10 };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "fr-FR", timezoneId: "Europe/Paris", viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const collected = []; const statuses = [];
for (const source of config.sources) {
  try {
    const rows = source.kind === "sitemap" ? await extractSitemap(page, source) : await extractSource(page, source); collected.push(...rows);
    statuses.push({ id: source.id, label: source.label, ok: true, count: rows.length });
  } catch (error) { statuses.push({ id: source.id, label: source.label, ok: false, count: 0, error: error.message }); }
}
await browser.close();

const unique = [...new Map(collected.map((row) => [row.fingerprint, row])).values()];
const geocoded = await Promise.all(unique.map(geocode));
const inArea = geocoded.filter((row) => Number.isFinite(row.distanceKm) && (row.distanceKm <= config.primaryRadiusKm || (row.distanceKm <= config.extendedRadiusKm && row.cityPopulation >= config.extendedMinPopulation)));
for (const row of inArea) {
  const points = history[row.fingerprint] || [];
  if (!points.some((point) => point.askingPrice === row.askingPrice)) points.push({ observedAt: now, askingPrice: row.askingPrice });
  history[row.fingerprint] = points;
}
inArea.sort((a, b) => new Date(b.firstSeenAt) - new Date(a.firstSeenAt));
const successfulSources = statuses.filter((source) => source.ok).length;
await writeFile(new URL("data/listings.json", root), `${JSON.stringify({ generatedAt: now, listings: inArea }, null, 2)}\n`);
await writeFile(new URL("data/history.json", root), `${JSON.stringify(history, null, 2)}\n`);
await writeFile(new URL("data/status.json", root), `${JSON.stringify({ ok: successfulSources > 0, generatedAt: now, message: `${inArea.length} annonces actives`, sources: statuses }, null, 2)}\n`);
if (!successfulSources) process.exitCode = 1;
