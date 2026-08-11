const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

export function chartCard(title, subtitle, svg) {
  return `<section class="chart-card"><div class="chart-heading"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div><div class="chart-area">${svg}</div></section>`;
}

export function lineChart(rows, { xKey, series, formatX = String, formatY = String, zero = true }) {
  const width = 840;
  const height = 330;
  const margin = { top: 20, right: 28, bottom: 47, left: 74 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const xValues = rows.map((row) => Number(row[xKey]));
  const yValues = rows.flatMap((row) => series.map((item) => Number(row[item.key])));
  let xMin = Math.min(...xValues);
  let xMax = Math.max(...xValues);
  let yMin = Math.min(...yValues, zero ? 0 : Infinity);
  let yMax = Math.max(...yValues, zero ? 0 : -Infinity);
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  if (yMin === yMax) { yMin -= 1; yMax += 1; }
  const yPad = (yMax - yMin) * 0.12 || 1;
  yMin -= yPad;
  yMax += yPad;
  const x = (value) => margin.left + (Number(value) - xMin) / (xMax - xMin) * innerW;
  const y = (value) => margin.top + (yMax - Number(value)) / (yMax - yMin) * innerH;
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + (yMax - yMin) * i / 5);
  const xIndexes = [...new Set([0, Math.floor((rows.length - 1) * .25), Math.floor((rows.length - 1) * .5), Math.floor((rows.length - 1) * .75), rows.length - 1])];
  const grids = yTicks.map((tick) => `<g><line x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}" class="chart-grid"/><text x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end" class="chart-tick">${escapeHtml(formatY(tick))}</text></g>`).join("");
  const xLabels = xIndexes.map((index) => `<text x="${x(rows[index][xKey])}" y="${height - 18}" text-anchor="middle" class="chart-tick">${escapeHtml(formatX(rows[index][xKey]))}</text>`).join("");
  const paths = series.map((item) => {
    const d = rows.map((row, index) => `${index === 0 ? "M" : "L"}${x(row[xKey]).toFixed(2)},${y(row[item.key]).toFixed(2)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join("");
  const zeroLine = zero && yMin <= 0 && yMax >= 0 ? `<line x1="${margin.left}" x2="${width - margin.right}" y1="${y(0)}" y2="${y(0)}" class="zero-line"/><text x="${width - margin.right}" y="${y(0) - 6}" text-anchor="end" class="zero-label">0 — point mort</text>` : "";
  const legend = series.map((item, index) => `<g transform="translate(${margin.left + index * 190},5)"><line x1="0" x2="22" y1="8" y2="8" stroke="${item.color}" stroke-width="3"/><text x="29" y="12" class="chart-legend">${escapeHtml(item.label)}</text></g>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Graphique ${escapeHtml(series.map((s) => s.label).join(", "))}" preserveAspectRatio="xMidYMid meet"><g>${legend}${grids}${zeroLine}${paths}${xLabels}</g></svg>`;
}

export function barChart(rows, { labelKey, valueKey, formatY = String }) {
  const width = 840;
  const height = 330;
  const margin = { top: 20, right: 28, bottom: 58, left: 74 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const values = rows.map((row) => Number(row[valueKey]));
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  const pad = (max - min) * .12 || 1;
  min -= pad;
  max += pad;
  const y = (value) => margin.top + (max - Number(value)) / (max - min) * innerH;
  const y0 = y(0);
  const slot = innerW / rows.length;
  const barWidth = slot * .58;
  const yTicks = Array.from({ length: 6 }, (_, i) => min + (max - min) * i / 5);
  const grids = yTicks.map((tick) => `<g><line x1="${margin.left}" x2="${width - margin.right}" y1="${y(tick)}" y2="${y(tick)}" class="chart-grid"/><text x="${margin.left - 10}" y="${y(tick) + 4}" text-anchor="end" class="chart-tick">${escapeHtml(formatY(tick))}</text></g>`).join("");
  const bars = rows.map((row, index) => {
    const value = Number(row[valueKey]);
    const top = Math.min(y(value), y0);
    const h = Math.max(2, Math.abs(y(value) - y0));
    const bx = margin.left + index * slot + (slot - barWidth) / 2;
    return `<g><rect x="${bx}" y="${top}" width="${barWidth}" height="${h}" rx="5" class="chart-bar ${value >= 0 ? "bar-positive" : "bar-negative"}"/><text x="${bx + barWidth / 2}" y="${height - 22}" text-anchor="middle" class="chart-tick">${escapeHtml(row[labelKey])}</text></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" preserveAspectRatio="xMidYMid meet">${grids}<line x1="${margin.left}" x2="${width - margin.right}" y1="${y0}" y2="${y0}" class="zero-line"/>${bars}</svg>`;
}
