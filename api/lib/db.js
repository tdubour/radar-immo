const baseUrl = () => `${process.env.SUPABASE_URL}/rest/v1`;

function headers(extra = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new Error("Supabase environment is not configured");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl()}${path}`, { ...options, headers: headers(options.headers) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Database ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

export const db = {
  select: (table, query = "") => request(`/${table}?${query}`, { headers: { Accept: "application/json" } }),
  insert: (table, rows) => request(`/${table}`, { method: "POST", body: JSON.stringify(rows), headers: { Prefer: "return=representation" } }),
  update: (table, query, values) => request(`/${table}?${query}`, { method: "PATCH", body: JSON.stringify(values), headers: { Prefer: "return=representation" } }),
  upsert: (table, rows, conflict) => request(`/${table}?on_conflict=${encodeURIComponent(conflict)}`, { method: "POST", body: JSON.stringify(rows), headers: { Prefer: "resolution=merge-duplicates,return=representation" } })
};
