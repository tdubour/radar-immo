import { sourceFromUrl } from "./catalog.js";

const status = document.getElementById("status");
const select = document.getElementById("search");
const capture = document.getElementById("capture");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

async function message(payload) {
  const response = await chrome.runtime.sendMessage(payload);
  if (!response?.ok) throw new Error(response?.error || "Erreur extension");
  return response.result;
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const sourceId = sourceFromUrl(tab?.url || "");
const state = await message({ type: "GET_STATE" });
const searches = state.searches.filter((row) => row.enabled && row.sourceId === sourceId);
document.getElementById("source").textContent = sourceId ? `Source détectée : ${sourceId}` : "Ce site n’est pas encore pris en charge.";
select.innerHTML = searches.map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.label)}</option>`).join("");
capture.disabled = !searches.length;
document.getElementById("queue").textContent = `${state.queue.length} envoi(s) en attente`;

capture.addEventListener("click", async () => {
  try {
    capture.disabled = true;
    await message({ type: "CAPTURE_ACTIVE", searchId: select.value });
    status.textContent = "Page analysée et envoyée.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    capture.disabled = false;
  }
});

document.getElementById("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
