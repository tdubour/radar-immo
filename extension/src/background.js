import { canonicalListingKey, makeEnvelope, newId, normalizeApp, normalizeSearch } from "./model.js";

const STATE_KEY = "berryConnectorState";
const RUN_PREFIX = "run:";
const ALARM_PREFIX = "search:";
const QUEUE_ALARM = "delivery-queue";
const RUN_TIMEOUT_PREFIX = "run-timeout:";

const defaultState = () => ({ version: 1, apps: [], searches: [], queue: [], pendingSearchIds: [], seen: {}, runs: {}, lastEvent: null });

async function getState() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  return { ...defaultState(), ...(stored[STATE_KEY] || {}) };
}

async function setState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

async function setLastEvent(patch) {
  const state = await getState();
  state.lastEvent = { at: new Date().toISOString(), ...patch };
  await setState(state);
}

async function syncAlarms() {
  const state = await getState();
  const existing = await chrome.alarms.getAll();
  await Promise.all(existing.filter((alarm) => alarm.name.startsWith(ALARM_PREFIX)).map((alarm) => chrome.alarms.clear(alarm.name)));
  const enabledSearches = state.searches.filter((row) => row.enabled);
  for (const [index, search] of enabledSearches.entries()) {
    await chrome.alarms.create(`${ALARM_PREFIX}${search.id}`, {
      delayInMinutes: Math.min(search.intervalMinutes, 2 + index * 2),
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
  await chrome.alarms.create(`${RUN_TIMEOUT_PREFIX}${tabId}`, { delayInMinutes: 2 });
}

async function executeSearch(searchId) {
  const state = await getState();
  const search = state.searches.find((row) => row.id === searchId && row.enabled);
  if (!search) throw new Error("Recherche introuvable ou désactivée");
  const tab = await chrome.tabs.create({ url: search.url, active: false });
  await registerRun(tab.id, search, search.closeTabAfterCapture, "scheduled");
  await setLastEvent({ status: "opened", searchId, sourceId: search.sourceId });
  return { ok: true, tabId: tab.id };
}

async function activeRunCount() {
  const session = await chrome.storage.session.get(null);
  return Object.keys(session).filter((key) => key.startsWith(RUN_PREFIX)).length;
}

async function pumpSearchQueue() {
  if (await activeRunCount()) return { queued: true };
  const state = await getState();
  const searchId = state.pendingSearchIds.shift();
  if (!searchId) return { queued: false };
  await setState(state);
  return executeSearch(searchId);
}

async function requestSearchRun(searchId) {
  const state = await getState();
  if (!state.searches.some((row) => row.id === searchId && row.enabled)) throw new Error("Recherche introuvable ou désactivée");
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

async function enqueue(state, appId, envelope, reason) {
  state.queue.push({ id: newId("delivery"), appId, envelope, attempts: 0, nextRetryAt: Date.now() + 60_000, reason: String(reason).slice(0, 300) });
  state.queue = state.queue.slice(-500);
}

async function dispatchListings(run, pageUrl, sourceId, rows) {
  const state = await getState();
  const search = state.searches.find((item) => item.id === run.searchId);
  if (!search || search.sourceId !== sourceId) throw new Error("La page ne correspond pas à la recherche");
  const seen = new Set(state.seen[search.id] || []);
  const fresh = rows.filter((row) => {
    const key = canonicalListingKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  state.seen[search.id] = [...seen].slice(-5000);
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
    at: new Date().toISOString(),
    pageUrl,
    found: rows.length,
    fresh: fresh.length,
    delivered: accepted,
    queued: state.queue.length
  };
  state.lastEvent = { at: new Date().toISOString(), status: "captured", searchId: search.id, sourceId, found: rows.length, fresh: fresh.length };
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
    await chrome.alarms.clear(`${RUN_TIMEOUT_PREFIX}${tabId}`);
    if (run.closeTabAfterCapture) await chrome.tabs.remove(tabId).catch(() => undefined);
    else await pumpSearchQueue();
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
      if (attempts < 8) remaining.push({ ...item, attempts, reason: error.message, nextRetryAt: now + Math.min(6 * 60 * 60_000, 60_000 * 2 ** attempts) });
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
  else if (alarm.name.startsWith(ALARM_PREFIX)) requestSearchRun(alarm.name.slice(ALARM_PREFIX.length)).catch((error) => setLastEvent({ status: "error", error: error.message }));
  else if (alarm.name.startsWith(RUN_TIMEOUT_PREFIX)) {
    const tabId = Number(alarm.name.slice(RUN_TIMEOUT_PREFIX.length));
    chrome.storage.session.remove(`${RUN_PREFIX}${tabId}`)
      .then(() => chrome.tabs.remove(tabId).catch(() => undefined))
      .then(() => setLastEvent({ status: "timeout", tabId }))
      .then(() => pumpSearchQueue());
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`${RUN_PREFIX}${tabId}`)
    .then(() => chrome.alarms.clear(`${RUN_TIMEOUT_PREFIX}${tabId}`))
    .then(() => pumpSearchQueue());
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    PAGE_EXTRACTED: () => handleExtracted(message, sender),
    GET_STATE: () => getState(),
    SAVE_CONFIG: () => saveConfig(message),
    RUN_SEARCH: () => requestSearchRun(message.searchId),
    CAPTURE_ACTIVE: () => captureActive(message.searchId),
    RETRY_QUEUE: () => retryQueue().then(() => ({ ok: true }))
  };
  const action = actions[message?.type];
  if (!action) return false;
  action().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
