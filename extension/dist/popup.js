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

// extension/src/popup.js
var status = document.getElementById("status");
var select = document.getElementById("search");
var capture = document.getElementById("capture");
var escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
async function message(payload) {
  const response = await chrome.runtime.sendMessage(payload);
  if (!response?.ok) throw new Error(response?.error || "Erreur extension");
  return response.result;
}
var [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
var sourceId = sourceFromUrl(tab?.url || "");
var state = await message({ type: "GET_STATE" });
var searches = state.searches.filter((row) => row.enabled && row.sourceId === sourceId);
document.getElementById("source").textContent = sourceId ? `Source d\xE9tect\xE9e : ${sourceId}` : "Ce site n\u2019est pas encore pris en charge.";
select.innerHTML = searches.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.label)}</option>`).join("");
capture.disabled = !searches.length;
document.getElementById("queue").textContent = `${state.queue.length} envoi(s) en attente`;
capture.addEventListener("click", async () => {
  try {
    capture.disabled = true;
    await message({ type: "CAPTURE_ACTIVE", searchId: select.value });
    status.textContent = "Page analys\xE9e et envoy\xE9e.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    capture.disabled = false;
  }
});
document.getElementById("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
