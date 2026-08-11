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
const radians = (value) => value * Math.PI / 180;
const distanceKm = (a, b) => {
  const dLat = radians(b.latitude - a.latitude); const dLon = radians(b.longitude - a.longitude);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
};

function parseCard(row, source) {
  const text = clean(row.text);
  const priceMatch = text.match(/([0-9][0-9 .]{2,})\s*€/);
  const surfaceMatch = text.match(/([0-9]+(?:[,.][0-9]+)?)\s*m[²2]/i);
  const roomsMatch = text.match(/([0-9]+)\s*pi[eè]ces?/i);
  const postalMatch = text.match(/\b(18|28|36|37|41|45)\d{3}\b/);
  const dpeMatch = text.match(/(?:DPE|classe énergie|énergie)\s*[:\-]?\s*([A-G])\b/i);
  const askingPrice = numeric(priceMatch?.[1]);
  if (!row.url || !askingPrice || askingPrice > 750000) return null;
  const externalId = row.url.match(/(?:\/|=)([0-9]{6,})(?:[/?#-]|$)/)?.[1] || null;
  const title = clean(row.title || text.split(/\n|\|/)[0]).slice(0, 240);
  if (!title) return null;
  const fingerprint = hash(externalId ? `${source.id}:${externalId}` : `${source.id}:${row.url}`);
  return {
    fingerprint, sourceId: source.id.replace(/-\d+$/, ""), externalId, sourceUrl: row.url, title,
    description: text.slice(0, 1500), askingPrice, surfaceM2: numeric(surfaceMatch?.[1]), rooms: numeric(roomsMatch?.[1]),
    postalCode: postalMatch?.[0] || null, city: null, dpe: dpeMatch?.[1]?.toUpperCase() || null,
    sellerType: /particulier/i.test(text) ? "private" : /agence|professionnel|\bpro\b/i.test(text) ? "agency" : "unknown",
    firstSeenAt: previous.listings?.find((item) => item.fingerprint === fingerprint)?.firstSeenAt || now,
    lastSeenAt: now
  };
}

async function extractSource(page, source) {
  const response = await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3500);
  for (const label of ["Tout accepter", "Accepter", "J’accepte", "Continuer sans accepter"]) {
    const button = page.getByRole("button", { name: label, exact: false }).first();
    if (await button.isVisible().catch(() => false)) { await button.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(1500);
  const title = await page.title();
  const body = clean(await page.locator("body").innerText().catch(() => ""));
  if (response?.status() >= 400 || /access denied|captcha|vérifier que vous êtes humain|forbidden/i.test(`${title} ${body.slice(0, 500)}`)) throw new Error(`Blocage HTTP/navigation (${response?.status() || "?"})`);
  const pattern = source.linkPattern;
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
  }, pattern);
  return cards.slice(0, config.maxListingsPerPage).map((row) => parseCard(row, source)).filter(Boolean);
}

const communeCache = new Map();
async function geocode(listing) {
  if (!listing.postalCode) return listing;
  if (!communeCache.has(listing.postalCode)) {
    const response = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${listing.postalCode}&fields=nom,centre,population,codesPostaux&format=json&geometry=centre`);
    const rows = response.ok ? await response.json() : [];
    communeCache.set(listing.postalCode, rows[0] || null);
  }
  const commune = communeCache.get(listing.postalCode);
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
    const rows = await extractSource(page, source); collected.push(...rows);
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
