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
    listingPaths: [/\/detail-(?:vente|location)(?:-|\/)\S*/i, /\/annonces?\//i]
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
  let ingestUrl;
  try {
    ingestUrl = new URL(input?.ingestUrl).toString();
  } catch {
    throw new Error("URL d\u2019ingestion invalide");
  }
  if (!id || !workspaceId || !clean(input?.token, 1e3)) throw new Error("Application, espace et jeton obligatoires");
  if (!/^https?:$/.test(new URL(ingestUrl).protocol)) throw new Error("Seuls HTTP et HTTPS sont autoris\xE9s");
  return {
    id,
    label: clean(input?.label || id, 120),
    workspaceId,
    ingestUrl,
    token: clean(input.token, 1e3),
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
function makeEnvelope({ app, search, runId, listings, capturedAt = (/* @__PURE__ */ new Date()).toISOString() }) {
  return {
    context: {
      appId: app.id,
      workspaceId: app.workspaceId,
      searchId: search.id,
      runId,
      sourceId: search.sourceId,
      searchUrl: search.url,
      capturedAt
    },
    listings
  };
}
function canonicalListingKey(listing) {
  return `${listing.sourceId}:${listing.externalId || listing.sourceUrl}`;
}

// extension/src/background.js
var STATE_KEY = "berryConnectorState";
var RUN_PREFIX = "run:";
var ALARM_PREFIX = "search:";
var QUEUE_ALARM = "delivery-queue";
var defaultState = () => ({ version: 1, apps: [], searches: [], queue: [], seen: {}, runs: {}, lastEvent: null });
async function getState() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  return { ...defaultState(), ...stored[STATE_KEY] || {} };
}
async function setState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
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
  for (const search of state.searches.filter((row) => row.enabled)) {
    await chrome.alarms.create(`${ALARM_PREFIX}${search.id}`, {
      delayInMinutes: Math.min(5, search.intervalMinutes),
      periodInMinutes: Math.max(30, search.intervalMinutes)
    });
  }
  await chrome.alarms.create(QUEUE_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
}
async function registerRun(tabId, search, closeTabAfterCapture, mode) {
  const key = `${RUN_PREFIX}${tabId}`;
  await chrome.storage.session.set({
    [key]: {
      runId: newId("run"),
      searchId: search.id,
      closeTabAfterCapture,
      mode,
      createdAt: Date.now()
    }
  });
}
async function runSearch(searchId) {
  const state = await getState();
  const search = state.searches.find((row) => row.id === searchId && row.enabled);
  if (!search) throw new Error("Recherche introuvable ou d\xE9sactiv\xE9e");
  const tab = await chrome.tabs.create({ url: search.url, active: false });
  await registerRun(tab.id, search, search.closeTabAfterCapture, "scheduled");
  await setLastEvent({ status: "opened", searchId, sourceId: search.sourceId });
  return { ok: true, tabId: tab.id };
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
async function enqueue(state, appId, envelope, reason) {
  state.queue.push({ id: newId("delivery"), appId, envelope, attempts: 0, nextRetryAt: Date.now() + 6e4, reason: String(reason).slice(0, 300) });
  state.queue = state.queue.slice(-500);
}
async function dispatchListings(run, pageUrl, sourceId, rows) {
  const state = await getState();
  const search = state.searches.find((item) => item.id === run.searchId);
  if (!search || search.sourceId !== sourceId) throw new Error("La page ne correspond pas \xE0 la recherche");
  const seen = new Set(state.seen[search.id] || []);
  const fresh = rows.filter((row) => {
    const key = canonicalListingKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  state.seen[search.id] = [...seen].slice(-5e3);
  let accepted = 0;
  for (const appId of search.appIds) {
    const app = state.apps.find((item) => item.id === appId && item.enabled);
    if (!app) continue;
    for (const batch of chunks(fresh)) {
      const envelope = makeEnvelope({ app, search, runId: run.runId, listings: batch });
      try {
        await postEnvelope(app, envelope);
        accepted += batch.length;
      } catch (error) {
        await enqueue(state, app.id, envelope, error.message);
      }
    }
  }
  state.runs[search.id] = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    pageUrl,
    found: rows.length,
    fresh: fresh.length,
    delivered: accepted,
    queued: state.queue.length
  };
  state.lastEvent = { at: (/* @__PURE__ */ new Date()).toISOString(), status: "captured", searchId: search.id, sourceId, found: rows.length, fresh: fresh.length };
  await setState(state);
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
    if (run.closeTabAfterCapture) await chrome.tabs.remove(tabId).catch(() => void 0);
  }
}
async function captureActive(searchId) {
  const state = await getState();
  const search = state.searches.find((row) => row.id === searchId && row.enabled);
  if (!search) throw new Error("Recherche introuvable");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Aucun onglet actif");
  await registerRun(tab.id, search, false, "manual");
  await chrome.tabs.sendMessage(tab.id, { type: "SCAN_NOW" });
  return { ok: true };
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
  const searches = (message.searches || []).map((search) => normalizeSearch(search, appIds));
  if (new Set(searches.map((search) => search.id)).size !== searches.length) throw new Error("Chaque recherche doit avoir un identifiant unique");
  const previous = await getState();
  await setState({ ...previous, apps, searches });
  await syncAlarms();
  return { ok: true };
}
chrome.runtime.onInstalled.addListener(() => syncAlarms());
chrome.runtime.onStartup.addListener(() => syncAlarms());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === QUEUE_ALARM) retryQueue();
  else if (alarm.name.startsWith(ALARM_PREFIX)) runSearch(alarm.name.slice(ALARM_PREFIX.length)).catch((error) => setLastEvent({ status: "error", error: error.message }));
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`${RUN_PREFIX}${tabId}`));
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    PAGE_EXTRACTED: () => handleExtracted(message, sender),
    GET_STATE: () => getState(),
    SAVE_CONFIG: () => saveConfig(message),
    RUN_SEARCH: () => runSearch(message.searchId),
    CAPTURE_ACTIVE: () => captureActive(message.searchId),
    RETRY_QUEUE: () => retryQueue().then(() => ({ ok: true }))
  };
  const action = actions[message?.type];
  if (!action) return false;
  action().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
