const compact = (value, max = 5000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function firstText(document, selectors) {
  for (const selector of selectors) {
    const value = compact(document.querySelector(selector)?.textContent);
    if (value) return value;
  }
  return "";
}

function jsonLdObjects(document) {
  return Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap((script) => {
    try {
      const parsed = JSON.parse(script.textContent || "null");
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }).flatMap((entry) => entry?.["@graph"] || entry || []);
}

function findJsonListing(document) {
  return jsonLdObjects(document).find((entry) => entry && typeof entry === "object" && (entry.description || entry.offers || entry.address || entry.name)) || {};
}

export function hasCommercialOutreachRefusal(description) {
  const value = compact(description).normalize("NFKC").toLocaleLowerCase("fr").replaceAll("-", " ");
  return [
    /\bpas de d[eé]marchage\b/u,
    /\bd[eé]marchage commercial\s*[:\-]?\s*(?:non|interdit|refus[eé]|d[eé]sactiv[eé])\b/u,
    /\b(?:agence|professionnel|interm[eé]diaire|conciergerie)s?\s+(?:s['’]\s*)?abstenir\b/u,
    /\bne (?:souhaite|souhaitons|veux|voulons) pas .{0,80}\b(?:agence|professionnel|interm[eé]diaire|conciergerie)s?\b/u,
    /\bne pas (?:me |nous )?contacter .{0,80}\b(?:agence|professionnel|interm[eé]diaire|conciergerie)\b/u
  ].some((pattern) => pattern.test(value));
}

export function collectBerryPilotSearch(document, pageUrl) {
  const currentUrl = new URL(pageUrl);
  const bodyText = compact(document.body?.innerText);
  const blocked = /captcha|v[eé]rifiez que vous n['’]êtes pas un robot|accès temporairement bloqué/i.test(bodyText);
  const loggedIn = !/\/login(?:\/|$)/.test(currentUrl.pathname)
    && !/connectez-vous à votre compte leboncoin/i.test(bodyText);
  const urls = [...new Set(Array.from(document.querySelectorAll('a[href*="/ad/"]'))
    .map((anchor) => {
      try {
        const url = new URL(anchor.getAttribute("href"), currentUrl.origin);
        url.search = "";
        url.hash = "";
        return url.href;
      } catch {
        return "";
      }
    })
    .filter((url) => /^https:\/\/(?:www\.)?leboncoin\.fr\/ad\//.test(url)))];
  const accountLabel = firstText(document, [
    '[data-qa-id="profile_button"]',
    '[data-test-id="profile-button"]',
    'header [aria-label*="profil" i]',
    'header [aria-label*="compte" i]'
  ]).replace(/^(mon compte|profil)\s*/i, "");
  return { accountLabel, blocked, loggedIn, urls };
}

export function collectBerryPilotListing(document, pageUrl) {
  const currentUrl = new URL(pageUrl);
  const structured = findJsonListing(document);
  const title = compact(structured.name) || firstText(document, ["h1", '[data-qa-id="adview_title"]']);
  const description = compact(structured.description) || firstText(document, [
    '[data-qa-id="adview_description_container"]',
    '[data-test-id="ad-description"]',
    'section[aria-label*="description" i]'
  ]);
  const address = structured.address || {};
  const bodyText = compact(document.body?.innerText);
  const postalMatch = bodyText.match(/\b(\d{5})\b/);
  const locationLabel = firstText(document, [
    'a[href$="#map"]',
    '[data-qa-id="adview_location_informations"]',
    '[data-test-id="location"]'
  ]);
  const city = compact(address.addressLocality) || locationLabel.replace(/\b\d{5}\b/g, "").trim();
  const offerPrice = structured.offers?.price;
  const priceLabel = offerPrice ? `${offerPrice} ${structured.offers?.priceCurrency || "EUR"}` : firstText(document, [
    '[data-qa-id="adview_price"]',
    '[data-test-id="price"]'
  ]);
  const ownerName = firstText(document, [
    '[data-qa-id="adview_profile_part"]',
    '[data-qa-id="adview_user_profile"] h3',
    '[data-qa-id="adview_user_profile"]',
    '[data-test-id="seller-name"]'
  ]).split(/Suivre|Membre depuis|Dernière activité|Très réactif|Numéro vérifié/)[0].trim() || "Propriétaire";
  const criteriaPropertyType = firstText(document, ['[data-qa-id="criteria_item_real_estate_type"]'])
    .replace(/^Type de bien/i, "")
    .trim();
  const id = currentUrl.pathname.split("/").filter(Boolean).at(-1) || "";
  return {
    city,
    commercialOutreachAllowed: description.length >= 20 && !hasCommercialOutreachRefusal(description),
    description,
    externalListingId: /^\d{6,}$/.test(id) ? id : "",
    ownerName,
    postalCode: compact(address.postalCode) || locationLabel.match(/\b\d{5}\b/)?.[0] || postalMatch?.[1] || "",
    priceLabel,
    propertyType: criteriaPropertyType || title.split(/[—–-]/)[0].trim().slice(0, 120),
    sourceUrl: `${currentUrl.origin}${currentUrl.pathname}`,
    title
  };
}
