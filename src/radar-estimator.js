import { analyzeProject } from "./finance.js";
import { createDefaultProject } from "./defaults.js";

const clamp = (value, min, max) => Math.min(Math.max(Number(value || 0), min), max);
const median = (values) => {
  const rows = values.map(Number).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
};
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function isLandListing(listing) {
  const type = normalize(listing.propertyType);
  const title = normalize(listing.title);
  if (/\bterrain\b|\bparcelle\b/.test(type)) return true;
  return /^(terrain|parcelle)\b/.test(title)
    || /\bterrain (constructible|agricole|industriel|commercial|professionnel|d activite|a batir)\b/.test(title);
}

export function isProfessionalListing(listing) {
  const type = normalize(listing.propertyType);
  const title = normalize(listing.title);
  const professional = /\b(local commercial|murs commerciaux|bureau|entrepot|hangar|atelier|local d activite|batiment industriel|immobilier d entreprise)\b/;
  if (professional.test(type)) return true;
  return /^(vente |location )?(local commercial|murs commerciaux|bureau|entrepot|hangar|atelier|local d activite|batiment industriel)\b/.test(title);
}

export function isUnsupportedValuationListing(listing) {
  return isLandListing(listing) || isProfessionalListing(listing);
}

function propertyGroup(listing) {
  const text = normalize(`${listing.propertyType || ""} ${listing.title || ""}`);
  if (/local|entrepot|hangar|activite|commerce|bureau|industriel|terrain/.test(text)) return "professional";
  if (/appartement|studio/.test(text)) return "apartment";
  if (/immeuble/.test(text)) return "building";
  return "house";
}

function department(listing) {
  return String(listing.postalCode || "").slice(0, 2);
}

function pricePerM2(listing) {
  const price = Number(listing.askingPrice);
  const surface = Number(listing.surfaceM2);
  return price > 0 && surface > 0 ? price / surface : null;
}

function marketReference(listing, references) {
  const key = `${normalize(listing.city).replace(/\s+/g, "-")}:${listing.postalCode || ""}`;
  const reference = references?.[key];
  if (!reference) return null;
  const type = propertyGroup(listing) === "apartment" ? reference.apartment : reference.house;
  return type?.salePriceM2 ? { ...type, observedAt: reference.observedAt, observedLabel: reference.observedLabel, source: reference.source, sourceUrl: reference.sourceUrl } : null;
}

function comparableMarket(listing, listings, references) {
  const external = marketReference(listing, references);
  if (external) return {
    averagePriceM2: external.salePriceM2,
    comparableCount: null,
    comparableScope: "commune",
    marketSource: external.source,
    marketSourceUrl: external.sourceUrl,
    marketObservedAt: external.observedAt,
    rentM2: external.rentM2,
    saleLowM2: external.saleLowM2,
    saleHighM2: external.saleHighM2,
    rentLowM2: external.rentLowM2,
    rentHighM2: external.rentHighM2,
    marketObservedLabel: external.observedLabel
  };
  const group = propertyGroup(listing);
  const city = normalize(listing.city);
  const dep = department(listing);
  const valid = listings.filter((row) => propertyGroup(row) === group && pricePerM2(row));
  const cityRows = valid.filter((row) => normalize(row.city) === city);
  const departmentRows = valid.filter((row) => department(row) === dep);
  const selected = cityRows.length >= 3 ? cityRows : departmentRows.length >= 5 ? departmentRows : valid;
  return {
    averagePriceM2: median(selected.map(pricePerM2)),
    comparableCount: selected.length,
    comparableScope: cityRows.length >= 3 ? "ville" : departmentRows.length >= 5 ? "département" : "zone",
    marketSource: "annonces collectées",
    marketSourceUrl: null,
    marketObservedAt: null,
    rentM2: null,
    saleLowM2: null,
    saleHighM2: null,
    rentLowM2: null,
    rentHighM2: null,
    marketObservedLabel: null
  };
}

function rentPerM2(listing) {
  const city = normalize(listing.city);
  const table = [
    [/tours/, 14], [/orleans/, 13], [/chartres/, 12.5], [/blois/, 11], [/bourges/, 10],
    [/chateauroux/, 9.5], [/romorantin/, 9.5], [/gien/, 9], [/vierzon/, 9]
  ];
  const base = table.find(([pattern]) => pattern.test(city))?.[1] ?? 9.5;
  return propertyGroup(listing) === "house" ? base * .9 : base;
}

function shortTermAssumptions(listing) {
  const group = propertyGroup(listing);
  if (group === "professional") return null;
  const surface = Number(listing.surfaceM2 || 45);
  const rooms = Number(listing.rooms || Math.max(1, Math.round(surface / 30)));
  const city = normalize(listing.city);
  const cityFactor = /orleans|tours|chartres/.test(city) ? 1.18 : /blois|bourges/.test(city) ? 1.08 : .92;
  return {
    adr: Math.round(clamp((42 + surface * .48 + Math.max(0, rooms - 1) * 7) * cityFactor, 48, 190)),
    occupancyPct: /orleans|tours/.test(city) ? 54 : /blois|bourges|chartres/.test(city) ? 48 : 42
  };
}

function buildQuickProject(listing, market) {
  const project = createDefaultProject();
  const surface = Number(listing.surfaceM2 || 0);
  const group = propertyGroup(listing);
  const hasWorks = Boolean(listing.hasWorksSignal) || /a renover|à rénover|travaux|dans son jus|rafraichir|rafraîchir/i.test(`${listing.title || ""} ${listing.description || ""}`);
  const works = surface > 0 ? Math.round(surface * (hasWorks ? 600 : 80)) : 0;
  const estimatedRent = group === "professional"
    ? Number(listing.askingPrice || 0) * .075 / 12
    : surface * (market.rentM2 || rentPerM2(listing));
  const resalePrice = market.averagePriceM2 && surface ? market.averagePriceM2 * surface : Number(listing.askingPrice || 0);
  const short = shortTermAssumptions(listing);
  project.name = listing.title || "Annonce";
  project.city = listing.city || "";
  project.sourceUrl = listing.sourceUrl || "";
  project.dpe = listing.dpe || "Non renseigné";
  project.acquisition.purchasePrice = Number(listing.askingPrice || 0);
  // Le prix d'annonce est présumé honoraires d'agence inclus lorsqu'il provient d'une agence.
  // Aucun forfait supplémentaire n'est ajouté sans donnée explicite de l'annonce.
  project.acquisition.agencyFees = 0;
  project.acquisition.surfaceM2 = surface;
  project.acquisition.works = works;
  project.acquisition.furniture = group === "professional" ? 0 : Math.round(Math.min(12000, Math.max(2500, surface * 100)));
  // Montage cible : SCI à l'IS, apport symbolique et durée longue.
  // L'apport est fixe afin de ne pas favoriser artificiellement les biens chers.
  project.financing.downPayment = 1500;
  project.financing.durationYears = 25;
  project.longTerm.vacancyMonths = 1;
  project.longTerm.vacancyPct = 0;
  project.longTerm.monthlyRent = Math.round(estimatedRent);
  project.longTerm.propertyTaxAnnual = Math.round(project.acquisition.purchasePrice * .012);
  project.longTerm.pnoAnnual = group === "professional" ? 450 : 180;
  project.longTerm.cfeAnnual = 0;
  project.longTerm.ownerUtilitiesAnnual = 0;
  project.longTerm.otherAnnual = 120;
  project.longTerm.coproNonRecoverableAnnual = group === "apartment" ? Math.round(surface * 12) : 0;
  if (short) {
    project.shortTerm.units = 1;
    project.shortTerm.adr = short.adr;
    project.shortTerm.occupancyPct = short.occupancyPct;
    project.shortTerm.availableNights = 330;
    project.shortTerm.conciergePct = 0;
    project.shortTerm.utilitiesAnnual = Math.round(1800 + surface * 15);
  } else {
    project.shortTerm.adr = 0;
    project.shortTerm.occupancyPct = 0;
  }
  project.flip.resalePrice = Math.round(resalePrice);
  // Modèle Berry : revente directe, sans commission d'agence.
  project.flip.sellingAgencyPct = 0;
  project.projection.years = 25;
  project.marketReference = market.averagePriceM2 ? {
    source: market.marketSource,
    sourceUrl: market.marketSourceUrl,
    observedAt: market.marketObservedAt,
    observedLabel: market.marketObservedLabel,
    saleLowM2: market.saleLowM2,
    saleAverageM2: market.averagePriceM2,
    saleHighM2: market.saleHighM2,
    rentLowM2: market.rentLowM2,
    rentAverageM2: market.rentM2,
    rentHighM2: market.rentHighM2
  } : null;
  return { project, works, estimatedRent: Math.round(estimatedRent), short };
}

export function quickEstimateListing(listing, listings = [], marketReferences = {}) {
  const currentPriceM2 = pricePerM2(listing);
  const market = comparableMarket(listing, listings, marketReferences);
  const { project, works, estimatedRent, short } = buildQuickProject(listing, market);
  const result = analyzeProject(project);
  const marketDiscountPct = currentPriceM2 && market.averagePriceM2 ? (market.averagePriceM2 - currentPriceM2) / market.averagePriceM2 * 100 : null;
  const confidenceSignals = [listing.askingPrice, listing.surfaceM2, listing.city, listing.postalCode, listing.dpe, market.comparableCount >= 3];
  const dataConfidence = confidenceSignals.filter(Boolean).length / confidenceSignals.length;
  const strategies = [
    { id: "long-term", label: "Location longue", value: result.longTerm.cashflowAfterTaxMonthly },
    ...(short ? [{ id: "short-term", label: "Courte durée", value: result.shortTerm.cashflowAfterTaxMonthly }] : []),
    { id: "flip", label: "Revente", value: result.flip.netProfit }
  ];
  const rentalStrategies = strategies.filter((row) => row.id !== "flip");
  const bestRental = rentalStrategies.sort((a, b) => b.value - a.value)[0];
  const priceHistory = Array.isArray(listing.priceHistory) ? listing.priceHistory : [];
  const previousPrice = Number(listing.previousPrice || priceHistory.at(-2)?.askingPrice || 0) || null;
  return {
    ...listing,
    propertyGroup: propertyGroup(listing),
    pricePerM2: currentPriceM2,
    averagePriceM2: market.averagePriceM2,
    marketSaleLowM2: market.saleLowM2,
    marketSaleHighM2: market.saleHighM2,
    marketRentLowM2: market.rentLowM2,
    marketRentAverageM2: market.rentM2,
    marketRentHighM2: market.rentHighM2,
    comparableCount: market.comparableCount,
    comparableScope: market.comparableScope,
    marketSource: market.marketSource,
    marketSourceUrl: market.marketSourceUrl,
    marketObservedAt: market.marketObservedAt,
    marketDiscountPct,
    estimatedWorks: works,
    estimatedMonthlyRent: estimatedRent,
    estimatedAdr: short?.adr ?? null,
    estimatedOccupancyPct: short?.occupancyPct ?? null,
    longTermCashflowMonthly: result.longTerm.cashflowAfterTaxMonthly,
    shortTermCashflowMonthly: short ? result.shortTerm.cashflowAfterTaxMonthly : null,
    cashflowAfterTaxMonthly: bestRental?.value ?? result.longTerm.cashflowAfterTaxMonthly,
    bestRentalStrategy: bestRental?.label || "Location longue",
    estimatedResalePrice: result.flip.grossResalePrice,
    estimatedResaleProfit: result.flip.netProfit,
    bankabilityScore: result.bankability.score,
    dataConfidence,
    previousPrice,
    priceChange: previousPrice ? Number(listing.askingPrice) - previousPrice : 0,
    quickProject: project
  };
}

export function enrichRadarEstimates(listings = [], marketReferences = {}) {
  const excluded = /exemple|démo|demo|sample|viager|résidence\s+(services?|seniors?)|programme\s+neuf|appartements?\s+neufs?|maison\s+neuve|la\s+source(?:\s+université|\s+universite|\b)|promenade\s+des\s+sources/i;
  const cleanRows = listings.filter((listing) => !isUnsupportedValuationListing(listing) && !excluded.test(`${listing.sourceId || ""} ${listing.title || ""} ${listing.description || ""} ${listing.district || ""} ${listing.sourceUrl || ""}`));
  return cleanRows.map((listing) => quickEstimateListing(listing, cleanRows, marketReferences));
}
