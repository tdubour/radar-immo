import { sourceFromUrl } from "./catalog.js";

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

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
  byId("source").textContent = sourceId ? `Source détectée : ${sourceId}` : `${sourceCount} portails actifs · ${state.searches.length} recherches configurées`;
  byId("search").innerHTML = searches.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.label)}</option>`).join("");
  byId("capture").disabled = !searches.length;
  byId("queue").textContent = `${state.localListings?.length || 0} annonce(s) Radar · ${state.queue.length} envoi(s) en attente`;
}

function berryPilotStatusLabel(status, paired) {
  if (!paired) return "À appairer avec BerryPilot";
  return ({ connected: "Connectée à BerryPilot", disconnected: "Appairage expiré", error: "Action requise", paused: "Prospection en pause", syncing: "Synchronisation en cours…" })[status] || "Connectée à BerryPilot";
}

async function refreshBerryPilot() {
  const state = await message({ type: "BERRYPILOT_GET_STATE" });
  const paired = Boolean(state.connectorToken);
  byId("bp-pairing").hidden = paired;
  byId("bp-connected").hidden = !paired;
  byId("bp-status").textContent = berryPilotStatusLabel(state.status, paired);
  byId("bp-status").dataset.kind = state.status === "error" || state.status === "disconnected" ? "error" : "ok";
  byId("bp-account").textContent = state.accountLabel || "Session détectée";
  byId("bp-last-sync").textContent = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString("fr-FR") : "Jamais";
  byId("bp-feedback").textContent = state.lastError || "";
  byId("bp-result").hidden = !state.lastResult;
  if (state.lastResult) {
    byId("bp-result").textContent = `${state.lastResult.imported || 0} importée(s) · ${state.lastResult.duplicates || 0} doublon(s) · ${state.lastResult.blocked || 0} bloquée(s)`;
  }
}

byId("capture").addEventListener("click", async () => {
  const button = byId("capture");
  try {
    setBusy(button, true, "Analyse…");
    await message({ type: "CAPTURE_ACTIVE", searchId: byId("search").value });
    byId("status").textContent = "Page analysée et envoyée.";
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
    byId("bp-feedback").textContent = "Saisissez le code affiché dans BerryPilot.";
    return;
  }
  try {
    setBusy(button, true, "Appairage…");
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
    setBusy(button, true, "Synchronisation…");
    byId("bp-feedback").textContent = "L’extension parcourt les recherches et contrôle les descriptions.";
    const result = await message({ type: "BERRYPILOT_RUN_SYNC" });
    if (result.busy) throw new Error("Une autre collecte est déjà en cours. Réessaie dans un instant.");
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
  initMultiSource().catch((error) => { byId("status").textContent = error.message; }),
  refreshBerryPilot().catch((error) => { byId("bp-feedback").textContent = error.message; })
]);
