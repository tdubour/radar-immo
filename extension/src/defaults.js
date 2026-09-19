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

export const RADAR_DEFAULT_SEARCHES = Object.freeze([
  search(
    "radar-lbc-100km",
    "Leboncoin — achats à 100 km",
    "leboncoin",
    "https://www.leboncoin.fr/recherche?category=9&locations=Chaumont-sur-Tharonne_41600__47.60958_1.90408_100000_100000&price=max-400000&real_estate_type=1,2,3,4,5&sort=time&order=desc"
  ),
  search("radar-seloger-orleans-bannier", "SeLoger — Orléans Bannier", "seloger", "https://www.seloger.com/recherche/achat/appartement/orleans-45000/bannier-coligny-45000/nbh2fr3416"),
  search("radar-seloger-orleans-beaumont", "SeLoger — Orléans Beaumont", "seloger", "https://www.seloger.com/recherche/achat/appartement/orleans-45000/beaumont-vauquois-45000/nbh2fr3417"),
  search("radar-seloger-blois", "SeLoger — Blois", "seloger", "https://www.seloger.com/recherche/achat/appartement/blois-41000/est-41000/nbh2fr3022"),
  search("radar-seloger-bourges", "SeLoger — Bourges", "seloger", "https://www.seloger.com/recherche/achat/appartement/bourges-18000/pignoux-18000/nbh2fr1342"),
  search("radar-seloger-vierzon", "SeLoger — Vierzon", "seloger", "https://www.seloger.com/recherche/achat/appartement/vierzon-18100/centre-ville-18100/nbh2fr1362"),
  search("radar-bienici-41", "Bien’ici — Loir-et-Cher", "bienici", "https://www.bienici.com/recherche/achat/loir-et-cher-41"),
  search("radar-bienici-45", "Bien’ici — Loiret", "bienici", "https://www.bienici.com/recherche/achat/loiret-45"),
  search("radar-bienici-18", "Bien’ici — Cher", "bienici", "https://www.bienici.com/recherche/achat/cher-18"),
  search("radar-bienici-36", "Bien’ici — Indre", "bienici", "https://www.bienici.com/recherche/achat/indre-36"),
  search("radar-bienici-37", "Bien’ici — Indre-et-Loire", "bienici", "https://www.bienici.com/recherche/achat/indre-et-loire-37"),
  search("radar-bienici-28", "Bien’ici — Eure-et-Loir", "bienici", "https://www.bienici.com/recherche/achat/eure-et-loir-28"),
  search("radar-pap-centre", "PAP — ventes entre particuliers", "pap", "https://www.pap.fr/annonce/vente-immobiliere"),
  search(
    "radar-logic-chaumont",
    "Logic-Immo — Chaumont-sur-Tharonne",
    "logic-immo",
    "https://www.logic-immo.com/classified-search?distributionTypes=Buy&estateTypes=House,Apartment&locations=AD08FR16270&m=homepage_new_search_classified_search_result"
  )
]);

export function mergeRadarDefaults(state) {
  const apps = Array.isArray(state?.apps) ? [...state.apps] : [];
  const searches = Array.isArray(state?.searches) ? [...state.searches] : [];
  const appIndex = apps.findIndex((app) => app.id === RADAR_LOCAL_APP.id);
  if (appIndex === -1) apps.push({ ...RADAR_LOCAL_APP });
  else if (apps[appIndex].transport === "local") apps[appIndex] = { ...apps[appIndex], ...RADAR_LOCAL_APP };

  const knownSearchIds = new Set(searches.map((item) => item.id));
  for (const item of RADAR_DEFAULT_SEARCHES) {
    if (!knownSearchIds.has(item.id)) searches.push({ ...item, appIds: [...item.appIds] });
  }
  return { ...state, apps, searches, defaultsVersion: 1 };
}
