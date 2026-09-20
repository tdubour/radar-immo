export function createDefaultProject() {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    name: "Nouveau projet",
    city: "",
    sourceUrl: "",
    dpe: "D",
    acquisition: {
      purchasePrice: 0,
      surfaceM2: 0,
      agencyFees: 0,
      notaryRatePct: 8,
      works: 0,
      worksContingencyPct: 10,
      furniture: 0,
      brokerFees: 0,
      bankFees: 0,
      guaranteeRatePct: 0,
      diagnosticsAndStudies: 0,
      landSharePct: 15
    },
    financing: {
      downPayment: 1500,
      durationYears: 25,
      annualRatePct: 4.2,
      insuranceRatePct: 0.3,
      deferredMonths: 0
    },
    longTerm: {
      monthlyRent: 0,
      monthlyParkingAndAnnexes: 0,
      rentDeferralMonths: 0,
      vacancyMonths: 1,
      vacancyPct: 0,
      unpaidPct: 1,
      managementPct: 0,
      gliPct: 0,
      maintenancePct: 5,
      propertyTaxAnnual: 0,
      coproNonRecoverableAnnual: 0,
      pnoAnnual: 0,
      accountingMode: "internal",
      accountingAnnual: 0,
      cfeAnnual: 0,
      ownerUtilitiesAnnual: 0,
      otherAnnual: 0
    },
    shortTerm: {
      units: 1,
      adr: 0,
      occupancyPct: 0,
      availableNights: 330,
      averageStayNights: 3,
      platformPct: 15,
      conciergePct: 20,
      cleaningChargedPerStay: 45,
      cleaningCostPerStay: 45,
      linenCostPerStay: 14,
      consumablesPerStay: 7,
      maintenancePct: 5,
      utilitiesAnnual: 0,
      softwareAnnual: 0,
      otherAnnual: 0
    },
    flip: {
      resalePrice: 0,
      resaleNegotiationPct: 3,
      sellingAgencyPct: 5,
      holdingMonths: 10,
      carryingCostMonthly: 350,
      divisionAndLegalFees: 3000,
      commercialisationFees: 1000,
      otherCosts: 1000
    },
    sci: {
      reducedTaxThreshold: 42500,
      reducedTaxRatePct: 15,
      normalTaxRatePct: 25,
      buildingDepYears: 35,
      worksDepYears: 15,
      furnitureDepYears: 7,
      feesDepYears: 5
    },
    projection: {
      years: 25,
      rentGrowthPct: 1.5,
      chargesInflationPct: 2,
      propertyGrowthPct: 1.5
    }
  };
}
