const rootSourceId = (value) => String(value || "").replace(/-\d+$/, "");

export function mergeExtensionSourceStatuses(serverSources = [], payload = {}) {
  const counts = new Map();
  for (const listing of payload.listings || []) {
    const sourceId = rootSourceId(listing?.sourceId);
    if (sourceId) counts.set(sourceId, (counts.get(sourceId) || 0) + 1);
  }

  const completed = new Set();
  const searches = new Map((payload.searches || []).map((search) => [search.id, rootSourceId(search.sourceId)]));
  for (const [searchId, run] of Object.entries(payload.runs || {})) {
    if (run?.at && searches.get(searchId)) completed.add(searches.get(searchId));
  }

  return (serverSources || []).map((source) => {
    const sourceId = rootSourceId(source.id);
    if (!counts.has(sourceId) && !completed.has(sourceId)) return source;
    return { ...source, ok: true, count: counts.get(sourceId) || 0, error: undefined, collector: "extension" };
  });
}

export function sourceStatusText(source) {
  if (source?.ok) return String(source.count || 0);
  return source?.error || "indisponible";
}
