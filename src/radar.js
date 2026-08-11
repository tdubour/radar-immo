const clamp = (value, min, max) => Math.min(Math.max(Number(value || 0), min), max);

export function createDefaultRadarConfig() {
  return {
    cadence: "daily",
    center: "Chaumont-sur-Tharonne",
    primaryRadiusKm: 100,
    extendedRadiusKm: 150,
    extendedMinPopulation: 10000,
    minCashflowAfterTaxMonthly: 100,
    privateSellerPriority: true,
    residentialBudgetMax: 400000,
    buildingBudgetMax: 600000,
    professionalBudgetMax: 750000,
    sources: [
      { id: "leboncoin", label: "Leboncoin", enabled: true, priority: true },
      { id: "seloger", label: "SeLoger", enabled: true, priority: true },
      { id: "bienici", label: "Bien’ici", enabled: true, priority: true },
      { id: "pap", label: "PAP", enabled: true, priority: true },
      { id: "paruvendu", label: "ParuVendu", enabled: true, priority: false },
      { id: "entreparticuliers", label: "Entreparticuliers", enabled: true, priority: false },
      { id: "geolocaux", label: "Geolocaux", enabled: true, priority: true },
      { id: "bureauxlocaux", label: "BureauxLocaux", enabled: true, priority: true },
      { id: "bpifrance", label: "Bourse des locaux Bpifrance", enabled: true, priority: false },
      { id: "seloger-pro", label: "SeLoger Bureaux & Commerces", enabled: true, priority: false },
      { id: "eol", label: "EOL", enabled: true, priority: false },
      { id: "arthur-loyd", label: "Arthur Loyd", enabled: true, priority: false }
    ],
    propertyTypes: [
      "Appartement", "Maison", "Immeuble de rapport", "Immeuble mixte", "Maison divisible",
      "Local commercial", "Murs commerciaux", "Bureau", "Entrepôt", "Hangar", "Local d’activité", "Atelier", "Terrain professionnel"
    ],
    excludedTypes: ["Viager", "Résidence services", "Programme neuf", "Terrain non constructible", "Parking seul"]
  };
}

export function isInSearchArea(candidate, config = createDefaultRadarConfig()) {
  const distance = Number(candidate.distanceKm);
  if (!Number.isFinite(distance)) return false;
  if (distance <= config.primaryRadiusKm) return true;
  return distance <= config.extendedRadiusKm && Number(candidate.cityPopulation || 0) >= config.extendedMinPopulation;
}

export function evaluateCandidate(candidate, config = createDefaultRadarConfig()) {
  const cashflow = Number(candidate.cashflowAfterTaxMonthly);
  const hasCashflow = Number.isFinite(cashflow);
  const confidence = clamp(candidate.dataConfidence ?? 0, 0, 1);
  const bankability = clamp(candidate.bankabilityScore ?? 0, 0, 100);
  const privateBonus = config.privateSellerPriority && candidate.sellerType === "private" ? 8 : 0;
  const agencyPenalty = config.privateSellerPriority && candidate.sellerType === "agency" ? 6 : 0;
  const distanceScore = Number.isFinite(Number(candidate.distanceKm)) ? clamp((150 - Number(candidate.distanceKm)) / 150, 0, 1) * 10 : 0;
  const cashflowScore = hasCashflow ? clamp((cashflow - config.minCashflowAfterTaxMonthly + 150) / 500, 0, 1) * 42 : 0;
  const score = clamp(cashflowScore + bankability * .25 + confidence * 15 + distanceScore + privateBonus - agencyPenalty, 0, 100);
  const inArea = isInSearchArea(candidate, config);
  const qualified = inArea && hasCashflow && cashflow >= config.minCashflowAfterTaxMonthly;
  return {
    ...candidate,
    score,
    inArea,
    qualified,
    status: !inArea ? "outside-area" : !hasCashflow ? "needs-analysis" : qualified ? "qualified" : "below-cashflow"
  };
}

export function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = candidate.sourceId && candidate.externalId
      ? `${candidate.sourceId}:${candidate.externalId}`
      : `${candidate.city || ""}|${candidate.askingPrice || ""}|${candidate.surfaceM2 || ""}|${candidate.title || ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function rankCandidates(candidates, config = createDefaultRadarConfig()) {
  return dedupeCandidates(candidates).map((candidate) => evaluateCandidate(candidate, config)).sort((a, b) => b.score - a.score);
}
