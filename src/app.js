import { createDefaultProject } from "./defaults.js";
import {
  analyzeProject,
  findCrossing,
  longTermProjection,
  occupancySensitivity,
  priceSensitivity,
  rateSensitivity,
  scenarioTable
} from "./finance.js";
import { barChart, chartCard, lineChart } from "./charts.js";

const DRAFT_KEY = "radar-immo:draft:v1";
const SAVED_KEY = "radar-immo:projects:v1";
const THEME_KEY = "radar-immo:theme";
const app = document.querySelector("#app");

const e = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const euros = (value, digits = 0) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: digits }).format(Number(value || 0));
const percent = (value) => new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 2 }).format(Number(value || 0));
const compactEuros = (value) => new Intl.NumberFormat("fr-FR", { notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1 }).format(Number(value || 0));

function parseStorage(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

const state = {
  project: parseStorage(DRAFT_KEY, createDefaultProject()),
  saved: parseStorage(SAVED_KEY, []),
  page: "dashboard",
  formTab: "acquisition",
  theme: localStorage.getItem(THEME_KEY) || "dark",
  toast: ""
};

document.documentElement.dataset.theme = state.theme;

const navItems = [
  ["dashboard", "⌂", "Tableau de bord"],
  ["analysis", "∑", "Analyse du projet"],
  ["sensitivity", "⌁", "Seuils & scénarios"],
  ["projects", "▣", "Projets enregistrés"],
  ["methodology", "?", "Méthodologie"]
];

const formTabs = [
  ["acquisition", "Acquisition"],
  ["financing", "Financement"],
  ["longTerm", "Longue durée"],
  ["shortTerm", "Courte durée"],
  ["flip", "Achat-revente"],
  ["sci", "SCI à l’IS"]
];

const controls = {
  acquisition: [
    ["acquisition.purchasePrice", "Prix d’achat négocié", 10000, 2000000, 1000, "€", "Prix hors frais annexes. Le financement et les rendements partent de cette valeur."],
    ["acquisition.notaryRatePct", "Frais de notaire (% du prix)", 0, 12, .1, "%", "Hypothèse paramétrable. Le taux réel dépend de la nature de l’acquisition."],
    ["acquisition.works", "Travaux estimés", 0, 1000000, 1000, "€", "Budget travaux hors aléas."],
    ["acquisition.worksContingencyPct", "Aléas travaux (% du budget travaux)", 0, 50, 1, "%", "Provision de sécurité ajoutée au coût total."],
    ["acquisition.furniture", "Mobilier et équipement", 0, 200000, 500, "€", "Mobilier, électroménager et équipement initial."],
    ["acquisition.agencyFees", "Frais d’agence non inclus", 0, 150000, 500, "€", "À laisser à zéro lorsqu’ils sont déjà inclus dans le prix affiché."],
    ["acquisition.bankFees", "Frais bancaires", 0, 20000, 100, "€", "Frais de dossier du financeur."],
    ["acquisition.guaranteeRatePct", "Garantie bancaire (% du prix)", 0, 5, .1, "%", "Caution, hypothèque ou garantie estimée."],
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
    ["longTerm.vacancyPct", "Vacance longue durée (% des loyers)", 0, 30, .5, "%", "Perte de loyers liée aux périodes sans locataire."],
    ["longTerm.unpaidPct", "Provision impayés (% après vacance)", 0, 15, .5, "%", "Provision de risque sur les loyers après vacance."],
    ["longTerm.managementPct", "Gestion locative (% des loyers encaissés)", 0, 15, .5, "%", "Commission de gestion hors GLI."],
    ["longTerm.gliPct", "GLI (% des loyers encaissés)", 0, 8, .1, "%", "Assurance loyers impayés."],
    ["longTerm.maintenancePct", "Entretien courant (% des loyers encaissés)", 0, 20, .5, "%", "Provision annuelle de maintenance et petites réparations."],
    ["longTerm.propertyTaxAnnual", "Taxe foncière annuelle", 0, 30000, 100, "€", "Part restant à la charge du propriétaire."],
    ["longTerm.coproNonRecoverableAnnual", "Copropriété non récupérable/an", 0, 30000, 100, "€", "Charges de copropriété non refacturables."],
    ["longTerm.pnoAnnual", "Assurance PNO/an", 0, 10000, 50, "€", "Assurance propriétaire non occupant."],
    ["longTerm.accountingAnnual", "Expert-comptable/an", 0, 10000, 100, "€", "Comptabilité et obligations annuelles."],
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
  const main = rental ? euros(result.cashflowAfterTaxMonthly) : euros(result.netProfit);
  const metrics = rental ? [
    ["CA brut annuel", euros(result.grossRevenueAnnual)],
    ["NOI annuel", euros(result.noiAnnual)],
    ["Rentabilité brute", percent(result.grossYield)],
    ["Rentabilité nette", percent(result.netYield)],
    ["DSCR", result.dscr.toFixed(2)],
    [result.strategy === "Longue durée" ? "Loyer de point mort" : "Occupation de point mort", result.strategy === "Longue durée" ? euros(result.breakEven) : `${result.breakEven.toFixed(1)} %`]
  ] : [
    ["Prix net de revente", euros(result.netResalePrice)],
    ["Marge avant IS", euros(result.profitBeforeTax)],
    ["IS estimé", euros(result.corporateTax)],
    ["Rendement sur cash", percent(result.returnOnCash)],
    ["Marge sur revente", percent(result.marginOnResale)],
    ["Revente de point mort", euros(result.breakEvenResalePrice)]
  ];
  return `<article class="strategy-card ${recommended ? "recommended" : ""}">
    <div class="strategy-title"><div><span class="eyebrow">${recommended ? "Stratégie recommandée" : "Simulation"}</span><h3>${e(result.strategy)}</h3></div><span class="verdict ${positive ? "positive" : "negative"}">${e(result.verdict)}</span></div>
    <div class="main-result ${positive ? "positive-text" : "negative-text"}">${e(main)}<small>${rental ? "/ mois après IS estimé" : " de marge nette estimée"}</small></div>
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
  </div>${state.toast ? `<div class="toast">${e(state.toast)}</div>` : ""}<input id="import-json" class="hidden" type="file" accept="application/json,.json">`;
}

function dashboardHtml() {
  const result = analyzeProject(state.project);
  const recommendation = getRecommendation(result);
  const scenarios = scenarioTable(state.project);
  const occupancy = occupancySensitivity(state.project);
  const warnings = projectWarnings(result);
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
    </section>

    <section class="panel recommendation-panel">
      <div class="section-title"><div><span class="eyebrow">Comparaison automatique</span><h2>${e(recommendation.strategy)} arrive en tête</h2></div><p>${e(strategyReason)}</p></div>
      <div class="strategy-grid">
        ${strategyCard(result.longTerm, recommendation.strategy === result.longTerm.strategy)}
        ${strategyCard(result.shortTerm, recommendation.strategy === result.shortTerm.strategy)}
        ${strategyCard(result.flip, recommendation.strategy === result.flip.strategy)}
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

    <section class="panel form-panel">
      <div class="tab-list">${formTabs.map(([key, label]) => `<button data-form-tab="${key}" class="${state.formTab === key ? "active" : ""}">${e(label)}</button>`).join("")}</div>
      <div class="section-title compact"><div><span class="eyebrow">Hypothèses</span><h2>${e(formTabs.find(([key]) => key === state.formTab)?.[1] ?? "Paramètres")}</h2></div><p>${e(tabDescription)}</p></div>
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
      <div><span>Cash-flow longue durée</span><strong data-live="long">${e(euros(result.longTerm.cashflowAfterTaxMonthly))}</strong></div>
      <div><span>Cash-flow courte durée</span><strong data-live="short">${e(euros(result.shortTerm.cashflowAfterTaxMonthly))}</strong></div>
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
      state.project = structuredClone(project);
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
          state.saved = parsed.projects;
          if (parsed.draft) state.project = parsed.draft;
        } else if (parsed.acquisition && parsed.financing) {
          state.project = parsed;
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
});

render();
