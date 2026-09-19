// extension/src/catalog.js
var SOURCES = Object.freeze({
  leboncoin: {
    id: "leboncoin",
    label: "Leboncoin",
    hosts: ["leboncoin.fr"],
    listingPaths: [/\/ad\/(?:ventes_immobilieres|bureaux_commerces)\//i, /\/(?:ventes_immobilieres|bureaux_commerces)\//i]
  },
  seloger: {
    id: "seloger",
    label: "SeLoger",
    hosts: ["seloger.com"],
    listingPaths: [/\/annonces?\//i]
  },
  bienici: {
    id: "bienici",
    label: "Bien\u2019ici",
    hosts: ["bienici.com"],
    listingPaths: [/\/annonce\//i]
  },
  pap: {
    id: "pap",
    label: "PAP",
    hosts: ["pap.fr"],
    listingPaths: [/\/annonces?\//i]
  },
  "logic-immo": {
    id: "logic-immo",
    label: "Logic-Immo",
    hosts: ["logic-immo.com"],
    listingPaths: [/\/detail-annonce\//i, /\/detail-(?:vente|location)(?:-|\/)\S*/i, /\/annonces?\//i, /\/wl-cdp\//i]
  }
});
function sourceFromUrl(value) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    return Object.values(SOURCES).find((source) => source.hosts.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)))?.id || null;
  } catch {
    return null;
  }
}

// extension/src/model.js
var clean = (value, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
function newId(prefix = "item") {
  return `${prefix}-${crypto.randomUUID()}`;
}
function normalizeApp(input) {
  const id = clean(input?.id, 80).toLowerCase();
  const workspaceId = clean(input?.workspaceId, 120);
  const transport = input?.transport === "local" ? "local" : "remote";
  if (!id || !workspaceId) throw new Error("Application et espace obligatoires");
  if (transport === "local") {
    return {
      id,
      label: clean(input?.label || id, 120),
      workspaceId,
      transport,
      enabled: input?.enabled !== false
    };
  }
  let ingestUrl;
  try {
    ingestUrl = new URL(input?.ingestUrl).toString();
  } catch {
    throw new Error("URL d\u2019ingestion invalide");
  }
  if (!clean(input?.token, 1e3)) throw new Error("Jeton obligatoire pour une application distante");
  if (!/^https?:$/.test(new URL(ingestUrl).protocol)) throw new Error("Seuls HTTP et HTTPS sont autoris\xE9s");
  return {
    id,
    label: clean(input?.label || id, 120),
    workspaceId,
    ingestUrl,
    token: clean(input.token, 1e3),
    transport,
    enabled: input?.enabled !== false
  };
}
function normalizeSearch(input, knownAppIds = []) {
  const id = clean(input?.id, 120) || newId("search");
  let url;
  try {
    url = new URL(input?.url).toString();
  } catch {
    throw new Error("URL de recherche invalide");
  }
  const sourceId = clean(input?.sourceId || sourceFromUrl(url), 80).toLowerCase();
  if (!sourceId || sourceFromUrl(url) !== sourceId) throw new Error("La source ne correspond pas \xE0 l\u2019URL");
  const appIds = [...new Set((input?.appIds || []).map((value) => clean(value, 80).toLowerCase()))].filter((value) => knownAppIds.includes(value));
  if (!appIds.length) throw new Error("Choisis au moins une application destinataire");
  return {
    id,
    label: clean(input?.label || id, 160),
    sourceId,
    url,
    appIds,
    enabled: input?.enabled !== false,
    intervalMinutes: Math.max(30, Math.round(Number(input?.intervalMinutes) || 1440)),
    closeTabAfterCapture: input?.closeTabAfterCapture !== false
  };
}
function makeEnvelope({ app, search: search2, runId, listings, capturedAt = (/* @__PURE__ */ new Date()).toISOString() }) {
  return {
    context: {
      appId: app.id,
      workspaceId: app.workspaceId,
      searchId: search2.id,
      runId,
      sourceId: search2.sourceId,
      searchUrl: search2.url,
      capturedAt
    },
    listings
  };
}
function canonicalListingKey(listing) {
  return `${listing.sourceId}:${listing.externalId || listing.sourceUrl}`;
}

// extension/src/defaults.js
var RADAR_LOCAL_APP = Object.freeze({
  id: "radar-immo",
  label: "Radar Immo",
  workspaceId: "sologne",
  transport: "local",
  enabled: true
});
var search = (id, label, sourceId, url) => Object.freeze({
  id,
  label,
  sourceId,
  url,
  appIds: [RADAR_LOCAL_APP.id],
  intervalMinutes: 1440,
  enabled: true,
  closeTabAfterCapture: true
});
var DEPARTMENT_SEARCHES = Object.freeze([
  ["41", "Loir-et-Cher", "AD06FR42", "loir-et-cher-41"],
  ["45", "Loiret", "AD06FR46", "loiret-45"],
  ["18", "Cher", "AD06FR18", "cher-18"],
  ["36", "Indre", "AD06FR37", "indre-36"],
  ["37", "Indre-et-Loire", "AD06FR38", "indre-et-loire-37"],
  ["28", "Eure-et-Loir", "AD06FR27", "eure-et-loir-28"]
]);
var avivSearch = (sourceId, host, [department, label, locationId]) => search(
  `radar-${sourceId}-${department}`,
  `${sourceId === "seloger" ? "SeLoger" : "Logic-Immo"} \u2014 ${label}`,
  sourceId,
  `https://www.${host}/classified-search?distributionTypes=Buy&estateTypes=House,Apartment&locations=${locationId}&priceMax=600000&order=DateDesc`
);
var bienIciSearch = ([department, label, _locationId, slug]) => search(
  `radar-bienici-${department}`,
  `Bien\u2019ici \u2014 ${label}`,
  "bienici",
  `https://www.bienici.com/recherche/achat/${slug}`
);
var RADAR_DEFAULT_SEARCHES = Object.freeze([
  search(
    "radar-lbc-100km",
    "Leboncoin \u2014 achats \xE0 100 km",
    "leboncoin",
    "https://www.leboncoin.fr/recherche?category=9&locations=Chaumont-sur-Tharonne_41600__47.60958_1.90408_100000_100000&price=max-400000&real_estate_type=1,2,3,4,5&sort=time&order=desc"
  ),
  ...DEPARTMENT_SEARCHES.map((department) => avivSearch("seloger", "seloger.com", department)),
  ...DEPARTMENT_SEARCHES.map(bienIciSearch),
  search("radar-pap-41", "PAP \u2014 Loir-et-Cher", "pap", "https://www.pap.fr/annonce/vente-immobiliere-loir-et-cher-41-g405"),
  search("radar-pap-45", "PAP \u2014 Loiret", "pap", "https://www.pap.fr/annonce/vente-immobiliere-loiret-45-g409"),
  search("radar-pap-18", "PAP \u2014 Cher", "pap", "https://www.pap.fr/annonce/vente-immobiliere-cher-18-g381"),
  ...DEPARTMENT_SEARCHES.map((department) => avivSearch("logic-immo", "logic-immo.com", department))
]);
var LEGACY_RADAR_SEARCH_IDS = /* @__PURE__ */ new Set([
  "radar-seloger-orleans-bannier",
  "radar-seloger-orleans-beaumont",
  "radar-seloger-blois",
  "radar-seloger-bourges",
  "radar-seloger-vierzon",
  "radar-pap-centre",
  "radar-logic-chaumont"
]);
function mergeRadarDefaults(state) {
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

// extension/src/background.js
var STATE_KEY = "berryConnectorState";
var RUN_PREFIX = "run:";
var ALARM_PREFIX = "search:";
var QUEUE_ALARM = "delivery-queue";
var RUN_TIMEOUT_PREFIX = "run-timeout:";
var BROWSER_JOB_KEY = "berryBrowserJob";
var BERRYPILOT_STATE_KEY = "berryPilotLbcState";
var BERRYPILOT_ALARM = "berrypilot-lbc-automatic-sync";
var BERRYPILOT_API_BASE_URL = "https://berryconciergerie-app.vercel.app";
var EXTENSION_VERSION = chrome.runtime.getManifest().version;
var activeBerryPilotSync = null;
var defaultState = () => ({ version: 2, apps: [], searches: [], queue: [], pendingSearchIds: [], seen: {}, runs: {}, localListings: [], lastEvent: null });
async function getState() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  return { ...defaultState(), ...stored[STATE_KEY] || {} };
}
async function setState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}
async function ensureRadarDefaults() {
  const state = await getState();
  const merged = mergeRadarDefaults(state);
  await setState(merged);
  return merged;
}
async function getBerryPilotState() {
  const stored = await chrome.storage.local.get([
    BERRYPILOT_STATE_KEY,
    "apiBaseUrl",
    "connectorToken",
    "pairedAt",
    "status",
    "accountLabel",
    "lastSyncAt",
    "lastResult",
    "lastError",
    "lastSyncByKind"
  ]);
  if (stored[BERRYPILOT_STATE_KEY]) return stored[BERRYPILOT_STATE_KEY];
  if (!stored.connectorToken) return { status: "ready", lastError: "", lastSyncByKind: {} };
  return {
    apiBaseUrl: stored.apiBaseUrl || BERRYPILOT_API_BASE_URL,
    connectorToken: stored.connectorToken,
    pairedAt: stored.pairedAt,
    status: stored.status || "connected",
    accountLabel: stored.accountLabel || "",
    lastSyncAt: stored.lastSyncAt,
    lastResult: stored.lastResult,
    lastError: stored.lastError || "",
    lastSyncByKind: stored.lastSyncByKind || {}
  };
}
async function setBerryPilotState(patch) {
  const state = { ...await getBerryPilotState(), ...patch };
  await chrome.storage.local.set({ [BERRYPILOT_STATE_KEY]: state });
  return state;
}
async function acquireBrowserJob(kind, referenceId) {
  const stored = await chrome.storage.session.get(BROWSER_JOB_KEY);
  const current = stored[BROWSER_JOB_KEY];
  if (current?.expiresAt > Date.now()) return null;
  const lease = { id: newId("job"), kind, referenceId, createdAt: Date.now(), expiresAt: Date.now() + 20 * 6e4 };
  await chrome.storage.session.set({ [BROWSER_JOB_KEY]: lease });
  return lease;
}
async function updateBrowserJob(lease, patch) {
  const stored = await chrome.storage.session.get(BROWSER_JOB_KEY);
  if (stored[BROWSER_JOB_KEY]?.id !== lease.id) return;
  await chrome.storage.session.set({ [BROWSER_JOB_KEY]: { ...stored[BROWSER_JOB_KEY], ...patch } });
}
async function releaseBrowserJob(leaseId) {
  if (!leaseId) return;
  const stored = await chrome.storage.session.get(BROWSER_JOB_KEY);
  if (stored[BROWSER_JOB_KEY]?.id === leaseId) await chrome.storage.session.remove(BROWSER_JOB_KEY);
}
async function browserJobActive() {
  const stored = await chrome.storage.session.get(BROWSER_JOB_KEY);
  const current = stored[BROWSER_JOB_KEY];
  if (!current) return false;
  if (current.expiresAt > Date.now()) return true;
  await chrome.storage.session.remove(BROWSER_JOB_KEY);
  return false;
}
async function setLastEvent(patch) {
  const state = await getState();
  state.lastEvent = { at: (/* @__PURE__ */ new Date()).toISOString(), ...patch };
  await setState(state);
}
async function syncAlarms() {
  const state = await getState();
  const existing = await chrome.alarms.getAll();
  await Promise.all(existing.filter((alarm) => alarm.name.startsWith(ALARM_PREFIX)).map((alarm) => chrome.alarms.clear(alarm.name)));
  const enabledSearches = state.searches.filter((row) => row.enabled);
  for (const [index, search2] of enabledSearches.entries()) {
    await chrome.alarms.create(`${ALARM_PREFIX}${search2.id}`, {
      delayInMinutes: Math.min(search2.intervalMinutes, 2 + index * 2),
      periodInMinutes: Math.max(30, search2.intervalMinutes)
    });
  }
  await chrome.alarms.create(QUEUE_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
}
async function createDiscreteTab(url) {
  let createdWindow;
  try {
    createdWindow = await chrome.windows.create({
      focused: false,
      state: "minimized",
      type: "normal",
      url
    });
    const tab = createdWindow.tabs?.[0] || (await chrome.tabs.query({ windowId: createdWindow.id }))[0];
    if (!tab?.id) throw new Error("Fen\xEAtre de collecte sans onglet");
    return { tab, windowId: createdWindow.id, discreteWindow: true };
  } catch (error) {
    if (createdWindow?.id) await chrome.windows.remove(createdWindow.id).catch(() => void 0);
    const tab = await chrome.tabs.create({ active: false, url });
    return {
      tab,
      windowId: tab.windowId,
      discreteWindow: false,
      fallbackReason: error instanceof Error ? error.message : "Fen\xEAtre minimis\xE9e indisponible"
    };
  }
}
async function closeCollectionContext({ tabId, windowId, discreteWindow }) {
  if (discreteWindow && windowId != null) {
    await chrome.windows.remove(windowId).catch(() => void 0);
    return;
  }
  if (tabId != null) await chrome.tabs.remove(tabId).catch(() => void 0);
}
async function registerRun(tabId, search2, closeTabAfterCapture, mode, leaseId, collectionContext = {}) {
  const key = `${RUN_PREFIX}${tabId}`;
  await chrome.storage.session.set({
    [key]: {
      runId: newId("run"),
      searchId: search2.id,
      closeTabAfterCapture,
      mode,
      leaseId,
      windowId: collectionContext.windowId,
      discreteWindow: collectionContext.discreteWindow === true,
      createdAt: Date.now()
    }
  });
  await chrome.alarms.create(`${RUN_TIMEOUT_PREFIX}${tabId}`, { delayInMinutes: 2 });
}
async function executeSearch(searchId) {
  const state = await getState();
  const search2 = state.searches.find((row) => row.id === searchId && row.enabled);
  if (!search2) throw new Error("Recherche introuvable ou d\xE9sactiv\xE9e");
  const lease = await acquireBrowserJob("multi-source", searchId);
  if (!lease) return { ok: true, queued: true };
  let context;
  try {
    context = await createDiscreteTab(search2.url);
    await updateBrowserJob(lease, { tabId: context.tab.id, windowId: context.windowId, discreteWindow: context.discreteWindow });
    await registerRun(context.tab.id, search2, search2.closeTabAfterCapture, "scheduled", lease.id, context);
    await setLastEvent({ status: "opened", searchId, sourceId: search2.sourceId, discreteWindow: context.discreteWindow });
    return { ok: true, tabId: context.tab.id, discreteWindow: context.discreteWindow };
  } catch (error) {
    if (context) {
      await closeCollectionContext({ tabId: context.tab?.id, windowId: context.windowId, discreteWindow: context.discreteWindow });
    }
    await releaseBrowserJob(lease.id);
    throw error;
  }
}
async function activeRunCount() {
  const session = await chrome.storage.session.get(null);
  return Object.keys(session).filter((key) => key.startsWith(RUN_PREFIX)).length;
}
async function pumpSearchQueue() {
  if (await activeRunCount() || await browserJobActive()) return { queued: true };
  const state = await getState();
  const searchId = state.pendingSearchIds.shift();
  if (!searchId) return { queued: false };
  await setState(state);
  return executeSearch(searchId);
}
async function requestSearchRun(searchId) {
  const state = await getState();
  if (!state.searches.some((row) => row.id === searchId && row.enabled)) throw new Error("Recherche introuvable ou d\xE9sactiv\xE9e");
  if (!state.pendingSearchIds.includes(searchId)) state.pendingSearchIds.push(searchId);
  await setState(state);
  return pumpSearchQueue();
}
function chunks(rows, size = 100) {
  const result = [];
  for (let index = 0; index < rows.length; index += size) result.push(rows.slice(index, index + size));
  return result;
}
async function postEnvelope(app, envelope) {
  const response = await fetch(app.ingestUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${app.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(envelope)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json().catch(() => ({ ok: true }));
}
function storeLocalListings(state, envelope) {
  const listings = Array.isArray(state.localListings) ? state.localListings : [];
  const byKey = new Map(listings.map((listing) => [canonicalListingKey(listing), listing]));
  for (const listing of envelope.listings) {
    const key = canonicalListingKey(listing);
    byKey.set(key, { ...byKey.get(key), ...listing, appId: envelope.context.appId, workspaceId: envelope.context.workspaceId });
  }
  state.localListings = [...byKey.values()].slice(-1e4);
  return envelope.listings.length;
}
async function notifyRadarTabs() {
  const tabs = await chrome.tabs.query({ url: "https://radar-immo-blond.vercel.app/*" });
  await Promise.all(tabs.filter((tab) => tab.id).map((tab) => chrome.tabs.sendMessage(tab.id, { type: "RADAR_LOCAL_UPDATED" }).catch(() => void 0)));
}
async function getLocalRadarPayload() {
  const state = await getState();
  return {
    listings: state.localListings || [],
    searches: state.searches.filter((search2) => search2.appIds.includes("radar-immo")),
    runs: state.runs,
    updatedAt: state.lastEvent?.at || null
  };
}
async function enqueue(state, appId, envelope, reason) {
  state.queue.push({ id: newId("delivery"), appId, envelope, attempts: 0, nextRetryAt: Date.now() + 6e4, reason: String(reason).slice(0, 300) });
  state.queue = state.queue.slice(-500);
}
async function dispatchListings(run, pageUrl, sourceId, rows) {
  const state = await getState();
  const search2 = state.searches.find((item) => item.id === run.searchId);
  if (!search2 || search2.sourceId !== sourceId) throw new Error("La page ne correspond pas \xE0 la recherche");
  const seen = new Set(state.seen[search2.id] || []);
  const fresh = rows.filter((row) => {
    const key = canonicalListingKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  state.seen[search2.id] = [...seen].slice(-5e3);
  let accepted = 0;
  for (const appId of search2.appIds) {
    const app = state.apps.find((item) => item.id === appId && item.enabled);
    if (!app) continue;
    for (const batch of chunks(fresh)) {
      const envelope = makeEnvelope({ app, search: search2, runId: run.runId, listings: batch });
      if (app.transport === "local") {
        accepted += storeLocalListings(state, envelope);
        continue;
      }
      try {
        await postEnvelope(app, envelope);
        accepted += batch.length;
      } catch (error) {
        await enqueue(state, app.id, envelope, error.message);
      }
    }
  }
  state.runs[search2.id] = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    pageUrl,
    found: rows.length,
    fresh: fresh.length,
    delivered: accepted,
    queued: state.queue.length
  };
  state.lastEvent = { at: (/* @__PURE__ */ new Date()).toISOString(), status: "captured", searchId: search2.id, sourceId, found: rows.length, fresh: fresh.length };
  await setState(state);
  if (accepted) await notifyRadarTabs();
  return { found: rows.length, fresh: fresh.length, accepted };
}
async function handleExtracted(message, sender) {
  const tabId = sender.tab?.id;
  if (!tabId) return { ignored: true };
  const key = `${RUN_PREFIX}${tabId}`;
  const stored = await chrome.storage.session.get(key);
  const run = stored[key];
  if (!run) return { ignored: true };
  try {
    return await dispatchListings(run, message.pageUrl, message.sourceId, message.listings || []);
  } finally {
    await chrome.storage.session.remove(key);
    await chrome.alarms.clear(`${RUN_TIMEOUT_PREFIX}${tabId}`);
    await releaseBrowserJob(run.leaseId);
    if (run.closeTabAfterCapture) {
      await closeCollectionContext({ tabId, windowId: run.windowId, discreteWindow: run.discreteWindow });
    }
    await pumpSearchQueue();
  }
}
async function captureActive(searchId) {
  const state = await getState();
  const search2 = state.searches.find((row) => row.id === searchId && row.enabled);
  if (!search2) throw new Error("Recherche introuvable");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Aucun onglet actif");
  const lease = await acquireBrowserJob("multi-source-manual", searchId);
  if (!lease) throw new Error("Une autre collecte est d\xE9j\xE0 en cours");
  try {
    await updateBrowserJob(lease, { tabId: tab.id });
    await registerRun(tab.id, search2, false, "manual", lease.id);
    await chrome.tabs.sendMessage(tab.id, { type: "SCAN_NOW" });
    return { ok: true };
  } catch (error) {
    await chrome.storage.session.remove(`${RUN_PREFIX}${tab.id}`);
    await releaseBrowserJob(lease.id);
    throw error;
  }
}
async function retryQueue() {
  const state = await getState();
  const now = Date.now();
  const remaining = [];
  for (const item of state.queue) {
    if (item.nextRetryAt > now) {
      remaining.push(item);
      continue;
    }
    const app = state.apps.find((row) => row.id === item.appId && row.enabled);
    if (!app) continue;
    try {
      await postEnvelope(app, item.envelope);
    } catch (error) {
      const attempts = item.attempts + 1;
      if (attempts < 8) remaining.push({ ...item, attempts, reason: error.message, nextRetryAt: now + Math.min(6 * 60 * 6e4, 6e4 * 2 ** attempts) });
    }
  }
  state.queue = remaining;
  await setState(state);
}
async function saveConfig(message) {
  const apps = (message.apps || []).map(normalizeApp);
  const appIds = apps.map((app) => app.id);
  if (new Set(appIds).size !== appIds.length) throw new Error("Chaque application doit avoir un identifiant unique");
  const searches = (message.searches || []).map((search2) => normalizeSearch(search2, appIds));
  if (new Set(searches.map((search2) => search2.id)).size !== searches.length) throw new Error("Chaque recherche doit avoir un identifiant unique");
  const previous = await getState();
  await setState({ ...previous, apps, searches });
  await syncAlarms();
  return { ok: true };
}
async function pairBerryPilot(code) {
  const response = await fetch(`${BERRYPILOT_API_BASE_URL}/api/lbc-connector/pair`, {
    body: JSON.stringify({ code, extensionVersion: EXTENSION_VERSION }),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.token) throw new Error(result.error || "Appairage BerryPilot impossible.");
  await setBerryPilotState({
    apiBaseUrl: result.apiBaseUrl || BERRYPILOT_API_BASE_URL,
    connectorToken: result.token,
    pairedAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: "connected",
    lastError: ""
  });
  await berryPilotHeartbeat({ status: "connected" });
  return { ok: true };
}
async function berryPilotApiRequest(path, init = {}) {
  const state = await getBerryPilotState();
  if (!state.connectorToken) throw new Error("Extension non appair\xE9e \xE0 BerryPilot.");
  const response = await fetch(`${state.apiBaseUrl || BERRYPILOT_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${state.connectorToken}`,
      "content-type": "application/json",
      ...init.headers || {}
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) await setBerryPilotState({ status: "disconnected" });
    throw new Error(data.error || `BerryPilot a r\xE9pondu ${response.status}.`);
  }
  return data;
}
async function berryPilotHeartbeat(values) {
  return berryPilotApiRequest("/api/lbc-connector/heartbeat", {
    body: JSON.stringify({ extensionVersion: EXTENSION_VERSION, ...values }),
    method: "POST"
  });
}
function isBerryPilotSearchDue(search2, trigger, lastSyncByKind) {
  if (trigger === "manual") return true;
  const last = Number(lastSyncByKind[search2.rentalKind] || 0);
  return Date.now() - last >= Number(search2.intervalHours) * 60 * 6e4;
}
async function waitForTab(tabId, timeoutMs = 3e4) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      error ? reject(error) : setTimeout(resolve, 900);
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };
    const timer = setTimeout(() => finish(new Error("Chargement Leboncoin trop long.")), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((current) => {
      if (current.status === "complete") finish();
    }).catch(() => finish(new Error("Onglet Leboncoin introuvable.")));
  });
}
async function messageTab(tabId, message) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
  }
  throw new Error("La page Leboncoin n\u2019a pas pu \xEAtre analys\xE9e.");
}
async function collectBerryPilotSearch(searchUrl, lease) {
  const context = await createDiscreteTab(searchUrl);
  const { tab } = context;
  if (!tab.id) throw new Error("Impossible d\u2019ouvrir la recherche Leboncoin.");
  await updateBrowserJob(lease, { tabId: tab.id, windowId: context.windowId, discreteWindow: context.discreteWindow });
  try {
    await waitForTab(tab.id);
    const search2 = await messageTab(tab.id, { type: "BERRYPILOT_COLLECT_SEARCH" });
    if (!search2?.loggedIn) throw new Error("La session Leboncoin n\u2019est pas connect\xE9e dans Chrome.");
    if (search2.blocked) throw new Error("Leboncoin demande une v\xE9rification manuelle. Ouvrez le site pour la valider.");
    const listings = [];
    for (const sourceUrl of (search2.urls || []).slice(0, 40)) {
      await chrome.tabs.update(tab.id, { url: sourceUrl });
      await waitForTab(tab.id);
      const listing = await messageTab(tab.id, { type: "BERRYPILOT_COLLECT_LISTING" });
      if (listing?.sourceUrl && listing?.title) listings.push(listing);
    }
    return { accountLabel: search2.accountLabel || "", listings };
  } finally {
    await closeCollectionContext({ tabId: tab.id, windowId: context.windowId, discreteWindow: context.discreteWindow });
    await updateBrowserJob(lease, { tabId: null, windowId: null, discreteWindow: null });
  }
}
async function performBerryPilotSync(trigger) {
  const lease = await acquireBrowserJob("berrypilot", trigger);
  if (!lease) return { ok: true, busy: true };
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  await setBerryPilotState({ lastError: "", status: "syncing", syncStartedAt: startedAt });
  try {
    const config = await berryPilotApiRequest("/api/lbc-connector/config", { method: "GET" });
    if (!config.campaignEnabled) {
      await setBerryPilotState({ status: "paused" });
      return { ok: true, paused: true };
    }
    const state = await getBerryPilotState();
    const lastSyncByKind = state.lastSyncByKind || {};
    const searches = (config.searches || []).filter((search2) => search2.enabled && isBerryPilotSearchDue(search2, trigger, lastSyncByKind));
    if (!searches.length) {
      await berryPilotHeartbeat({ status: "connected" });
      await setBerryPilotState({ status: "connected" });
      return { ok: true, skipped: true };
    }
    const totals = { blocked: 0, discovered: 0, duplicates: 0, imported: 0 };
    let accountLabel = "";
    for (const search2 of searches) {
      const collected = await collectBerryPilotSearch(search2.url, lease);
      accountLabel ||= collected.accountLabel || "";
      totals.discovered += collected.listings.length;
      const imported = await berryPilotApiRequest("/api/lbc-connector/import", {
        body: JSON.stringify({ accountLabel, listings: collected.listings, rentalKind: search2.rentalKind, startedAt, trigger }),
        method: "POST"
      });
      totals.blocked += imported.blocked || 0;
      totals.duplicates += imported.duplicates || 0;
      totals.imported += imported.imported || 0;
      lastSyncByKind[search2.rentalKind] = Date.now();
    }
    await setBerryPilotState({
      accountLabel,
      lastResult: totals,
      lastSyncAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastSyncByKind,
      status: "connected"
    });
    return { ok: true, totals };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Erreur de synchronisation inconnue.";
    await setBerryPilotState({ lastError: message, status: "error" });
    try {
      await berryPilotHeartbeat({ lastError: message, status: "error" });
    } catch {
    }
    return { error: message, ok: false };
  } finally {
    await releaseBrowserJob(lease.id);
    await pumpSearchQueue();
  }
}
async function runBerryPilotSync(trigger) {
  if (activeBerryPilotSync) return activeBerryPilotSync;
  activeBerryPilotSync = performBerryPilotSync(trigger).finally(() => {
    activeBerryPilotSync = null;
  });
  return activeBerryPilotSync;
}
async function disconnectBerryPilot() {
  await chrome.storage.local.remove(BERRYPILOT_STATE_KEY);
  await chrome.storage.local.remove([
    "apiBaseUrl",
    "connectorToken",
    "pairedAt",
    "status",
    "accountLabel",
    "lastSyncAt",
    "lastResult",
    "lastError",
    "lastSyncByKind"
  ]);
  return { ok: true };
}
async function syncAllAlarms() {
  await ensureRadarDefaults();
  await syncAlarms();
  await chrome.alarms.create(BERRYPILOT_ALARM, { delayInMinutes: 5, periodInMinutes: 60 });
}
chrome.runtime.onInstalled.addListener(() => syncAllAlarms());
chrome.runtime.onStartup.addListener(() => syncAllAlarms());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === QUEUE_ALARM) retryQueue();
  else if (alarm.name === BERRYPILOT_ALARM) runBerryPilotSync("alarm");
  else if (alarm.name.startsWith(ALARM_PREFIX)) requestSearchRun(alarm.name.slice(ALARM_PREFIX.length)).catch((error) => setLastEvent({ status: "error", error: error.message }));
  else if (alarm.name.startsWith(RUN_TIMEOUT_PREFIX)) {
    const tabId = Number(alarm.name.slice(RUN_TIMEOUT_PREFIX.length));
    chrome.storage.session.get(`${RUN_PREFIX}${tabId}`).then(async (stored) => {
      const run = stored[`${RUN_PREFIX}${tabId}`];
      await releaseBrowserJob(run?.leaseId);
      await closeCollectionContext({ tabId, windowId: run?.windowId, discreteWindow: run?.discreteWindow });
    }).then(() => chrome.storage.session.remove(`${RUN_PREFIX}${tabId}`)).then(() => setLastEvent({ status: "timeout", tabId })).then(() => pumpSearchQueue());
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.get(`${RUN_PREFIX}${tabId}`).then((stored) => releaseBrowserJob(stored[`${RUN_PREFIX}${tabId}`]?.leaseId)).then(() => chrome.storage.session.remove(`${RUN_PREFIX}${tabId}`)).then(() => chrome.alarms.clear(`${RUN_TIMEOUT_PREFIX}${tabId}`)).then(() => pumpSearchQueue());
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    PAGE_EXTRACTED: () => handleExtracted(message, sender),
    GET_STATE: () => getState(),
    SAVE_CONFIG: () => saveConfig(message),
    RUN_SEARCH: () => requestSearchRun(message.searchId),
    CAPTURE_ACTIVE: () => captureActive(message.searchId),
    RETRY_QUEUE: () => retryQueue().then(() => ({ ok: true })),
    GET_RADAR_LOCAL_LISTINGS: () => getLocalRadarPayload(),
    BERRYPILOT_GET_STATE: () => getBerryPilotState(),
    BERRYPILOT_PAIR: () => pairBerryPilot(message.code),
    BERRYPILOT_RUN_SYNC: () => runBerryPilotSync("manual"),
    BERRYPILOT_DISCONNECT: () => disconnectBerryPilot()
  };
  const action = actions[message?.type];
  if (!action) return false;
  action().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
