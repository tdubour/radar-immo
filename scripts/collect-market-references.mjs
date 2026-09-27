import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { extractMeilleursAgentsMarket } from "../extension/src/meilleursagents.js";

const slug = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const payload = JSON.parse(await readFile(new URL("../data/listings.json", import.meta.url), "utf8"));
const locations = [...new Map((payload.listings || payload).filter((row) => row.city && /^\d{5}$/.test(String(row.postalCode || ""))).map((row) => [`${slug(row.city)}:${row.postalCode}`, { city: row.city, postalCode: String(row.postalCode) }])).values()];
const outputUrl = new URL("../data/market-references.json", import.meta.url);
let previous = {};
try { previous = JSON.parse(await readFile(outputUrl, "utf8")).references || {}; } catch {}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: "fr-FR" });
const references = { ...previous };
const failures = [];
try {
  for (const location of locations) {
    const key = `${slug(location.city)}:${location.postalCode}`;
    const sourceUrl = `https://www.meilleursagents.com/prix-immobilier/${slug(location.city)}-${location.postalCode}/`;
    try {
      await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(700);
      const innerText = await page.locator("body").innerText();
      const reference = extractMeilleursAgentsMarket({ body: { innerText } }, sourceUrl);
      if (!reference?.postalCode) throw new Error("prix introuvables");
      references[key] = { ...reference, city: location.city, postalCode: location.postalCode };
      console.log(`OK ${location.city} ${location.postalCode}`);
    } catch (error) {
      failures.push({ ...location, error: error.message });
      console.warn(`ECHEC ${location.city} ${location.postalCode}: ${error.message}`);
    }
  }
} finally {
  await browser.close();
}

const result = { updatedAt: new Date().toISOString(), requested: locations.length, collected: Object.keys(references).length, failures, references };
await writeFile(outputUrl, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ requested: result.requested, collected: result.collected, failures: result.failures.length }));
