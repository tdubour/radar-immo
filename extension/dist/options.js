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

// extension/src/model.js
function newId(prefix = "item") {
  return `${prefix}-${crypto.randomUUID()}`;
}

// extension/src/options.js
var byId = (id) => document.getElementById(id);
var state = { apps: [], searches: [] };
var escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
async function message(payload) {
  const response = await chrome.runtime.sendMessage(payload);
  if (!response?.ok) throw new Error(response?.error || "Erreur extension");
  return response.result;
}
function show(text, kind = "ok") {
  byId("status").textContent = text;
  byId("status").dataset.kind = kind;
}
function render() {
  byId("apps").innerHTML = state.apps.map((app) => `<article><strong>${escapeHtml(app.label)}</strong><span>${escapeHtml(app.id)} \xB7 ${escapeHtml(app.workspaceId)}</span><span>${escapeHtml(new URL(app.ingestUrl).origin)}</span><button data-delete-app="${escapeHtml(app.id)}">Supprimer</button></article>`).join("") || "<p>Aucune application.</p>";
  byId("searches").innerHTML = state.searches.map((search) => `<article><strong>${escapeHtml(search.label)}</strong><span>${escapeHtml(SOURCES[search.sourceId]?.label || search.sourceId)} \xB7 toutes les ${search.intervalMinutes} min</span><span>${escapeHtml(search.appIds.join(", "))}</span><button data-run="${escapeHtml(search.id)}">Tester</button><button data-delete-search="${escapeHtml(search.id)}">Supprimer</button></article>`).join("") || "<p>Aucune recherche.</p>";
  byId("searchApps").innerHTML = state.apps.map((app) => `<option value="${escapeHtml(app.id)}">${escapeHtml(app.label)}</option>`).join("");
  byId("searchSource").innerHTML = Object.values(SOURCES).map((source) => `<option value="${escapeHtml(source.id)}">${escapeHtml(source.label)}</option>`).join("");
}
async function persist() {
  await message({ type: "SAVE_CONFIG", apps: state.apps, searches: state.searches });
  show("Configuration enregistr\xE9e.");
  render();
}
byId("appForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const ingestUrl = byId("appEndpoint").value.trim();
    const endpoint = new URL(ingestUrl);
    const granted = await chrome.permissions.request({ origins: [`${endpoint.protocol}//${endpoint.host}/*`] });
    if (!granted) throw new Error("Permission refus\xE9e pour le backend de cette application");
    const app = {
      id: byId("appId").value.trim(),
      label: byId("appLabel").value.trim(),
      workspaceId: byId("workspaceId").value.trim(),
      ingestUrl,
      token: byId("appToken").value,
      enabled: true
    };
    state.apps = [...state.apps.filter((row) => row.id !== app.id), app];
    await persist();
    event.target.reset();
  } catch (error) {
    show(error.message, "error");
  }
});
byId("searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const appIds = [...byId("searchApps").selectedOptions].map((option) => option.value);
    state.searches.push({
      id: newId("search"),
      label: byId("searchLabel").value.trim(),
      sourceId: byId("searchSource").value,
      url: byId("searchUrl").value.trim(),
      appIds,
      intervalMinutes: Number(byId("searchInterval").value),
      enabled: true,
      closeTabAfterCapture: true
    });
    await persist();
    event.target.reset();
  } catch (error) {
    state = await message({ type: "GET_STATE" });
    show(error.message, "error");
    render();
  }
});
document.addEventListener("click", async (event) => {
  const appId = event.target.dataset.deleteApp;
  const searchId = event.target.dataset.deleteSearch;
  const runId = event.target.dataset.run;
  try {
    if (appId) {
      state.apps = state.apps.filter((row) => row.id !== appId);
      state.searches = state.searches.map((row) => ({ ...row, appIds: row.appIds.filter((id) => id !== appId) })).filter((row) => row.appIds.length);
      await persist();
    }
    if (searchId) {
      state.searches = state.searches.filter((row) => row.id !== searchId);
      await persist();
    }
    if (runId) {
      await message({ type: "RUN_SEARCH", searchId: runId });
      show("Recherche ouverte dans un onglet en arri\xE8re-plan.");
    }
  } catch (error) {
    show(error.message, "error");
  }
});
state = await message({ type: "GET_STATE" });
render();
