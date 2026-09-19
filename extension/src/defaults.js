export const RADAR_LOCAL_APP = Object.freeze({
  id: "radar-immo",
  label: "Radar Immo",
  workspaceId: "sologne",
  transport: "local",
  enabled: true
});

const search = (id, label, sourceId, url) => Object.freeze({
  id,
  label,
  sourceId,
  url,
  appIds: [RADAR_LOCAL_APP.id],
  intervalMinutes: 1440,
  enabled: true,
  closeTabAfterCapture: true
});

const DEPARTMENT_SEARCHES = Object.freeze([
  ["41", "Loir-et-Cher", "AD06FR42", "loir-et-cher-41"],
  ["45", "Loiret", "AD06FR46", "loiret-45"],
  ["18", "Cher", "AD06FR18", "cher-18"],
  ["36", "Indre", "AD06FR37", "indre-36"],
  ["37", "Indre-et-Loire", "AD06FR38", "indre-et-loire-37"],
  ["28", "Eure-et-Loir", "AD06FR27", "eure-et-loir-28"]
]);

const avivSearch = (sourceId, host, [department, label, locationId]) => search(
  `radar-${sourceId}-${department}`,
  `${sourceId === "seloger" ? "SeLoger" : "Logic-Immo"} — ${label}`,
  sourceId,
  `https://www.${host}/classified-search?distributionTypes=Buy&estateTypes=House,Apartment&locations=${locationId}&priceMax=600000&order=DateDesc`
);

const bienIciSearch = ([department, label, _locationId, slug]) => search(
  `radar-bienici-${department}`,
  `Bien’ici — ${label}`,
  "bienici",
  `https://www.bienici.com/recherche/achat/${slug}`
);

export const RADAR_DEFAULT_SEARCHES = Object.freeze([
  search(
    "radar-lbc-100km",
    "Leboncoin — achats à 100 km",
    "leboncoin",
    "https://www.leboncoin.fr/recherche?category=9&locations=Chaumont-sur-Tharonne_41600__47.60958_1.90408_100000_100000&price=max-400000&real_estate_type=1,2,3,4,5&sort=time&order=desc"
  ),
  ...DEPARTMENT_SEARCHES.map((department) => avivSearch("seloger", "seloger.com", department)),
  ...DEPARTMENT_SEARCHES.map(bienIciSearch),
  search("radar-pap-41", "PAP — Loir-et-Cher", "pap", "https://www.pap.fr/annonce/vente-immobiliere-loir-et-cher-41-g405"),
  search("radar-pap-45", "PAP — Loiret", "pap", "https://www.pap.fr/annonce/vente-immobiliere-loiret-45-g409"),
  search("radar-pap-18", "PAP — Cher", "pap", "https://www.pap.fr/annonce/vente-immobiliere-cher-18-g381"),
  ...DEPARTMENT_SEARCHES.map((department) => avivSearch("logic-immo", "logic-immo.com", department))
]);

const LEGACY_RADAR_SEARCH_IDS = new Set([
  "radar-seloger-orleans-bannier",
  "radar-seloger-orleans-beaumont",
  "radar-seloger-blois",
  "radar-seloger-bourges",
  "radar-seloger-vierzon",
  "radar-pap-centre",
  "radar-logic-chaumont"
]);

export function mergeRadarDefaults(state) {
  const apps = Array.isArray(state?.apps) ? [...state.apps] : [];
  const searches = (Array.isArray(state?.searches) ? state.searches : []).filter((item) => !LEGACY_RADAR_SEARCH_IDS.has(item.id));
  const appIndex = apps.findIndex((app) => app.id === RADAR_LOCAL_APP.id);
  if (appIndex === -1) apps.push({ ...RADAR_LOCAL_APP });
  else if (apps[appIndex].transport === "local") apps[appIndex] = { ...apps[appIndex], ...RADAR_LOCAL_APP };

  const knownSearchIds = new Set(searches.map((item) => item.id));
  for (const item of RADAR_DEFAULT_SEARCHES) {
    if (!knownSearchIds.has(item.id)) searches.push({ ...item, appIds: [...item.appIds] });
  }
  return { ...state, apps, searches, defaultsVersion: 2 };
}
