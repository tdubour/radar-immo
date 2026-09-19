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

// extension/src/popup.js
var byId = (id) => document.getElementById(id);
var escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
async function message(payload) {
  const response = await chrome.runtime.sendMessage(payload);
  if (!response?.ok) throw new Error(response?.error || "Erreur extension");
  return response.result;
}
function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}
async function initMultiSource() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const sourceId = sourceFromUrl(tab?.url || "");
  const state = await message({ type: "GET_STATE" });
  const searches = state.searches.filter((row) => row.enabled && row.sourceId === sourceId);
  const sourceCount = new Set(state.searches.filter((row) => row.enabled).map((row) => row.sourceId)).size;
  byId("source").textContent = sourceId ? `Source d\xE9tect\xE9e : ${sourceId}` : `${sourceCount} portails actifs \xB7 ${state.searches.length} recherches configur\xE9es`;
  byId("search").innerHTML = searches.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.label)}</option>`).join("");
  byId("capture").disabled = !searches.length;
  byId("queue").textContent = `${state.localListings?.length || 0} annonce(s) Radar \xB7 ${state.queue.length} envoi(s) en attente`;
}
function berryPilotStatusLabel(status, paired) {
  if (!paired) return "\xC0 appairer avec BerryPilot";
  return { connected: "Connect\xE9e \xE0 BerryPilot", disconnected: "Appairage expir\xE9", error: "Action requise", paused: "Prospection en pause", syncing: "Synchronisation en cours\u2026" }[status] || "Connect\xE9e \xE0 BerryPilot";
}
async function refreshBerryPilot() {
  const state = await message({ type: "BERRYPILOT_GET_STATE" });
  const paired = Boolean(state.connectorToken);
  byId("bp-pairing").hidden = paired;
  byId("bp-connected").hidden = !paired;
  byId("bp-status").textContent = berryPilotStatusLabel(state.status, paired);
  byId("bp-status").dataset.kind = state.status === "error" || state.status === "disconnected" ? "error" : "ok";
  byId("bp-account").textContent = state.accountLabel || "Session d\xE9tect\xE9e";
  byId("bp-last-sync").textContent = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString("fr-FR") : "Jamais";
  byId("bp-feedback").textContent = state.lastError || "";
  byId("bp-result").hidden = !state.lastResult;
  if (state.lastResult) {
    byId("bp-result").textContent = `${state.lastResult.imported || 0} import\xE9e(s) \xB7 ${state.lastResult.duplicates || 0} doublon(s) \xB7 ${state.lastResult.blocked || 0} bloqu\xE9e(s)`;
  }
}
byId("capture").addEventListener("click", async () => {
  const button = byId("capture");
  try {
    setBusy(button, true, "Analyse\u2026");
    await message({ type: "CAPTURE_ACTIVE", searchId: byId("search").value });
    byId("status").textContent = "Page analys\xE9e et envoy\xE9e.";
  } catch (error) {
    byId("status").textContent = error.message;
  } finally {
    setBusy(button, false, "Analyser cette page");
  }
});
byId("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
byId("bp-pair").addEventListener("click", async () => {
  const button = byId("bp-pair");
  const code = byId("bp-code").value.trim();
  if (!code) {
    byId("bp-feedback").textContent = "Saisissez le code affich\xE9 dans BerryPilot.";
    return;
  }
  try {
    setBusy(button, true, "Appairage\u2026");
    await message({ type: "BERRYPILOT_PAIR", code });
    byId("bp-feedback").textContent = "";
    await refreshBerryPilot();
  } catch (error) {
    byId("bp-feedback").textContent = error.message;
  } finally {
    setBusy(button, false, "Rattacher ce Chrome");
  }
});
byId("bp-sync").addEventListener("click", async () => {
  const button = byId("bp-sync");
  try {
    setBusy(button, true, "Synchronisation\u2026");
    byId("bp-feedback").textContent = "L\u2019extension parcourt les recherches et contr\xF4le les descriptions.";
    const result = await message({ type: "BERRYPILOT_RUN_SYNC" });
    if (result.busy) throw new Error("Une autre collecte est d\xE9j\xE0 en cours. R\xE9essaie dans un instant.");
    if (!result.ok) throw new Error(result.error || "Synchronisation impossible.");
    byId("bp-feedback").textContent = "";
  } catch (error) {
    byId("bp-feedback").textContent = error.message;
  } finally {
    setBusy(button, false, "Synchroniser BerryPilot");
    await refreshBerryPilot();
  }
});
byId("bp-open").addEventListener("click", () => chrome.tabs.create({ url: "https://berryconciergerie-app.vercel.app/prospection/lbc" }));
byId("bp-disconnect").addEventListener("click", async () => {
  await message({ type: "BERRYPILOT_DISCONNECT" });
  await refreshBerryPilot();
});
await Promise.all([
  initMultiSource().catch((error) => {
    byId("status").textContent = error.message;
  }),
  refreshBerryPilot().catch((error) => {
    byId("bp-feedback").textContent = error.message;
  })
]);
