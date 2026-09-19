import test from "node:test";
import assert from "node:assert/strict";
import { collectBerryPilotListing, collectBerryPilotSearch, hasCommercialOutreachRefusal } from "../extension/src/berrypilot-lbc.js";

function fakeDocument({ bodyText = "", selectors = {}, anchors = [], jsonLd = [] } = {}) {
  const selectorMap = new Map(Object.entries(selectors).map(([selector, textContent]) => [selector, { textContent }]));
  const scripts = jsonLd.map((value) => ({ textContent: JSON.stringify(value) }));
  return {
    body: { innerText: bodyText },
    querySelector(selector) {
      return selectorMap.get(selector) || null;
    },
    querySelectorAll(selector) {
      if (selector === 'script[type="application/ld+json"]') return scripts;
      if (selector === 'a[href*="/ad/"]') return anchors.map((href) => ({ getAttribute: () => href }));
      return [];
    }
  };
}

test("keeps BerryPilot anti-solicitation rules from the LBC Safe connector", () => {
  assert.equal(hasCommercialOutreachRefusal("Démarchage commercial : non"), true);
  assert.equal(hasCommercialOutreachRefusal("Agences et conciergeries s'abstenir"), true);
  assert.equal(hasCommercialOutreachRefusal("Appartement meublé disponible immédiatement"), false);
});

test("collects and deduplicates current Leboncoin search links", () => {
  const document = fakeDocument({
    bodyText: "Mon compte",
    selectors: { '[data-qa-id="profile_button"]': "Jean" },
    anchors: [
      "/ad/locations/2912345678?utm_source=test",
      "https://www.leboncoin.fr/ad/locations/2912345678#details",
      "/ad/ventes_immobilieres/2987654321"
    ]
  });
  const result = collectBerryPilotSearch(document, "https://www.leboncoin.fr/recherche?category=10");
  assert.equal(result.loggedIn, true);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.urls, [
    "https://www.leboncoin.fr/ad/locations/2912345678",
    "https://www.leboncoin.fr/ad/ventes_immobilieres/2987654321"
  ]);
});

test("uses the current Leboncoin location, seller and property selectors", () => {
  const document = fakeDocument({
    bodyText: "Annonce à Orléans 45000",
    selectors: {
      'a[href$="#map"]': "Orléans 45000",
      '[data-qa-id="adview_profile_part"]': "Marie Suivre Membre depuis 2020",
      '[data-qa-id="criteria_item_real_estate_type"]': "Type de bien Appartement"
    },
    jsonLd: [{
      name: "Appartement 2 pièces",
      description: "Appartement lumineux disponible immédiatement.",
      offers: { price: 89000, priceCurrency: "EUR" }
    }]
  });
  const listing = collectBerryPilotListing(document, "https://www.leboncoin.fr/ad/ventes_immobilieres/2987654321?foo=bar#map");
  assert.equal(listing.city, "Orléans");
  assert.equal(listing.postalCode, "45000");
  assert.equal(listing.ownerName, "Marie");
  assert.equal(listing.propertyType, "Appartement");
  assert.equal(listing.externalListingId, "2987654321");
  assert.equal(listing.sourceUrl, "https://www.leboncoin.fr/ad/ventes_immobilieres/2987654321");
  assert.equal(listing.commercialOutreachAllowed, true);
});
