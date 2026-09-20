import { createDefaultProject } from "./defaults.js";
import {
  analyzeProject,
  findCrossing,
  longTermProjection,
  occupancySensitivity,
  priceSensitivity,
  rateSensitivity,
  scenarioTable,
  viabilityRange
} from "./finance.js";
import { barChart, chartCard, lineChart } from "./charts.js";
import { createDefaultRadarConfig, rankCandidates } from "./radar.js";
import { enrichRadarEstimates } from "./radar-estimator.js";

const DRAFT_KEY = "radar-immo:draft:v1";
const SAVED_KEY = "radar-immo:projects:v1";
const THEME_KEY = "radar-immo:theme";
const RADAR_CONFIG_KEY = "radar-immo:watch-config:v1";
const RADAR_LISTINGS_KEY = "radar-immo:listings:v1";
const RADAR_DATA_VERSION_KEY = "radar-immo:data-version";
const RADAR_CONNECTOR_CHANNEL = "berry-radar-connector";
const app = document.querySelector("#app");

const e = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const euros = (value, digits = 0) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: digits }).format(Number(value || 0));
const percent = (value) => new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 2 }).format(Number(value || 0));
const compactEuros = (value) => new Intl.NumberFormat("fr-FR", { notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1 }).format(Number(value || 0));

function parseStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function mergeDefaults(defaults, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return structuredClone(defaults);
  const merged = structuredClone(defaults);
  Object.entries(value).forEach(([key, child]) => {
    if (child && typeof child === "object" && !Array.isArray(child) && merged[key] && typeof merged[key] === "object") merged[key] = mergeDefaults(merged[key], child);
    else merged[key] = child;
  });
  return merged;
}

function hydrateProject(value) {
  const hadAccountingMode = Boolean(value?.longTerm?.accountingMode);
  const project = mergeDefaults(createDefaultProject(), value);
  if (!hadAccountingMode) {
    project.longTerm.accountingMode = "internal";
    project.longTerm.accountingAnnual = 0;
  }
  return project;
}

const storedRadarListings = parseStorage(RADAR_LISTINGS_KEY, []).filter((listing) => !/exemple|démo|demo|sample/i.test(`${listing?.sourceId || ""} ${listing?.title || ""} ${listing?.sourceUrl || ""}`));
const storedDraft = parseStorage(DRAFT_KEY, createDefaultProject());
const migratedDraft = /exemple|démo|demo|sample/i.test(storedDraft?.name || "") ? createDefaultProject() : storedDraft;
if (localStorage.getItem(RADAR_DATA_VERSION_KEY) !== "2") {
  localStorage.setItem(RADAR_DATA_VERSION_KEY, "2");
  localStorage.setItem(RADAR_LISTINGS_KEY, JSON.stringify(storedRadarListings));
}

const state = {
  project: hydrateProject(migratedDraft),
  saved: parseStorage(SAVED_KEY, []).map(hydrateProject),
  radarConfig: mergeDefaults(createDefaultRadarConfig(), parseStorage(RADAR_CONFIG_KEY, createDefaultRadarConfig())),
  radarListings: storedRadarListings,
  radarHistory: {},
  radarStatus: { loading: true, connected: false, extensionCount: 0, lastRun: null, error: "" },
  page: "dashboard",
  formTab: "acquisition",
  theme: localStorage.getItem(THEME_KEY) || "dark",
  toast: ""
};
let extensionRadarListings = [];
const communeCache = new Map();

const comparablePlace = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function distanceKmBetween(first, second) {
  const toRadians = (value) => Number(value) * Math.PI / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const latitude1 = toRadians(first.latitude);
  const latitude2 = toRadians(second.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function communesForPostalCode(postalCode) {
  if (!communeCache.has(postalCode)) {
    const lookup = fetch(`https://geo.api.gouv.fr/communes?codePostal=${encodeURIComponent(postalCode)}&fields=nom,centre,population,codesPostaux&format=json&geometry=centre`)
      .then((response) => response.ok ? response.json() : [])
      .catch(() => []);
    communeCache.set(postalCode, lookup);
  }
  return communeCache.get(postalCode);
}

async function enrichRadarLocation(listing) {
  if (Number.isFinite(Number(listing.latitude)) && Number.isFinite(Number(listing.longitude))) {
    const correctedDistance = distanceKmBetween(state.radarConfig.centerCoordinates, { latitude: Number(listing.latitude), longitude: Number(listing.longitude) });
    return { ...listing, distanceKm: Math.round(correctedDistance * 10) / 10 };
  }
  if (Number.isFinite(Number(listing.distanceKm))) return listing;
  const postalCode = String(listing.postalCode || `${listing.title || ""} ${listing.rawText || ""}`.match(/\b(?:0[1-9]|[1-8]\d|9[0-5])\d{3}\b/)?.[0] || "");
  if (!postalCode) return listing;
  const communes = await communesForPostalCode(postalCode);
  if (!Array.isArray(communes) || !communes.length) return { ...listing, postalCode };
  const wanted = comparablePlace(listing.city);
  const context = comparablePlace(`${listing.title || ""} ${listing.rawText || ""}`);
  const commune = communes.find((row) => wanted && comparablePlace(row.nom) === wanted)
    || communes.find((row) => context.includes(comparablePlace(row.nom)))
    || (communes.length === 1 ? communes[0] : null);
  if (!commune?.centre?.coordinates) return { ...listing, postalCode };
  const [longitude, latitude] = commune.centre.coordinates;
  const distanceKm = distanceKmBetween(state.radarConfig.centerCoordinates, { latitude, longitude });
  return {
    ...listing,
    postalCode,
    city: commune.nom,
    cityPopulation: commune.population || 0,
    latitude,
    longitude,
    distanceKm: Math.round(distanceKm * 10) / 10
  };
}

async function enrichRadarLocations(listings) {
  const rows = Array.isArray(listings) ? listings : [];
  const enriched = new Array(rows.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      enriched[index] = await enrichRadarLocation(rows[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, rows.length) }, worker));
  return enriched;
}

function mergeRadarListings(remoteListings = state.radarListings) {
  const rows = [...(Array.isArray(remoteListings) ? remoteListings : []), ...extensionRadarListings];
  state.radarListings = [...new Map(rows.filter((listing) => !/exemple|démo|demo|sample/i.test(`${listing?.sourceId || ""} ${listing?.title || ""} ${listing?.sourceUrl || ""}`)).map((listing) => [`${listing.sourceId || "source"}:${listing.externalId || listing.sourceUrl || JSON.stringify(listing)}`, listing])).values()];
}

window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.channel !== RADAR_CONNECTOR_CHANNEL || event.data?.type !== "RADAR_LISTINGS") return;
  const payload = event.data.payload || {};
  extensionRadarListings = await enrichRadarLocations(payload.listings);
  mergeRadarListings(state.radarListings);
  state.radarStatus = {
    ...state.radarStatus,
    loading: false,
    connected: true,
    extensionCount: extensionRadarListings.length,
    lastRun: payload.updatedAt ? { started_at: payload.updatedAt } : state.radarStatus.lastRun,
    error: ""
  };
  persist();
  if (state.page === "radar") render();
});

window.postMessage({ channel: RADAR_CONNECTOR_CHANNEL, type: "RADAR_REQUEST_LISTINGS" }, location.origin);

document.documentElement.dataset.theme = state.theme;

const navItems = [
  ["dashboard", "⌂", "Tableau de bord"],
  ["analysis", "∑", "Analyse du projet"],
  ["sensitivity", "⌁", "Seuils & scénarios"],
  ["radar", "◎", "Radar annonces"],
  ["projects", "▣", "Projets enregistrés"],
  ["methodology", "?", "Méthodologie"]
];

const formTabs = [
  ["acquisition", "Le bien"],
  ["longTerm", "Revenus & charges"],
  ["financing", "Le prêt"],
  ["shortTerm", "Courte durée"],
  ["flip", "Achat-revente"],
  ["sci", "Fiscalité & projection"]
];

const controls = {
  acquisition: [
  ["acquisition.purchasePrice", "Prix d’achat négocié", 10000, 2000000, 1000, "€", "Prix hors frais annexes. Le financement et les rendements partent de cette valeur."],
    ["acquisition.surfaceM2", "Surface du logement", 1, 5000, 1, "m²", "Surface utile ou habitable utilisée pour le prix au m²."],
    ["acquisition.notaryRatePct", "Frais de notaire (% du prix)", 0, 12, .1, "%", "Hypothèse paramétrable. Le taux réel dépend de la nature de l’acquisition."],
    ["acquisition.works", "Travaux estimés", 0, 1000000, 1000, "€", "Budget travaux hors aléas."],
    ["acquisition.worksContingencyPct", "Aléas travaux (% du budget travaux)", 0, 50, 1, "%", "Provision de sécurité ajoutée au coût total."],
    ["acquisition.furniture", "Mobilier et équipement", 0, 200000, 500, "€", "Mobilier, électroménager et équipement initial."],
    ["acquisition.agencyFees", "Frais d’agence non inclus", 0, 150000, 500, "€", "À laisser à zéro lorsqu’ils sont déjà inclus dans le prix affiché."],
    ["acquisition.bankFees", "Frais bancaires", 0, 20000, 100, "€", "Frais de dossier du financeur."],
    ["acquisition.guaranteeRatePct", "Sûreté bancaire éventuelle (% du prix)", 0, 5, .1, "%", "0 % par défaut. À renseigner uniquement si l’offre prévoit des frais d’hypothèque, de caution ou de nantissement."],
    ["acquisition.brokerFees", "Courtier", 0, 20000, 100, "€", "Honoraires de courtage éventuels."],
    ["acquisition.diagnosticsAndStudies", "Diagnostics, études et audits", 0, 50000, 100, "€", "Audits techniques, diagnostics, architecte ou étude préalable."]
  ],
  financing: [
    ["financing.downPayment", "Apport total", 0, 500000, 1000, "€", "Le solde du coût total est considéré comme financé."],
    ["financing.annualRatePct", "Taux nominal du crédit", 0, 12, .05, "%", "Taux annuel hors assurance. Plage 0–12 %, pas 0,05 point."],
    ["financing.durationYears", "Durée du crédit", 5, 30, 1, "ans", "Durée d’amortissement du prêt."],
    ["financing.insuranceRatePct", "Assurance emprunteur (% du capital initial/an)", 0, 2, .01, "%", "Le modèle V1 calcule l’assurance sur le capital initial."],
    ["financing.deferredMonths", "Différé indicatif", 0, 36, 1, "mois", "Conservé dans le dossier. La V1 affiche la mensualité amortissable hors modélisation détaillée du différé."]
  ],
  longTerm: [
    ["longTerm.monthlyRent", "Loyer mensuel total hors charges", 0, 30000, 50, "€", "Somme des loyers de tous les lots."],
    ["longTerm.monthlyParkingAndAnnexes", "Parking et annexes par mois", 0, 5000, 25, "€", "Revenus de parkings, caves ou dépendances."],
    ["longTerm.rentDeferralMonths", "Différé de loyer", 0, 24, 1, "mois", "Période sans loyer prévue au démarrage ou pendant les travaux."],
    ["longTerm.vacancyMonths", "Vacance locative annuelle", 0, 12, .5, "mois", "Nombre moyen de mois non loués par an. Converti automatiquement en taux."],
    ["longTerm.vacancyPct", "Vacance longue durée (% des loyers)", 0, 30, .5, "%", "Perte de loyers liée aux périodes sans locataire."],
    ["longTerm.unpaidPct", "Provision impayés (% après vacance)", 0, 15, .5, "%", "Provision de risque sur les loyers après vacance."],
    ["longTerm.managementPct", "Gestion locative (% des loyers encaissés)", 0, 15, .5, "%", "Commission de gestion hors GLI."],
    ["longTerm.gliPct", "GLI (% des loyers encaissés)", 0, 8, .1, "%", "Assurance loyers impayés."],
    ["longTerm.maintenancePct", "Entretien courant (% des loyers encaissés)", 0, 20, .5, "%", "Provision annuelle de maintenance et petites réparations."],
    ["longTerm.propertyTaxAnnual", "Taxe foncière annuelle", 0, 30000, 100, "€", "Part restant à la charge du propriétaire."],
    ["longTerm.coproNonRecoverableAnnual", "Copropriété non récupérable/an", 0, 30000, 100, "€", "Charges de copropriété non refacturables."],
    ["longTerm.pnoAnnual", "Assurance PNO/an", 0, 10000, 50, "€", "Assurance propriétaire non occupant."],
    ["longTerm.accountingAnnual", "Coût comptable annuel", 0, 10000, 100, "€", "0 € en tenue interne. Conserver un budget ponctuel si une validation ou une liasse externe devient nécessaire."],
    ["longTerm.cfeAnnual", "CFE/an", 0, 10000, 50, "€", "Hypothèse de cotisation foncière des entreprises."],
    ["longTerm.ownerUtilitiesAnnual", "Fluides restant au propriétaire/an", 0, 30000, 100, "€", "Eau, électricité, internet ou chauffage collectif non récupéré."],
    ["longTerm.otherAnnual", "Autres charges annuelles", 0, 30000, 100, "€", "Toute charge récurrente non classée ailleurs."]
  ],
  shortTerm: [
    ["shortTerm.units", "Nombre d’unités louées", 1, 50, 1, "unités", "Nombre de logements commercialisés séparément."],
    ["shortTerm.adr", "Prix moyen par nuit et par unité", 10, 1500, 5, "€", "ADR moyen, toutes saisons confondues."],
    ["shortTerm.occupancyPct", "Taux d’occupation (% des nuits disponibles)", 0, 100, 1, "%", "Le point mort est recalculé automatiquement."],
    ["shortTerm.availableNights", "Nuits disponibles/an et par unité", 30, 365, 1, "nuits", "Après fermetures, usage personnel et contraintes réglementaires."],
    ["shortTerm.averageStayNights", "Durée moyenne de séjour", 1, 30, .5, "nuits", "Détermine le nombre de rotations et les coûts par séjour."],
    ["shortTerm.platformPct", "Commission plateformes (% du CA LCD)", 0, 30, .5, "%", "Commission Airbnb, Booking et autres plateformes."],
    ["shortTerm.conciergePct", "Commission conciergerie (% du CA LCD)", 0, 40, .5, "%", "Commission appliquée au chiffre d’affaires LCD."],
    ["shortTerm.cleaningChargedPerStay", "Ménage facturé au voyageur/séjour", 0, 500, 5, "€", "Recette ménage ajoutée au CA."],
    ["shortTerm.cleaningCostPerStay", "Coût réel du ménage/séjour", 0, 500, 5, "€", "Coût du prestataire ou du temps de ménage."],
    ["shortTerm.linenCostPerStay", "Linge/séjour", 0, 200, 1, "€", "Blanchisserie et location du linge par rotation."],
    ["shortTerm.consumablesPerStay", "Consommables/séjour", 0, 100, 1, "€", "Accueil, papier, café, produits et consommables."],
    ["shortTerm.maintenancePct", "Maintenance (% du CA hébergement)", 0, 20, .5, "%", "Provision pour usure, casse et remplacement."],
    ["shortTerm.utilitiesAnnual", "Eau, énergie et internet/an", 0, 50000, 100, "€", "Fluides et abonnements supportés par l’exploitant."],
    ["shortTerm.softwareAnnual", "Logiciels et channel manager/an", 0, 10000, 50, "€", "PMS, channel manager, automatisations et serrures."],
    ["shortTerm.otherAnnual", "Autres charges LCD/an", 0, 30000, 100, "€", "Autres coûts d’exploitation courte durée."]
  ],
  flip: [
    ["flip.resalePrice", "Prix de revente affiché estimé", 10000, 3000000, 1000, "€", "Prix cible avant négociation de l’acquéreur."],
    ["flip.resaleNegotiationPct", "Négociation à la revente (% du prix affiché)", 0, 25, .5, "%", "Décote appliquée pour obtenir le prix net vendeur estimé."],
    ["flip.sellingAgencyPct", "Commission de revente (% du prix net)", 0, 15, .5, "%", "Honoraires de commercialisation à la sortie."],
    ["flip.holdingMonths", "Durée totale de portage", 1, 36, 1, "mois", "Travaux, délais administratifs et commercialisation."],
    ["flip.carryingCostMonthly", "Coût de portage hors crédit/mois", 0, 10000, 50, "€", "Énergie, assurance, taxe, sécurité et charges pendant le portage."],
    ["flip.divisionAndLegalFees", "Division, géomètre et juridique", 0, 100000, 500, "€", "Frais liés à une division ou restructuration juridique."],
    ["flip.commercialisationFees", "Commercialisation et diagnostics", 0, 100000, 500, "€", "Photos, diagnostics et frais de mise en vente hors commission."],
    ["flip.otherCosts", "Autres coûts achat-revente", 0, 100000, 500, "€", "Provision pour les coûts spécifiques non listés."]
  ],
  sci: [
    ["acquisition.landSharePct", "Quote-part terrain non amortissable (% du prix)", 0, 50, 1, "%", "Le terrain est exclu de la base amortissable. Cette quote-part doit être documentée."],
    ["sci.buildingDepYears", "Durée d’amortissement du bâti", 15, 60, 1, "ans", "Hypothèse moyenne simplifiée."],
    ["sci.worksDepYears", "Durée d’amortissement des travaux", 5, 40, 1, "ans", "Durée moyenne simplifiée pour les travaux."],
    ["sci.furnitureDepYears", "Durée d’amortissement du mobilier", 3, 15, 1, "ans", "Durée moyenne simplifiée du mobilier."],
    ["sci.feesDepYears", "Durée d’amortissement des frais", 1, 15, 1, "ans", "Traitement simplifié paramétrable des frais."],
    ["sci.reducedTaxThreshold", "Plafond du taux réduit d’IS", 0, 200000, 500, "€", "L’éligibilité au taux réduit dépend des conditions légales de la société."],
    ["sci.reducedTaxRatePct", "Taux réduit d’IS", 0, 40, .5, "%", "Taux appliqué jusqu’au plafond saisi."],
    ["sci.normalTaxRatePct", "Taux normal d’IS", 0, 50, .5, "%", "Taux appliqué au-delà du plafond."],
    ["projection.rentGrowthPct", "Indexation annuelle des loyers", -5, 10, .25, "%", "Hypothèse de progression des revenus."],
    ["projection.chargesInflationPct", "Inflation annuelle des charges", -5, 15, .25, "%", "Hypothèse de progression des dépenses."],
    ["projection.propertyGrowthPct", "Évolution annuelle estimée du bien", -10, 15, .25, "%", "Hypothèse patrimoniale, sans garantie de marché."]
  ]
};

function getPath(object, path) { return path.split(".").reduce((value, key) => value?.[key], object); }
function setPath(object, path, value) {
  const keys = path.split(".");
  const copy = structuredClone(object);
  let cursor = copy;
  keys.slice(0, -1).forEach((key) => { cursor = cursor[key]; });
  cursor[keys.at(-1)] = value;
  return copy;
}
function persist() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state.project));
  localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved));
  localStorage.setItem(RADAR_CONFIG_KEY, JSON.stringify(state.radarConfig));
  localStorage.setItem(RADAR_LISTINGS_KEY, JSON.stringify(state.radarListings));
}
function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { state.toast = ""; render(); }, 2400);
}

function formatScale(value, unit) {
  if (unit === "€") return euros(value);
  if (unit === "%") return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} %`;
  if (unit === "ans") return `${value} ans`;
  if (unit === "mois") return `${value} mois`;
  if (unit === "nuits") return `${value} nuits`;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)}${unit ? ` ${unit}` : ""}`;
}

function controlHtml(definition) {
  const [path, label, min, max, step, unit, help] = definition;
  const value = Number(getPath(state.project, path) || 0);
  const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  return `<div class="control-card">
    <div class="control-heading"><div><label>${e(label)}</label><span class="help-icon" title="${e(help)}">ⓘ</span></div><span class="current-value">${e(formatScale(value, unit))}</span></div>
    <div class="control-grid">
      <div class="slider-zone">
        <input class="range-control" data-path="${e(path)}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${e(label)}">
        <div class="scale-labels"><span>Min. ${e(formatScale(min, unit))}</span><span>Pas ${e(formatScale(step, unit))}</span><span>Max. ${e(formatScale(max, unit))}</span></div>
      </div>
      <div class="number-field"><input class="number-control" data-path="${e(path)}" type="number" min="${min}" max="${max}" step="${step}" value="${value.toFixed(decimals)}"><span>${e(unit)}</span></div>
    </div>
    <p class="control-help">${e(help)}</p>
  </div>`;
}

function kpi(label, value, hint) { return `<article class="kpi-card"><span>${e(label)}</span><strong>${e(value)}</strong><small>${e(hint)}</small></article>`; }

function strategyCard(result, recommended = false) {
  const rental = Object.hasOwn(result, "cashflowAfterTaxMonthly");
  const positive = rental ? result.cashflowAfterTaxMonthly >= 0 : result.netProfit >= 0;
  const main = rental ? euros(result.cashflowBeforeTaxAnnual / 12) : euros(result.netProfit);
  const reachable = rental && !positive && (result.strategy === "Longue durée"
    ? result.breakEvenBeforeTax <= state.project.longTerm.monthlyRent * 1.15
    : result.breakEvenBeforeTax <= Math.min(100, state.project.shortTerm.occupancyPct + 10));
  const displayVerdict = reachable ? "Équilibre accessible" : result.verdict;
  const metrics = rental ? [
    ["CA brut annuel", euros(result.grossRevenueAnnual)],
    ["NOI annuel", euros(result.noiAnnual)],
    ["Rentabilité brute", percent(result.grossYield)],
    ["Rentabilité nette", percent(result.netYield)],
    ["DSCR", result.dscr.toFixed(2)],
    ["Cash-flow après IS estimé", `${euros(result.cashflowAfterTaxMonthly)}/mois`],
    [result.strategy === "Longue durée" ? "Loyer CF positif avant impôt" : "Occupation CF positif avant impôt", result.strategy === "Longue durée" ? euros(result.breakEvenBeforeTax) : `${result.breakEvenBeforeTax.toFixed(1)} %`]
  ] : [
    ["Prix net de revente", euros(result.netResalePrice)],
    ["Marge avant IS", euros(result.profitBeforeTax)],
    ["IS estimé", euros(result.corporateTax)],
    ["Rendement sur cash", percent(result.returnOnCash)],
    ["Marge sur revente", percent(result.marginOnResale)],
    ["Revente de point mort", euros(result.breakEvenResalePrice)]
  ];
  return `<article class="strategy-card ${recommended ? "recommended" : ""}">
    <div class="strategy-title"><div><span class="eyebrow">${recommended ? "Stratégie recommandée" : "Simulation"}</span><h3>${e(result.strategy)}</h3></div><span class="verdict ${positive || reachable ? "positive" : "negative"}">${e(displayVerdict)}</span></div>
    <div class="main-result ${(rental ? result.cashflowBeforeTaxAnnual >= 0 : positive) ? "positive-text" : "negative-text"}">${e(main)}<small>${rental ? "/ mois avant impôt" : " de marge nette estimée"}</small></div>
    <dl class="metric-list">${metrics.map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join("")}</dl>
    <div class="score-row"><span>Score transparent</span><strong>${result.score.toFixed(0)}/100</strong></div><div class="score-track"><span style="width:${result.score}%"></span></div>
  </article>`;
}

function pageLabel(page) {
  return navItems.find(([key]) => key === page)?.[2] ?? "Radar Immo";
}

function getRecommendation(result) {
  return [result.longTerm, result.shortTerm, result.flip].sort((a, b) => b.score - a.score)[0];
}

function projectWarnings(result) {
  const warnings = [];
  if (["F", "G"].includes(state.project.dpe)) warnings.push(`DPE ${state.project.dpe} : intégrer les contraintes de location et le coût réel de rénovation énergétique.`);
  if (result.longTerm.cashflowAfterTaxMonthly < 0) warnings.push(`Longue durée négative de ${euros(Math.abs(result.longTerm.cashflowAfterTaxMonthly))}/mois après IS estimé.`);
  if (result.shortTerm.cashflowAfterTaxMonthly < 0) warnings.push(`Courte durée négative de ${euros(Math.abs(result.shortTerm.cashflowAfterTaxMonthly))}/mois après IS estimé.`);
  if (result.longTerm.dscr < 1) warnings.push(`DSCR longue durée inférieur à 1 (${result.longTerm.dscr.toFixed(2)}) : le NOI ne couvre pas la dette.`);
  if (result.shortTerm.breakEven > 85) warnings.push(`Point mort LCD très élevé (${result.shortTerm.breakEven.toFixed(1)} % d’occupation).`);
  if (state.project.acquisition.worksContingencyPct < 10 && state.project.acquisition.works > 0) warnings.push("Provision d’aléas travaux inférieure à 10 %.");
  if (!state.project.sourceUrl) warnings.push("Lien de l’annonce non renseigné : la traçabilité du dossier est incomplète.");
  return warnings;
}

function headerActions() {
  return `<div class="top-actions">
    <button class="secondary" data-action="theme" title="Changer de thème">${state.theme === "dark" ? "☀ Clair" : "◐ Sombre"}</button>
    <button class="secondary" data-action="export-current">⇩ Exporter</button>
    <button class="primary" data-action="save">＋ Enregistrer</button>
  </div>`;
}

function shell(content) {
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">R</div><div><strong>Radar Immo</strong><span>Analyse privée</span></div></div>
      <nav>${navItems.map(([key, icon, label]) => `<button data-page="${key}" class="${state.page === key ? "active" : ""}"><span class="nav-icon">${icon}</span><span>${e(label)}</span></button>`).join("")}</nav>
      <div class="sidebar-note"><span class="status-dot"></span><div><strong>Données locales</strong><p>Les projets restent dans ce navigateur. Aucun compte ni serveur de données.</p></div></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div><span class="eyebrow">${e(state.project.city || "Projet sans ville")}</span><h1>${e(pageLabel(state.page))} — ${e(state.project.name || "Sans titre")}</h1></div>${headerActions()}</header>
      <main class="content">${content}</main>
    </div>
  </div>${state.toast ? `<div class="toast">${e(state.toast)}</div>` : ""}<input id="import-json" class="hidden" type="file" accept="application/json,.json"><input id="import-radar-json" class="hidden" type="file" accept="application/json,.json">`;
}

function dashboardHtml() {
  const result = analyzeProject(state.project);
  const internalProject = setPath(setPath(state.project, "longTerm.accountingMode", "internal"), "longTerm.accountingAnnual", 0);
  const externalProject = setPath(setPath(state.project, "longTerm.accountingMode", "external"), "longTerm.accountingAnnual", 1200);
  const internalCashflow = analyzeProject(internalProject).longTerm.cashflowAfterTaxMonthly;
  const externalCashflow = analyzeProject(externalProject).longTerm.cashflowAfterTaxMonthly;
  const recommendation = getRecommendation(result);
  const scenarios = scenarioTable(state.project);
  const occupancy = occupancySensitivity(state.project);
  const warnings = projectWarnings(result);
  const bankability = result.bankability;
  const strategyReason = recommendation.strategy === "Achat-revente"
    ? `${euros(recommendation.netProfit)} de marge nette estimée sur ${state.project.flip.holdingMonths} mois.`
    : `${euros(recommendation.cashflowAfterTaxMonthly)}/mois après IS estimé, score ${recommendation.score.toFixed(0)}/100.`;
  const scenarioBars = scenarios.map((row) => ({ name: row.name, value: recommendation.strategy === "Longue durée" ? row.longTermMonthly : recommendation.strategy === "Courte durée" ? row.shortTermMonthly : row.flipNetProfit / Math.max(1, state.project.flip.holdingMonths) }));

  return `<div class="page-stack">
    <section class="hero-panel">
      <div><span class="eyebrow">Moteur de décision</span><h2>${e(state.project.name)}</h2><p>${e(state.project.city)} · DPE ${e(state.project.dpe)} · coût total estimé ${e(euros(result.acquisition.totalProjectCost))}</p></div>
      <div class="hero-actions"><button class="secondary" data-page="analysis">Modifier les hypothèses</button><button class="primary" data-page="sensitivity">Voir les seuils</button></div>
    </section>

    <section class="kpi-grid">
      ${kpi("Coût total du projet", euros(result.acquisition.totalProjectCost), `dont ${euros(result.acquisition.notaryFees)} de frais de notaire`)}
      ${kpi("Montant financé", euros(result.loan.principal), `${euros(result.acquisition.equity)} d’apport`)}
      ${kpi("Mensualité complète", euros(result.loan.monthlyDebtService), `capital + intérêts + ${euros(result.loan.monthlyInsurance)} d’assurance`)}
      ${kpi("Amortissements SCI IS", euros(result.depreciationAnnual), "estimation annuelle paramétrable")}
      ${kpi("Note bancaire SCI IS", `${bankability.score.toFixed(0)}/100`, bankability.verdict)}
    </section>

    <section class="panel recommendation-panel">
      <div class="section-title"><div><span class="eyebrow">Comparaison automatique</span><h2>${e(recommendation.strategy)} arrive en tête</h2></div><p>${e(strategyReason)}</p></div>
      <div class="strategy-grid">
        ${strategyCard(result.longTerm, recommendation.strategy === result.longTerm.strategy)}
        ${strategyCard(result.shortTerm, recommendation.strategy === result.shortTerm.strategy)}
        ${strategyCard(result.flip, recommendation.strategy === result.flip.strategy)}
      </div>
    </section>

    <section class="panel">
      <div class="section-title"><div><span class="eyebrow">Financement professionnel</span><h2>Bancabilité SCI à l’IS</h2></div><p>Analyse basée uniquement sur la société et l’opération, sans revenus personnels.</p></div>
      <div class="threshold-grid">
        <article class="threshold-card"><span>DSCR avant IS</span><strong>${bankability.dscr.toFixed(2)}×</strong><small>Objectif bancaire courant : ≥ 1,20×</small></article>
        <article class="threshold-card"><span>Cash-flow après IS</span><strong class="${bankability.cashflowAfterTaxMonthly >= 0 ? "positive-text" : "negative-text"}">${euros(bankability.cashflowAfterTaxMonthly)}/mois</strong><small>Après dette et IS estimé</small></article>
        <article class="threshold-card"><span>Apport / coût total</span><strong>${percent(bankability.equityRatio)}</strong><small>Effort de fonds propres</small></article>
        <article class="threshold-card"><span>Dette / coût total</span><strong>${percent(bankability.loanToCost)}</strong><small>Levier de l’opération</small></article>
      </div>
      <p class="control-help">${e(bankability.comment)}</p>
    </section>

    <section class="panel">
      <div class="section-title"><div><span class="eyebrow">Charges évitables</span><h2>Comptabilité SCI : interne ou cabinet</h2></div><p>Comparaison isolant uniquement le coût comptable, toutes les autres hypothèses restant identiques.</p></div>
      <div class="threshold-grid">
        <article class="threshold-card"><span>Tenue interne</span><strong class="${internalCashflow >= 0 ? "positive-text" : "negative-text"}">${euros(internalCashflow)}/mois</strong><small>0 €/an par défaut</small></article>
        <article class="threshold-card"><span>Cabinet externe</span><strong class="${externalCashflow >= 0 ? "positive-text" : "negative-text"}">${euros(externalCashflow)}/mois</strong><small>Hypothèse 1 200 €/an</small></article>
        <article class="threshold-card"><span>Gain de trésorerie</span><strong>${euros(internalCashflow - externalCashflow)}/mois</strong><small>Écart après effet estimé de l’IS</small></article>
        <article class="threshold-card"><span>Mode retenu</span><strong>${e(state.project.longTerm.accountingMode === "internal" ? "Interne" : state.project.longTerm.accountingMode === "hybrid" ? "Hybride" : "Cabinet")}</strong><small>${euros(state.project.longTerm.accountingAnnual)}/an</small></article>
      </div>
    </section>

    <section class="charts-grid">
      ${chartCard("Stress test du scénario recommandé", recommendation.strategy === "Achat-revente" ? "Marge mensuelle équivalente par scénario" : "Cash-flow mensuel après IS estimé", barChart(scenarioBars, { labelKey: "name", valueKey: "value", formatY: compactEuros }))}
      ${chartCard("Sensibilité de la courte durée", `Point mort estimé : ${result.shortTerm.breakEven.toFixed(1)} % d’occupation`, lineChart(occupancy, { xKey: "occupancy", series: [{ key: "cashflow", label: "Cash-flow LCD", color: "var(--chart1)" }], formatX: (v) => `${v} %`, formatY: compactEuros }))}
    </section>

    <section class="panel">
      <div class="section-title"><div><span class="eyebrow">Contrôles de cohérence</span><h2>Risques et informations à confirmer</h2></div><p>${warnings.length} point${warnings.length > 1 ? "s" : ""} relevé${warnings.length > 1 ? "s" : ""}</p></div>
      ${warnings.length ? `<ul class="risk-list">${warnings.map((warning) => `<li>${e(warning)}</li>`).join("")}</ul>` : `<div class="success-box">Aucun signal critique détecté avec les hypothèses actuelles.</div>`}
    </section>
  </div>`;
}

function radarHtml() {
  const config = state.radarConfig;
  const estimated = enrichRadarEstimates(state.radarListings);
  const listings = rankCandidates(estimated, config);
  const qualified = listings.filter((listing) => listing.qualified);
  const drops = listings.filter((listing) => Number(listing.priceChange) < 0);
  const formatDate = (value) => value ? new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
  const compactMoney = (value) => Number.isFinite(Number(value)) ? euros(value) : "—";
  const priceChangeHtml = (item) => Number(item.priceChange)
    ? `<span class="price-change ${Number(item.priceChange) < 0 ? "down" : "up"}">${Number(item.priceChange) < 0 ? "↓" : "↑"} ${e(euros(Math.abs(item.priceChange)))}</span>`
    : `<span class="price-stable">Stable</span>`;
  const sourceStats = state.radarStatus.sources || [];
  const top = listings.filter((item) => item.inArea).slice(0, 6);
  return `<div class="page-stack radar-page">
    <section class="hero-panel"><div><span class="eyebrow">Analyse automatique · SCI à l’IS</span><h2>Biens analysés en priorité</h2><p>Chaque annonce est comparée au prix au m² du lot, puis simulée en location longue durée, courte durée et revente. Les chiffres marqués « estimation » servent au tri rapide avant vérification des charges, loyers et travaux.</p></div><div class="hero-actions"><button class="secondary" data-action="import-radar-listings">Importer un JSON</button><button class="primary" data-action="refresh-radar">Actualiser maintenant</button></div></section>
    <section class="kpi-grid">
      ${kpi("Biens analysés", String(listings.length), "aucune donnée de démonstration")}
      ${kpi("CF ≥ 100 €", String(qualified.length), "meilleure stratégie locative estimée")}
      ${kpi("Baisses de prix", String(drops.length), "depuis la première collecte")}
      ${kpi("Dernière collecte", state.radarStatus.lastRun?.started_at ? formatDate(state.radarStatus.lastRun.started_at) : "En attente", state.radarStatus.extensionCount ? `${state.radarStatus.extensionCount} annonces issues de l’extension` : "collecteur serveur")}
    </section>
    <section class="panel ${state.radarStatus.connected ? "success-box" : "warning"}"><strong>${state.radarStatus.connected ? "Import automatique actif" : "Import automatique incomplet"}</strong><p>${state.radarStatus.connected ? `Les annonces du collecteur quotidien et de l’extension Chrome sont fusionnées automatiquement. ${sourceStats.length ? sourceStats.map((source) => `${source.label || source.id} : ${source.ok ? source.count : "indisponible"}`).join(" · ") : ""}` : e(state.radarStatus.error || "Aucune collecte disponible.")}</p></section>
    <section class="panel quick-assumptions"><div class="section-title"><div><span class="eyebrow">Hypothèses rapides SCI à l’IS</span><h2>Calcul immédiat, puis validation</h2></div><p>Financement sur 25 ans, apport symbolique de 1 500 €, 4,2 % + 0,3 % d’assurance, notaire 8 %, sûreté bancaire à 0 €, un mois de vacance locative par an et comptabilité interne à 0 €. Travaux : 600 €/m² si signal de rénovation, sinon réserve de 80 €/m².</p></div></section>
    ${top.length ? `<section class="analysis-grid">${top.map((item, index) => `<article class="analysis-card ${item.qualified ? "qualified" : ""}">
      <div class="analysis-card-head"><div><span class="eyebrow">${e(item.sourceId || "source")} · ${e(item.city || "ville inconnue")}</span><h3>${e(item.title || "Sans titre")}</h3></div><strong class="radar-score">${item.score.toFixed(0)}</strong></div>
      <div class="analysis-price"><strong>${e(euros(item.askingPrice))}</strong><span>${item.pricePerM2 ? `${e(euros(item.pricePerM2))}/m²` : "surface inconnue"}</span>${priceChangeHtml(item)}</div>
      <div class="analysis-metrics"><span>Marché estimé<strong>${item.averagePriceM2 ? `${e(euros(item.averagePriceM2))}/m²` : "—"}</strong></span><span>Location longue<strong class="${item.longTermCashflowMonthly >= 100 ? "positive-text" : "negative-text"}">${e(compactMoney(item.longTermCashflowMonthly))}/mois</strong></span><span>Courte durée<strong class="${item.shortTermCashflowMonthly >= 100 ? "positive-text" : "negative-text"}">${item.shortTermCashflowMonthly === null ? "Non adaptée" : `${e(compactMoney(item.shortTermCashflowMonthly))}/mois`}</strong></span><span>Revente estimée<strong class="${item.estimatedResaleProfit >= 0 ? "positive-text" : "negative-text"}">${e(compactMoney(item.estimatedResaleProfit))}</strong></span></div>
      <div class="analysis-dates"><span>Collectée ${formatDate(item.firstSeenAt || item.capturedAt || item.receivedAt)}</span><span>Mise à jour ${formatDate(item.priceChangedAt || item.updatedAt || item.lastSeenAt || item.capturedAt)}</span></div>
      <div class="analysis-actions"><a class="secondary" href="${e(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Voir l’annonce</a><button class="primary" data-action="analyze-listing" data-key="${e(item.fingerprint || item.sourceUrl)}">Simulation complète</button></div>
    </article>`).join("")}</section>` : ""}
    <section class="panel"><div class="section-title"><div><span class="eyebrow">Base collectée</span><h2>Toutes les annonces réelles</h2></div><p>${listings.length} annonces dédupliquées. Les prix au m² sont calculés sur les annonces comparables actuellement disponibles : ${new Set(listings.map((item) => item.city).filter(Boolean)).size} communes couvertes.</p></div>${listings.length ? `<div class="table-wrap radar-table"><table><thead><tr><th>Annonce</th><th>Prix / évolution</th><th>€/m² vs marché</th><th>CF longue</th><th>CF courte</th><th>Revente</th><th>Collecte</th><th>Mise à jour</th><th></th></tr></thead><tbody>${listings.map((item) => `<tr><td><a href="${e(item.sourceUrl)}" target="_blank" rel="noopener noreferrer"><strong>${e(item.title || "Sans titre")}</strong><small>${e(item.city || "—")} · ${Number.isFinite(Number(item.distanceKm)) ? `${Number(item.distanceKm).toFixed(0)} km` : "distance inconnue"} · ${e(item.sourceId || "source")}</small></a></td><td><strong>${e(euros(item.askingPrice))}</strong>${priceChangeHtml(item)}</td><td>${item.pricePerM2 ? `<strong>${e(euros(item.pricePerM2))}</strong><small>${item.averagePriceM2 ? `marché ${e(euros(item.averagePriceM2))} · ${item.marketDiscountPct >= 0 ? "décote" : "surcote"} ${Math.abs(item.marketDiscountPct).toFixed(0)} %` : "comparables insuffisants"}</small>` : "—"}</td><td class="${item.longTermCashflowMonthly >= 100 ? "positive-text" : "negative-text"}"><strong>${e(compactMoney(item.longTermCashflowMonthly))}</strong><small>${e(euros(item.estimatedMonthlyRent))} de loyer estimé</small></td><td class="${item.shortTermCashflowMonthly >= 100 ? "positive-text" : "negative-text"}"><strong>${item.shortTermCashflowMonthly === null ? "—" : e(compactMoney(item.shortTermCashflowMonthly))}</strong><small>${item.estimatedAdr ? `${e(euros(item.estimatedAdr))}/nuit · ${item.estimatedOccupancyPct} %` : "non résidentiel"}</small></td><td class="${item.estimatedResaleProfit >= 0 ? "positive-text" : "negative-text"}"><strong>${e(compactMoney(item.estimatedResaleProfit))}</strong><small>sortie ${e(compactMoney(item.estimatedResalePrice))}</small></td><td>${formatDate(item.firstSeenAt || item.capturedAt || item.receivedAt)}</td><td>${formatDate(item.priceChangedAt || item.updatedAt || item.lastSeenAt || item.capturedAt)}</td><td><button class="secondary compact-button" data-action="analyze-listing" data-key="${e(item.fingerprint || item.sourceUrl)}">Ouvrir</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty"><div class="brand-mark">◎</div><h3>Aucune annonce réelle</h3><p>L’extension et le collecteur quotidien alimenteront automatiquement cette page. Aucun exemple n’est injecté.</p></div>`}</section>
  </div>`;
}

function identityFields() {
  return `<div class="project-identity">
    <label class="text-field"><span>Nom du projet</span><input data-text-path="name" value="${e(state.project.name)}" autocomplete="off"></label>
    <label class="text-field"><span>Ville</span><input data-text-path="city" value="${e(state.project.city)}" autocomplete="off"></label>
    <label class="text-field"><span>DPE</span><select data-text-path="dpe">${["A", "B", "C", "D", "E", "F", "G", "Non renseigné"].map((dpe) => `<option ${state.project.dpe === dpe ? "selected" : ""}>${dpe}</option>`).join("")}</select></label>
    <label class="text-field wide"><span>URL de l’annonce</span><input data-text-path="sourceUrl" type="url" value="${e(state.project.sourceUrl)}" placeholder="https://…"></label>
  </div>`;
}

function acquisitionBreakdown(result) {
  const rows = [
    ["Prix d’achat", result.acquisition.purchasePrice],
    ["Frais de notaire", result.acquisition.notaryFees],
    ["Travaux", state.project.acquisition.works],
    ["Aléas travaux", result.acquisition.worksContingency],
    ["Mobilier", state.project.acquisition.furniture],
    ["Agence, banque, garantie, courtier, études", result.acquisition.totalProjectCost - result.acquisition.purchasePrice - result.acquisition.notaryFees - state.project.acquisition.works - result.acquisition.worksContingency - state.project.acquisition.furniture]
  ];
  return `<div class="table-wrap"><table><thead><tr><th>Poste</th><th>Montant</th><th>Part du total</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><td>${e(label)}</td><td>${e(euros(value))}</td><td>${e(percent(value / result.acquisition.totalProjectCost))}</td></tr>`).join("")}<tr class="total-row"><td>Coût total</td><td>${e(euros(result.acquisition.totalProjectCost))}</td><td>100 %</td></tr></tbody></table></div>`;
}

function accountingModeHtml() {
  const modes = [
    ["internal", "Interne", 0, "Tenue et obligations courantes réalisées en interne."],
    ["hybrid", "Hybride", 500, "Tenue interne avec contrôle ou assistance ponctuelle."],
    ["external", "Cabinet", 1200, "Budget annuel indicatif pour une externalisation simple."]
  ];
  return `<div class="accounting-modes">${modes.map(([key, label, annual, description]) => `<button type="button" data-accounting-mode="${key}" data-accounting-annual="${annual}" class="${state.project.longTerm.accountingMode === key ? "active" : ""}"><strong>${label}</strong><span>${euros(annual)}/an</span><small>${description}</small></button>`).join("")}</div>`;
}

function viabilityHtml(result) {
  const rows = viabilityRange(state.project);
  const longGap = Math.max(0, result.longTerm.breakEvenBeforeTax - state.project.longTerm.monthlyRent);
  const shortGap = Math.max(0, result.shortTerm.breakEvenBeforeTax - state.project.shortTerm.occupancyPct);
  return `<section class="panel viability-panel">
    <div class="section-title"><div><span class="eyebrow">Zone de viabilité</span><h2>À quel point le projet passe en positif ?</h2></div><p>Fourchette automatique : revenus ±10 % et charges ∓10 %. Les montants restent des hypothèses, pas une promesse.</p></div>
    <div class="break-even-grid">
      <article><span>LONGUE DURÉE · SEUIL AVANT IMPÔT</span><strong>${e(euros(result.longTerm.breakEvenBeforeTax))}/mois</strong><p>${longGap > 1 ? `Il manque ${e(euros(longGap))} de loyer mensuel.` : "Le projet est déjà positif avant impôt."}</p></article>
      <article><span>COURTE DURÉE · SEUIL AVANT IMPÔT</span><strong>${result.shortTerm.breakEvenBeforeTax.toFixed(1)} % d’occupation</strong><p>${shortGap > .1 ? `Il manque ${shortGap.toFixed(1)} points d’occupation.` : "Le projet est déjà positif avant impôt."}</p></article>
      <article><span>DETTE MENSUELLE TOTALE</span><strong>${e(euros(result.loan.monthlyDebtService))}</strong><p>Capital, intérêts et assurance emprunteur.</p></article>
    </div>
    <div class="range-table"><div class="range-head"><span>Hypothèse</span><span>Longue durée avant impôt</span><span>Courte durée avant impôt</span></div>${rows.map((row) => `<div class="range-row"><strong>${e(row.name)}</strong><span class="${row.longTermBeforeTaxMonthly >= 0 ? "positive-text" : "negative-text"}">${e(euros(row.longTermBeforeTaxMonthly))}/mois</span><span class="${row.shortTermBeforeTaxMonthly >= 0 ? "positive-text" : "negative-text"}">${e(euros(row.shortTermBeforeTaxMonthly))}/mois</span></div>`).join("")}</div>
  </section>`;
}

function analysisHtml() {
  const result = analyzeProject(state.project);
  const activeControls = controls[state.formTab] ?? [];
  const tabDescription = {
    acquisition: "Prix, frais, travaux, mobilier et coût complet de l’opération.",
    financing: "Apport, taux, durée et assurance du crédit amortissable.",
    longTerm: "Loyers, vacance, impayés, gestion et charges récurrentes.",
    shortTerm: "Prix moyen, occupation, rotations, plateformes, conciergerie et exploitation.",
    flip: "Prix de sortie, durée de portage, coûts de revente et marge nette.",
    sci: "Amortissements, IS et hypothèses patrimoniales de projection."
  }[state.formTab];

  return `<div class="page-stack">
    <section class="panel form-panel">
      <div class="section-title"><div><span class="eyebrow">Identification</span><h2>Projet analysé</h2></div><p>Chaque donnée est enregistrée automatiquement dans le navigateur.</p></div>
      ${identityFields()}
    </section>

    ${viabilityHtml(result)}

    <section class="panel form-panel">
      <div class="tab-list">${formTabs.map(([key, label]) => `<button data-form-tab="${key}" class="${state.formTab === key ? "active" : ""}">${e(label)}</button>`).join("")}</div>
      <div class="section-title compact"><div><span class="eyebrow">Hypothèses</span><h2>${e(formTabs.find(([key]) => key === state.formTab)?.[1] ?? "Paramètres")}</h2></div><p>${e(tabDescription)}</p></div>
      ${state.formTab === "longTerm" ? accountingModeHtml() : ""}
      <div class="controls-grid">${activeControls.map(controlHtml).join("")}</div>
    </section>

    <section class="panel">
      <div class="section-title"><div><span class="eyebrow">Budget complet</span><h2>Décomposition de l’acquisition</h2></div><p>Montant financé : ${e(euros(result.loan.principal))}</p></div>
      ${acquisitionBreakdown(result)}
    </section>

    <section class="strategy-grid">
      ${strategyCard(result.longTerm)}
      ${strategyCard(result.shortTerm)}
      ${strategyCard(result.flip)}
    </section>

    <section class="panel sticky-results">
      <div><span>Coût total</span><strong data-live="total-cost">${e(euros(result.acquisition.totalProjectCost))}</strong></div>
      <div><span>Dette mensuelle</span><strong data-live="debt">${e(euros(result.loan.monthlyDebtService))}</strong></div>
      <div><span>CF longue avant / après IS</span><strong data-live="long">${e(euros(result.longTerm.cashflowBeforeTaxAnnual / 12))} / ${e(euros(result.longTerm.cashflowAfterTaxMonthly))}</strong></div>
      <div><span>CF courte avant / après IS</span><strong data-live="short">${e(euros(result.shortTerm.cashflowBeforeTaxAnnual / 12))} / ${e(euros(result.shortTerm.cashflowAfterTaxMonthly))}</strong></div>
      <div><span>Marge achat-revente</span><strong data-live="flip">${e(euros(result.flip.netProfit))}</strong></div>
    </section>
  </div>`;
}

function sensitivityHtml() {
  const result = analyzeProject(state.project);
  const prices = priceSensitivity(state.project);
  const rates = rateSensitivity(state.project);
  const occupancy = occupancySensitivity(state.project);
  const projection = longTermProjection(state.project);
  const scenarios = scenarioTable(state.project);
  const projectionYears = longTermProjection(state.project);
  const priceCrossLong = findCrossing(prices, "price", "longueDuree");
  const priceCrossShort = findCrossing(prices, "price", "courteDuree");
  const rateCrossLong = findCrossing(rates, "rate", "longueDuree");
  const rateCrossShort = findCrossing(rates, "rate", "courteDuree");

  return `<div class="page-stack">
    <section class="hero-panel">
      <div><span class="eyebrow">Résistance du projet</span><h2>Où le projet devient négatif</h2><p>Les lignes horizontales à zéro matérialisent le point de bascule du cash-flow.</p></div>
      <div class="hero-actions"><button class="secondary" data-page="analysis">Modifier les hypothèses</button></div>
    </section>

    <section class="panel">
      <div class="section-title"><div><span class="eyebrow">Prudent · Central · Optimiste</span><h2>Scénarios simultanés</h2></div><p>Stress : taux +2 pts, travaux +20 %, loyers −10 %, vacance +5 pts, occupation LCD −15 pts.</p></div>
      <div class="table-wrap"><table><thead><tr><th>Scénario</th><th>CF longue durée/mois</th><th>CF courte durée/mois</th><th>Marge achat-revente</th></tr></thead><tbody>${scenarios.map((row) => `<tr><td>${e(row.name)}</td><td class="${row.longTermMonthly >= 0 ? "positive-text" : "negative-text"}">${e(euros(row.longTermMonthly))}</td><td class="${row.shortTermMonthly >= 0 ? "positive-text" : "negative-text"}">${e(euros(row.shortTermMonthly))}</td><td class="${row.flipNetProfit >= 0 ? "positive-text" : "negative-text"}">${e(euros(row.flipNetProfit))}</td></tr>`).join("")}</tbody></table></div>
    </section>

    <section class="threshold-grid">
      <article class="threshold-card"><span>Prix d’achat maximal — LD</span><strong>${priceCrossLong ? e(euros(priceCrossLong)) : "Aucun croisement dans la plage"}</strong><small>Cash-flow après IS estimé = 0</small></article>
      <article class="threshold-card"><span>Prix d’achat maximal — LCD</span><strong>${priceCrossShort ? e(euros(priceCrossShort)) : "Aucun croisement dans la plage"}</strong><small>Cash-flow après IS estimé = 0</small></article>
      <article class="threshold-card"><span>Taux limite — LD</span><strong>${rateCrossLong ? `${rateCrossLong.toFixed(2)} %` : "Hors plage 1–8 %"}</strong><small>À hypothèses constantes</small></article>
      <article class="threshold-card"><span>Taux limite — LCD</span><strong>${rateCrossShort ? `${rateCrossShort.toFixed(2)} %` : "Hors plage 1–8 %"}</strong><small>À hypothèses constantes</small></article>
    </section>

    <section class="charts-grid">
      ${chartCard("Cash-flow selon le prix d’achat", `Prix actuel : ${euros(state.project.acquisition.purchasePrice)}`, lineChart(prices, { xKey: "price", series: [{ key: "longueDuree", label: "Longue durée", color: "var(--chart1)" }, { key: "courteDuree", label: "Courte durée", color: "var(--chart2)" }], formatX: compactEuros, formatY: compactEuros }))}
      ${chartCard("Cash-flow selon le taux du crédit", `Taux actuel : ${state.project.financing.annualRatePct.toFixed(2)} %`, lineChart(rates, { xKey: "rate", series: [{ key: "longueDuree", label: "Longue durée", color: "var(--chart1)" }, { key: "courteDuree", label: "Courte durée", color: "var(--chart2)" }], formatX: (v) => `${Number(v).toFixed(1)} %`, formatY: compactEuros }))}
      ${chartCard("Courte durée selon l’occupation", `Point mort : ${result.shortTerm.breakEven.toFixed(1)} %`, lineChart(occupancy, { xKey: "occupancy", series: [{ key: "cashflow", label: "Cash-flow mensuel", color: "var(--chart3)" }], formatX: (v) => `${v} %`, formatY: compactEuros }))}
      ${chartCard("Projection longue durée", `${state.project.projection.years} ans · loyers, dette et trésorerie cumulée`, lineChart(projection, { xKey: "year", series: [{ key: "debtBalance", label: "Capital restant dû", color: "var(--chart1)" }, { key: "cumulativeCashflow", label: "Trésorerie cumulée", color: "var(--chart2)" }, { key: "estimatedValue", label: "Valeur estimée", color: "var(--chart3)" }], formatX: (v) => `A${v}`, formatY: compactEuros, zero: true }))}
    </section>
    <section class="panel">
      <div class="section-title"><div><span class="eyebrow">SCI à l’IS</span><h2>Tableau annuel de bancabilité et de fiscalité</h2></div><p>Équivalent simplifié du tableau annuel Simloc, limité au montage SCI IS.</p></div>
      <div class="table-wrap"><table><thead><tr><th>Année</th><th>Intérêts</th><th>Capital remboursé</th><th>CRD</th><th>Loyers</th><th>Charges</th><th>Amortissement</th><th>Résultat fiscal</th><th>IS</th><th>Cash disponible</th><th>VNC</th></tr></thead><tbody>${projectionYears.map((row) => `<tr><td>${row.year}</td><td>${e(euros(row.interest))}</td><td>${e(euros(row.principalPaid))}</td><td>${e(euros(row.debtBalance))}</td><td>${e(euros(row.revenue))}</td><td>${e(euros(row.charges))}</td><td>${e(euros(row.depreciation))}</td><td>${e(euros(row.taxableResult))}</td><td>${e(euros(row.corporateTax))}</td><td class="${row.cashflowAfterTax >= 0 ? "positive-text" : "negative-text"}">${e(euros(row.cashflowAfterTax))}</td><td>${e(euros(row.bookValue))}</td></tr>`).join("")}</tbody></table></div>
    </section>
  </div>`;
}

function savedProjectCard(project) {
  let result;
  try { result = analyzeProject(project); } catch { return ""; }
  return `<article class="project-row">
    <div><span class="eyebrow">${e(project.city || "Ville non renseignée")} · DPE ${e(project.dpe || "?")}</span><h3>${e(project.name || "Projet sans titre")}</h3><p>${e(euros(result.acquisition.totalProjectCost))} de coût total · sauvegardé localement</p></div>
    <div class="project-mini"><span>Longue durée<strong>${e(euros(result.longTerm.cashflowAfterTaxMonthly))}/mois</strong></span><span>Courte durée<strong>${e(euros(result.shortTerm.cashflowAfterTaxMonthly))}/mois</strong></span><span>Achat-revente<strong>${e(euros(result.flip.netProfit))}</strong></span></div>
    <div class="row-actions"><button class="secondary" data-action="load" data-id="${e(project.id)}">Ouvrir</button><button class="icon-button danger" data-action="delete" data-id="${e(project.id)}" title="Supprimer">×</button></div>
  </article>`;
}

function projectsHtml() {
  return `<div class="page-stack">
    <section class="hero-panel"><div><span class="eyebrow">Portefeuille local</span><h2>${state.saved.length} projet${state.saved.length > 1 ? "s" : ""} enregistré${state.saved.length > 1 ? "s" : ""}</h2><p>La sauvegarde est limitée au navigateur actuellement utilisé.</p></div><div class="hero-actions"><button class="secondary" data-action="import">Importer JSON</button><button class="secondary" data-action="export-all">Exporter tout</button><button class="primary" data-action="new">Nouveau projet</button></div></section>
    <section class="panel">${state.saved.length ? `<div class="projects-list">${state.saved.map(savedProjectCard).join("")}</div>` : `<div class="empty"><div class="brand-mark">R</div><h3>Aucun projet enregistré</h3><p>Le brouillon actuel est déjà conservé automatiquement. Utilise « Enregistrer » pour l’ajouter au portefeuille et le comparer plus tard.</p><button class="primary" data-action="save">Enregistrer le projet actuel</button></div>`}</section>
  </div>`;
}

function methodologyHtml() {
  return `<div class="page-stack">
    <section class="hero-panel"><div><span class="eyebrow">Formules et périmètre</span><h2>Une analyse déterministe, pas une estimation opaque</h2><p>Les calculs sont réalisés localement par des fonctions JavaScript explicites. Aucun résultat financier n’est délégué à un modèle d’IA.</p></div></section>
    <section class="method-grid">
      <article class="panel"><h3>Coût total d’acquisition</h3><p><code>prix + notaire + agence + travaux + aléas + mobilier + banque + garantie + courtier + études</code>.</p><p>L’apport est déduit du coût total pour obtenir le capital financé.</p></article>
      <article class="panel"><h3>Mensualité du prêt</h3><p>Prêt amortissable à mensualité constante : <code>M = C × i / (1 − (1 + i)^−n)</code>, avec taux mensuel <code>i</code> et nombre de mensualités <code>n</code>.</p><p>L’assurance V1 est calculée sur le capital initial, puis ajoutée à la mensualité.</p></article>
      <article class="panel"><h3>Longue durée</h3><p><code>revenus effectifs = loyers − vacance − provision impayés</code>. Le NOI retranche gestion, GLI, entretien et charges fixes.</p><p><code>cash-flow après IS = NOI − service de dette − IS estimé</code>. Le DSCR correspond à <code>NOI / dette annuelle</code>.</p></article>
      <article class="panel"><h3>Courte durée</h3><p><code>nuits vendues = nuits disponibles × occupation × unités</code>. Le CA additionne hébergement et ménage facturé.</p><p>Les plateformes, la conciergerie, les rotations, le linge, les consommables, la maintenance et les charges fixes sont déduits avant dette et IS.</p></article>
      <article class="panel"><h3>SCI à l’IS</h3><p>Résultat fiscal simplifié : <code>NOI − intérêts − assurance − amortissements</code>. L’IS est appliqué selon les taux et le plafond paramétrés.</p><p>Amortissements : bâti hors terrain, travaux, mobilier et certains frais, chacun sur sa durée saisie.</p></article>
      <article class="panel"><h3>Achat-revente</h3><p><code>marge avant IS = prix net de sortie − coût total − frais financiers − portage − commercialisation</code>.</p><p>Le point mort reconstitue le prix affiché minimum nécessaire après négociation et commission d’agence.</p></article>
      <article class="panel"><h3>Scénarios et seuils</h3><p>Les scénarios prudent et optimiste appliquent des variations cohérentes aux travaux, taux, revenus, vacance, occupation, prix de sortie et durée de portage.</p><p>Les seuils sont recherchés numériquement, puis affichés avec une ligne zéro très visible.</p></article>
      <article class="panel warning"><h3>Limites importantes</h3><p>Cet outil est un modèle d’aide à la décision. Il ne valide ni la réglementation locale de la courte durée, ni l’état technique, ni le financement bancaire, ni le traitement comptable réel.</p><p>Les hypothèses SCI à l’IS et achat-revente doivent être validées par un expert-comptable, un notaire et, selon le montage, un avocat fiscaliste.</p></article>
    </section>
  </div>`;
}

function render() {
  let content;
  if (state.page === "analysis") content = analysisHtml();
  else if (state.page === "sensitivity") content = sensitivityHtml();
  else if (state.page === "radar") content = radarHtml();
  else if (state.page === "projects") content = projectsHtml();
  else if (state.page === "methodology") content = methodologyHtml();
  else content = dashboardHtml();
  app.innerHTML = shell(content);
}

function saveCurrentProject() {
  const copy = structuredClone(state.project);
  copy.updatedAt = new Date().toISOString();
  const index = state.saved.findIndex((project) => project.id === copy.id);
  if (index >= 0) state.saved[index] = copy;
  else state.saved.unshift(copy);
  persist();
  showToast("Projet enregistré localement.");
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setNumericControl(path, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  state.project = setPath(state.project, path, number);
  persist();
}

function syncControlElement(target) {
  const path = target.dataset.path;
  const card = target.closest(".control-card");
  if (!card) return;
  card.querySelectorAll(`[data-path="${CSS.escape(path)}"]`).forEach((input) => { if (input !== target) input.value = target.value; });
  const definition = Object.values(controls).flat().find(([candidate]) => candidate === path);
  if (definition) card.querySelector(".current-value").textContent = formatScale(Number(target.value), definition[5]);
}

function updateLiveResults() {
  const result = analyzeProject(state.project);
  const mapping = {
    "total-cost": euros(result.acquisition.totalProjectCost),
    debt: euros(result.loan.monthlyDebtService),
    long: euros(result.longTerm.cashflowAfterTaxMonthly),
    short: euros(result.shortTerm.cashflowAfterTaxMonthly),
    flip: euros(result.flip.netProfit)
  };
  Object.entries(mapping).forEach(([key, value]) => {
    const element = app.querySelector(`[data-live="${key}"]`);
    if (element) element.textContent = value;
  });
}

app.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    state.page = pageButton.dataset.page;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const tabButton = event.target.closest("[data-form-tab]");
  if (tabButton) {
    state.formTab = tabButton.dataset.formTab;
    render();
    return;
  }
  const accountingButton = event.target.closest("[data-accounting-mode]");
  if (accountingButton) {
    state.project = setPath(state.project, "longTerm.accountingMode", accountingButton.dataset.accountingMode);
    state.project = setPath(state.project, "longTerm.accountingAnnual", Number(accountingButton.dataset.accountingAnnual));
    persist();
    render();
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === "save") saveCurrentProject();
  if (action === "theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = state.theme;
    localStorage.setItem(THEME_KEY, state.theme);
    render();
  }
  if (action === "export-current") downloadJson(state.project, `radar-immo-${(state.project.name || "projet").toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.json`);
  if (action === "export-all") downloadJson({ version: 1, projects: state.saved, draft: state.project }, "radar-immo-portefeuille.json");
  if (action === "import") app.querySelector("#import-json")?.click();
  if (action === "import-radar-listings") app.querySelector("#import-radar-json")?.click();
  if (action === "refresh-radar") {
    state.radarStatus.loading = true;
    render();
    window.postMessage({ channel: RADAR_CONNECTOR_CHANNEL, type: "RADAR_REQUEST_LISTINGS" }, location.origin);
    refreshRemoteRadar();
  }
  if (action === "analyze-listing") {
    const listing = enrichRadarEstimates(state.radarListings).find((item) => (item.fingerprint || item.sourceUrl) === actionButton.dataset.key);
    if (listing?.quickProject) {
      state.project = hydrateProject(listing.quickProject);
      state.page = "analysis";
      state.formTab = "acquisition";
      persist();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  if (action === "export-radar-config") downloadJson({ version: 1, generatedAt: new Date().toISOString(), config: state.radarConfig }, "radar-immo-configuration.json");
  if (action === "new") {
    const project = createDefaultProject();
    project.name = "Nouveau projet";
    project.city = "";
    project.sourceUrl = "";
    state.project = project;
    state.page = "analysis";
    state.formTab = "acquisition";
    persist();
    render();
  }
  if (action === "load") {
    const project = state.saved.find((item) => item.id === actionButton.dataset.id);
    if (project) {
      state.project = hydrateProject(project);
      state.page = "dashboard";
      persist();
      render();
      window.scrollTo({ top: 0 });
    }
  }
  if (action === "delete") {
    const project = state.saved.find((item) => item.id === actionButton.dataset.id);
    if (project && window.confirm(`Supprimer « ${project.name} » ?`)) {
      state.saved = state.saved.filter((item) => item.id !== project.id);
      persist();
      showToast("Projet supprimé.");
    }
  }
});

app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.matches(".range-control, .number-control")) {
    setNumericControl(target.dataset.path, target.value);
    syncControlElement(target);
    updateLiveResults();
  }
  if (target.matches("[data-text-path]")) {
    state.project = setPath(state.project, target.dataset.textPath, target.value);
    persist();
  }
});

app.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches(".range-control, .number-control, [data-text-path]")) render();
  if (target.id === "import-json" && target.files?.[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (Array.isArray(parsed.projects)) {
          state.saved = parsed.projects.map(hydrateProject);
          if (parsed.draft) state.project = hydrateProject(parsed.draft);
        } else if (parsed.acquisition && parsed.financing) {
          state.project = hydrateProject(parsed);
        } else throw new Error("Structure inconnue");
        persist();
        state.page = "dashboard";
        showToast("Import terminé.");
      } catch (error) {
        window.alert(`Import impossible : ${error.message}`);
      }
    };
    reader.readAsText(target.files[0]);
  }
  if (target.id === "import-radar-json" && target.files?.[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const listings = Array.isArray(parsed) ? parsed : parsed.listings;
        if (!Array.isArray(listings)) throw new Error("format");
        state.radarListings = listings;
        state.page = "radar";
        persist();
        showToast(`${rankCandidates(listings, state.radarConfig).length} annonce(s) importée(s) après dédoublonnage.`);
      } catch { showToast("Fichier d’annonces invalide."); }
    };
    reader.readAsText(target.files[0]);
  }
});

render();

async function refreshRemoteRadar() {
  try {
    const [listingsResponse, historyResponse, healthResponse] = await Promise.all([fetch("/data/listings.json", { cache: "no-store" }), fetch("/data/history.json", { cache: "no-store" }), fetch("/data/status.json", { cache: "no-store" })]);
    if (!listingsResponse.ok || !historyResponse.ok || !healthResponse.ok) throw new Error("fichiers du radar indisponibles");
    const payload = await listingsResponse.json();
    const history = await historyResponse.json();
    const health = await healthResponse.json();
    state.radarHistory = history && typeof history === "object" ? history : {};
    const remoteListings = (Array.isArray(payload.listings) ? payload.listings : []).map((listing) => {
      const points = Array.isArray(state.radarHistory[listing.fingerprint]) ? state.radarHistory[listing.fingerprint] : [];
      const previous = points.length > 1 ? points.at(-2) : null;
      const latest = points.at(-1);
      return {
        ...listing,
        distanceKm: Number.isFinite(Number(listing.latitude)) && Number.isFinite(Number(listing.longitude))
          ? Math.round(distanceKmBetween(state.radarConfig.centerCoordinates, { latitude: Number(listing.latitude), longitude: Number(listing.longitude) }) * 10) / 10
          : listing.distanceKm,
        priceHistory: points,
        previousPrice: previous?.askingPrice || null,
        priceChangedAt: previous && latest?.askingPrice !== previous.askingPrice ? latest.observedAt : listing.priceChangedAt || null
      };
    });
    mergeRadarListings(remoteListings);
    state.radarStatus = { loading: false, connected: Boolean(health.ok) || extensionRadarListings.length > 0, extensionCount: extensionRadarListings.length, lastRun: health.generatedAt ? { started_at: health.generatedAt } : null, sources: health.sources || [], error: health.ok || extensionRadarListings.length ? "" : health.message };
    persist();
    if (state.page === "radar") render();
  } catch (error) {
    state.radarStatus = { loading: false, connected: extensionRadarListings.length > 0, extensionCount: extensionRadarListings.length, lastRun: null, error: extensionRadarListings.length ? "" : error.message };
    if (state.page === "radar") render();
  }
}

refreshRemoteRadar();
