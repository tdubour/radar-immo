const pct = (value) => Number(value || 0) / 100;
const clamp = (value, min, max) => Math.min(Math.max(Number(value || 0), min), max);
const divide = (a, b) => (Math.abs(b) > 1e-9 ? a / b : 0);

export function monthlyPayment(principal, annualRatePct, years) {
  principal = Number(principal || 0);
  years = Number(years || 0);
  if (principal <= 0 || years <= 0) return 0;
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = pct(annualRatePct) / 12;
  if (Math.abs(monthlyRate) < 1e-12) return principal / months;
  return principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
}

export function amortizationSchedule(principal, annualRatePct, years) {
  const months = Math.max(1, Math.round(Number(years || 0) * 12));
  const payment = monthlyPayment(principal, annualRatePct, years);
  const monthlyRate = pct(annualRatePct) / 12;
  let balance = Number(principal || 0);
  const rows = [];
  for (let month = 1; month <= months; month += 1) {
    const interest = balance * monthlyRate;
    const principalPaid = Math.min(balance, Math.max(0, payment - interest));
    balance = Math.max(0, balance - principalPaid);
    rows.push({ month, payment, interest, principalPaid, balance });
  }
  return rows;
}

export function acquisitionSummary(project) {
  const a = project.acquisition;
  const notaryFees = a.purchasePrice * pct(a.notaryRatePct);
  const worksContingency = a.works * pct(a.worksContingencyPct);
  const guaranteeFees = a.purchasePrice * pct(a.guaranteeRatePct);
  const totalProjectCost = a.purchasePrice + a.agencyFees + notaryFees + a.works + worksContingency +
    a.furniture + a.brokerFees + a.bankFees + guaranteeFees + a.diagnosticsAndStudies;
  const equity = clamp(project.financing.downPayment, 0, totalProjectCost);
  return {
    purchasePrice: a.purchasePrice,
    notaryFees,
    worksContingency,
    guaranteeFees,
    totalProjectCost,
    equity,
    loanAmount: Math.max(0, totalProjectCost - equity)
  };
}

export function loanSummary(project, acquisition = acquisitionSummary(project)) {
  const principal = acquisition.loanAmount;
  const schedule = amortizationSchedule(principal, project.financing.annualRatePct, project.financing.durationYears);
  const monthlyPrincipalInterest = schedule[0]?.payment ?? 0;
  const monthlyInsurance = principal * pct(project.financing.insuranceRatePct) / 12;
  const firstYearInterest = schedule.slice(0, 12).reduce((sum, row) => sum + row.interest, 0);
  const totalInterest = schedule.reduce((sum, row) => sum + row.interest, 0);
  const totalInsurance = monthlyInsurance * schedule.length;
  return {
    principal,
    monthlyPrincipalInterest,
    monthlyInsurance,
    monthlyDebtService: monthlyPrincipalInterest + monthlyInsurance,
    annualDebtService: (monthlyPrincipalInterest + monthlyInsurance) * 12,
    firstYearInterest,
    totalInterest,
    totalInsurance,
    totalCost: totalInterest + totalInsurance
  };
}

export function corporateTax(profit, threshold, reducedRatePct, normalRatePct) {
  if (profit <= 0) return 0;
  const reducedBase = Math.min(profit, Math.max(0, threshold));
  const normalBase = Math.max(0, profit - reducedBase);
  return reducedBase * pct(reducedRatePct) + normalBase * pct(normalRatePct);
}

export function annualDepreciation(project, acquisition = acquisitionSummary(project)) {
  const a = project.acquisition;
  const s = project.sci;
  const buildingBase = a.purchasePrice * (1 - pct(a.landSharePct));
  const feesBase = acquisition.notaryFees + a.agencyFees + a.bankFees + acquisition.guaranteeFees + a.brokerFees;
  return divide(buildingBase, Math.max(1, s.buildingDepYears)) +
    divide(a.works + acquisition.worksContingency, Math.max(1, s.worksDepYears)) +
    divide(a.furniture, Math.max(1, s.furnitureDepYears)) +
    divide(feesBase, Math.max(1, s.feesDepYears));
}

function scoreRental({ monthlyCashflow, netYield, dscr, safetyMargin, dpe }) {
  const dpeScore = { A: 10, B: 9, C: 8, D: 6, E: 3, F: 0, G: 0, "Non renseigné": 2 }[dpe] ?? 2;
  return clamp(
    clamp((monthlyCashflow + 250) / 750, 0, 1) * 30 +
    clamp(netYield / 0.08, 0, 1.2) * 25 +
    clamp((dscr - 0.75) / 0.65, 0, 1) * 20 +
    clamp(safetyMargin / 0.3, 0, 1) * 15 + dpeScore,
    0, 100
  );
}

function verdict(score) {
  if (score >= 80) return "Prioritaire";
  if (score >= 65) return "Bonne opportunité";
  if (score >= 45) return "À approfondir";
  return "À écarter";
}

function fixedLongTermCharges(project) {
  const x = project.longTerm;
  return x.propertyTaxAnnual + x.coproNonRecoverableAnnual + x.pnoAnnual + x.accountingAnnual +
    x.cfeAnnual + x.ownerUtilitiesAnnual + x.otherAnnual;
}

function longTermCore(project, targetRent = project.longTerm.monthlyRent) {
  const acquisition = acquisitionSummary(project);
  const loan = loanSummary(project, acquisition);
  const depreciation = annualDepreciation(project, acquisition);
  const l = project.longTerm;
  const grossRevenueAnnual = (targetRent + l.monthlyParkingAndAnnexes) * 12;
  const vacancyLoss = grossRevenueAnnual * pct(l.vacancyPct);
  const afterVacancy = grossRevenueAnnual - vacancyLoss;
  const unpaidProvision = afterVacancy * pct(l.unpaidPct);
  const effectiveRevenueAnnual = afterVacancy - unpaidProvision;
  const management = effectiveRevenueAnnual * pct(l.managementPct);
  const gli = effectiveRevenueAnnual * pct(l.gliPct);
  const maintenance = effectiveRevenueAnnual * pct(l.maintenancePct);
  const fixedCharges = fixedLongTermCharges(project);
  const operatingChargesAnnual = management + gli + maintenance + fixedCharges;
  const noiAnnual = effectiveRevenueAnnual - operatingChargesAnnual;
  const taxableResult = noiAnnual - loan.firstYearInterest - loan.monthlyInsurance * 12 - depreciation;
  const tax = corporateTax(taxableResult, project.sci.reducedTaxThreshold, project.sci.reducedTaxRatePct, project.sci.normalTaxRatePct);
  const cashflowBeforeTaxAnnual = noiAnnual - loan.annualDebtService;
  const cashflowAfterTaxAnnual = cashflowBeforeTaxAnnual - tax;
  return {
    strategy: "Longue durée",
    grossRevenueAnnual,
    effectiveRevenueAnnual,
    operatingChargesAnnual,
    noiAnnual,
    debtServiceAnnual: loan.annualDebtService,
    taxableResult,
    corporateTax: tax,
    cashflowBeforeTaxAnnual,
    cashflowAfterTaxAnnual,
    cashflowAfterTaxMonthly: cashflowAfterTaxAnnual / 12,
    grossYield: divide(grossRevenueAnnual, acquisition.totalProjectCost),
    netYield: divide(noiAnnual, acquisition.totalProjectCost),
    returnOnEquity: divide(cashflowAfterTaxAnnual, acquisition.equity),
    dscr: divide(noiAnnual, loan.annualDebtService),
    details: { vacancyLoss, unpaidProvision, management, gli, maintenance, fixedCharges }
  };
}

export function longTermResult(project) {
  const core = longTermCore(project);
  let low = 0;
  let high = Math.max(20000, project.longTerm.monthlyRent * 3);
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (longTermCore(project, mid).cashflowAfterTaxMonthly >= 0) high = mid;
    else low = mid;
  }
  const breakEven = high;
  const safetyMargin = project.longTerm.monthlyRent > 0 ? (project.longTerm.monthlyRent - breakEven) / project.longTerm.monthlyRent : 0;
  const score = scoreRental({ monthlyCashflow: core.cashflowAfterTaxMonthly, netYield: core.netYield, dscr: core.dscr, safetyMargin, dpe: project.dpe });
  return { ...core, breakEven, score, verdict: verdict(score) };
}

function fixedShortTermCharges(project) {
  const l = project.longTerm;
  const s = project.shortTerm;
  return l.propertyTaxAnnual + l.coproNonRecoverableAnnual + l.pnoAnnual + l.accountingAnnual + l.cfeAnnual +
    s.utilitiesAnnual + s.softwareAnnual + s.otherAnnual;
}

function shortTermCore(project, targetOccupancyPct = project.shortTerm.occupancyPct) {
  const acquisition = acquisitionSummary(project);
  const loan = loanSummary(project, acquisition);
  const depreciation = annualDepreciation(project, acquisition);
  const s = project.shortTerm;
  const paidNights = s.availableNights * clamp(pct(targetOccupancyPct), 0, 1) * Math.max(1, s.units);
  const stays = paidNights / Math.max(1, s.averageStayNights);
  const accommodationRevenue = s.adr * paidNights;
  const cleaningRevenue = s.cleaningChargedPerStay * stays;
  const grossRevenueAnnual = accommodationRevenue + cleaningRevenue;
  const platform = grossRevenueAnnual * pct(s.platformPct);
  const concierge = grossRevenueAnnual * pct(s.conciergePct);
  const cleaning = stays * s.cleaningCostPerStay;
  const linen = stays * s.linenCostPerStay;
  const consumables = stays * s.consumablesPerStay;
  const maintenance = accommodationRevenue * pct(s.maintenancePct);
  const fixedCharges = fixedShortTermCharges(project);
  const operatingChargesAnnual = platform + concierge + cleaning + linen + consumables + maintenance + fixedCharges;
  const effectiveRevenueAnnual = grossRevenueAnnual;
  const noiAnnual = effectiveRevenueAnnual - operatingChargesAnnual;
  const taxableResult = noiAnnual - loan.firstYearInterest - loan.monthlyInsurance * 12 - depreciation;
  const tax = corporateTax(taxableResult, project.sci.reducedTaxThreshold, project.sci.reducedTaxRatePct, project.sci.normalTaxRatePct);
  const cashflowBeforeTaxAnnual = noiAnnual - loan.annualDebtService;
  const cashflowAfterTaxAnnual = cashflowBeforeTaxAnnual - tax;
  return {
    strategy: "Courte durée",
    grossRevenueAnnual,
    effectiveRevenueAnnual,
    operatingChargesAnnual,
    noiAnnual,
    debtServiceAnnual: loan.annualDebtService,
    taxableResult,
    corporateTax: tax,
    cashflowBeforeTaxAnnual,
    cashflowAfterTaxAnnual,
    cashflowAfterTaxMonthly: cashflowAfterTaxAnnual / 12,
    grossYield: divide(grossRevenueAnnual, acquisition.totalProjectCost),
    netYield: divide(noiAnnual, acquisition.totalProjectCost),
    returnOnEquity: divide(cashflowAfterTaxAnnual, acquisition.equity),
    dscr: divide(noiAnnual, loan.annualDebtService),
    details: { paidNights, stays, accommodationRevenue, cleaningRevenue, platform, concierge, cleaning, linen, consumables, maintenance, fixedCharges }
  };
}

export function shortTermResult(project) {
  const core = shortTermCore(project);
  let low = 0;
  let high = 100;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (shortTermCore(project, mid).cashflowAfterTaxMonthly >= 0) high = mid;
    else low = mid;
  }
  const breakEven = high;
  const safetyMargin = project.shortTerm.occupancyPct > 0 ? (project.shortTerm.occupancyPct - breakEven) / project.shortTerm.occupancyPct : 0;
  const score = scoreRental({ monthlyCashflow: core.cashflowAfterTaxMonthly, netYield: core.netYield, dscr: core.dscr, safetyMargin, dpe: project.dpe });
  return { ...core, breakEven, score, verdict: verdict(score) };
}

export function flipResult(project) {
  const acquisition = acquisitionSummary(project);
  const loan = loanSummary(project, acquisition);
  const schedule = amortizationSchedule(acquisition.loanAmount, project.financing.annualRatePct, project.financing.durationYears);
  const months = Math.max(0, Math.round(project.flip.holdingMonths));
  const period = schedule.slice(0, months);
  const interest = period.reduce((sum, row) => sum + row.interest, 0);
  const insurance = loan.monthlyInsurance * months;
  const financeCosts = interest + insurance;
  const holdingCosts = project.flip.carryingCostMonthly * months + project.flip.divisionAndLegalFees + project.flip.commercialisationFees + project.flip.otherCosts;
  const netResalePrice = project.flip.resalePrice * (1 - pct(project.flip.resaleNegotiationPct));
  const sellingCosts = netResalePrice * pct(project.flip.sellingAgencyPct);
  const profitBeforeTax = netResalePrice - sellingCosts - acquisition.totalProjectCost - financeCosts - holdingCosts;
  const tax = corporateTax(profitBeforeTax, project.sci.reducedTaxThreshold, project.sci.reducedTaxRatePct, project.sci.normalTaxRatePct);
  const netProfit = profitBeforeTax - tax;
  const debtPaid = period.reduce((sum, row) => sum + row.payment, 0) + insurance;
  const cashInvested = acquisition.equity + debtPaid + holdingCosts;
  const returnOnCash = divide(netProfit, cashInvested);
  const marginOnResale = divide(netProfit, netResalePrice);
  const sellingFactor = Math.max(0.01, 1 - pct(project.flip.sellingAgencyPct));
  const breakEvenNetSale = acquisition.totalProjectCost + financeCosts + holdingCosts;
  const breakEvenResalePrice = breakEvenNetSale / sellingFactor / Math.max(0.01, 1 - pct(project.flip.resaleNegotiationPct));
  const monthlyEquivalent = divide(netProfit, Math.max(1, months));
  const score = clamp(
    clamp(netProfit / 50000, 0, 1.2) * 35 +
    clamp(returnOnCash / 0.25, 0, 1.2) * 30 +
    clamp(marginOnResale / 0.15, 0, 1.2) * 25 +
    clamp((project.flip.resalePrice - breakEvenResalePrice) / Math.max(1, project.flip.resalePrice) / 0.15, 0, 1) * 10,
    0, 100
  );
  return {
    strategy: "Achat-revente",
    grossResalePrice: project.flip.resalePrice,
    netResalePrice,
    sellingCosts,
    financeCosts,
    holdingCosts,
    profitBeforeTax,
    corporateTax: tax,
    netProfit,
    cashInvested,
    returnOnCash,
    marginOnResale,
    breakEvenResalePrice,
    monthlyEquivalent,
    score,
    verdict: verdict(score)
  };
}

export function analyzeProject(project) {
  const acquisition = acquisitionSummary(project);
  return {
    acquisition,
    loan: loanSummary(project, acquisition),
    depreciationAnnual: annualDepreciation(project, acquisition),
    longTerm: longTermResult(project),
    shortTerm: shortTermResult(project),
    flip: flipResult(project)
  };
}

export function scenarioTable(project) {
  const variants = [
    ["Prudent", (p) => {
      p.acquisition.works *= 1.2;
      p.financing.annualRatePct += 2;
      p.longTerm.monthlyRent *= 0.9;
      p.longTerm.vacancyPct = Math.min(40, p.longTerm.vacancyPct + 5);
      p.shortTerm.occupancyPct = Math.max(0, p.shortTerm.occupancyPct - 15);
      p.shortTerm.adr *= 0.9;
      p.flip.resalePrice *= 0.9;
      p.flip.holdingMonths += 4;
    }],
    ["Central", () => {}],
    ["Optimiste", (p) => {
      p.acquisition.works *= 0.95;
      p.financing.annualRatePct = Math.max(0, p.financing.annualRatePct - 0.5);
      p.longTerm.monthlyRent *= 1.08;
      p.longTerm.vacancyPct = Math.max(0, p.longTerm.vacancyPct - 2);
      p.shortTerm.occupancyPct = Math.min(100, p.shortTerm.occupancyPct + 10);
      p.shortTerm.adr *= 1.08;
      p.flip.resalePrice *= 1.08;
      p.flip.holdingMonths = Math.max(1, p.flip.holdingMonths - 2);
    }]
  ];
  return variants.map(([name, mutate]) => {
    const copy = structuredClone(project);
    mutate(copy);
    const result = analyzeProject(copy);
    return { name, longTermMonthly: result.longTerm.cashflowAfterTaxMonthly, shortTermMonthly: result.shortTerm.cashflowAfterTaxMonthly, flipNetProfit: result.flip.netProfit };
  });
}

export function priceSensitivity(project) {
  const center = project.acquisition.purchasePrice;
  return Array.from({ length: 17 }, (_, index) => {
    const copy = structuredClone(project);
    copy.acquisition.purchasePrice = Math.round(center * (0.65 + index * 0.05) / 1000) * 1000;
    const result = analyzeProject(copy);
    return { price: copy.acquisition.purchasePrice, longueDuree: result.longTerm.cashflowAfterTaxMonthly, courteDuree: result.shortTerm.cashflowAfterTaxMonthly };
  });
}

export function rateSensitivity(project) {
  return Array.from({ length: 15 }, (_, index) => {
    const copy = structuredClone(project);
    copy.financing.annualRatePct = 1 + index * 0.5;
    const result = analyzeProject(copy);
    return { rate: copy.financing.annualRatePct, longueDuree: result.longTerm.cashflowAfterTaxMonthly, courteDuree: result.shortTerm.cashflowAfterTaxMonthly };
  });
}

export function occupancySensitivity(project) {
  return Array.from({ length: 18 }, (_, index) => {
    const copy = structuredClone(project);
    copy.shortTerm.occupancyPct = 10 + index * 5;
    return { occupancy: copy.shortTerm.occupancyPct, cashflow: shortTermResult(copy).cashflowAfterTaxMonthly };
  });
}

export function longTermProjection(project) {
  const acquisition = acquisitionSummary(project);
  const loan = loanSummary(project, acquisition);
  const schedule = amortizationSchedule(acquisition.loanAmount, project.financing.annualRatePct, project.financing.durationYears);
  const depreciation = annualDepreciation(project, acquisition);
  const base = longTermResult(project);
  let revenue = base.effectiveRevenueAnnual;
  let charges = base.operatingChargesAnnual;
  let cumulative = 0;
  const rows = [];
  for (let year = 1; year <= project.projection.years; year += 1) {
    const period = schedule.slice((year - 1) * 12, year * 12);
    const interest = period.reduce((sum, row) => sum + row.interest, 0);
    const principalAndInterest = period.reduce((sum, row) => sum + row.payment, 0);
    const insurance = period.length * loan.monthlyInsurance;
    const noi = revenue - charges;
    const tax = corporateTax(noi - interest - insurance - depreciation, project.sci.reducedTaxThreshold, project.sci.reducedTaxRatePct, project.sci.normalTaxRatePct);
    const annualCashflow = noi - principalAndInterest - insurance - tax;
    cumulative += annualCashflow;
    rows.push({
      year,
      revenue,
      charges,
      debtBalance: period.at(-1)?.balance ?? 0,
      annualCashflow,
      cumulativeCashflow: cumulative,
      estimatedValue: project.acquisition.purchasePrice * Math.pow(1 + pct(project.projection.propertyGrowthPct), year)
    });
    revenue *= 1 + pct(project.projection.rentGrowthPct);
    charges *= 1 + pct(project.projection.chargesInflationPct);
  }
  return rows;
}

export function findCrossing(rows, xKey, yKey) {
  for (let i = 1; i < rows.length; i += 1) {
    const y0 = rows[i - 1][yKey];
    const y1 = rows[i][yKey];
    if ((y0 <= 0 && y1 >= 0) || (y0 >= 0 && y1 <= 0)) {
      const x0 = rows[i - 1][xKey];
      const x1 = rows[i][xKey];
      const fraction = Math.abs(y1 - y0) < 1e-9 ? 0 : (0 - y0) / (y1 - y0);
      return x0 + (x1 - x0) * fraction;
    }
  }
  return null;
}
