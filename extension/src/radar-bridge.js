const CHANNEL = "berry-radar-connector";

async function publish() {
  const response = await chrome.runtime.sendMessage({ type: "GET_RADAR_LOCAL_LISTINGS" }).catch(() => null);
  if (!response?.ok) return;
  window.postMessage({ channel: CHANNEL, type: "RADAR_LISTINGS", payload: response.result }, location.origin);
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  if (event.data?.channel === CHANNEL && event.data?.type === "RADAR_REQUEST_LISTINGS") publish();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "RADAR_LOCAL_UPDATED") publish();
});

publish();
setInterval(publish, 60_000);
