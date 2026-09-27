const number = (value) => {
  const parsed = Number(String(value || "").replace(/[\s\u202f]/g, "").replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function section(text, start, end) {
  const from = text.search(start);
  if (from < 0) return "";
  const tail = text.slice(from);
  const to = tail.slice(1).search(end);
  return to < 0 ? tail : tail.slice(0, to + 1);
}

function metric(block, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return number(block.match(new RegExp(`${escaped}[\\s\\S]{0,120}?([0-9][0-9\\s\\u202f]*(?:[,.][0-9]+)?)\\s*€`, "i"))?.[1]);
}

export function extractMeilleursAgentsMarket(document, pageUrl) {
  const text = String(document?.body?.innerText || "").replace(/\r/g, "");
  if (!/meilleursagents\.com\/prix-immobilier\//i.test(pageUrl) || !text) return null;
  const heading = text.match(/Prix immobilier (?:à|au|aux)\s+(.+?)\s*\((\d{5})\)/i);
  if (!heading) return null;
  const sale = section(text, /Prix immobilier/i, /Loyer mensuel/i);
  const rent = section(text, /Loyer mensuel/i, /Estimez un bien|Prix des appartements/i);
  const apartmentSale = section(sale, /Appartement/i, /Maison/i);
  const houseSale = section(sale, /Maison/i, /Loyer mensuel|Estimez un bien/i);
  const apartmentRent = section(rent, /Appartement/i, /Maison/i);
  const houseRent = section(rent, /Maison/i, /Estimez un bien|Prix des appartements/i);
  const observedLabel = text.match(/Estimations de prix MeilleursAgents au\s+([^\n.]+)/i)?.[1]?.trim() || null;
  return {
    city: heading[1].trim(),
    postalCode: heading[2],
    source: "meilleursagents",
    sourceUrl: pageUrl,
    observedAt: new Date().toISOString(),
    observedLabel,
    apartment: {
      salePriceM2: metric(apartmentSale, "Prix m2 moyen"),
      rentM2: metric(apartmentRent, "Loyer mensuel/m2 moyen")
    },
    house: {
      salePriceM2: metric(houseSale, "Prix m2 moyen"),
      rentM2: metric(houseRent, "Loyer mensuel/m2 moyen")
    }
  };
}
