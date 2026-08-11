export function createDefaultProject() {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}`,
    name: "Immeuble ancien — exemple",
    city: "Vierzon",
    sourceUrl: "",
    dpe: "D",
    acquisition: {
      purchasePrice: 180000,
      agencyFees: 0,
      notaryRatePct: 8,
      works: 35000,
      worksContingencyPct: 10,
      furniture: 8000,
      brokerFees: 0,
      bankFees: 900,
      guaranteeRatePct: 1.5,
      diagnosticsAndStudies: 1000,
      landSharePct: 15
    },
    financing: {
      downPayment: 20000,
      durationYears: 20,
      annualRatePct: 4.2,
      insuranceRatePct: 0.3,
      deferredMonths: 0
    },
    longTerm: {
      monthlyRent: 2200,
      monthlyParkingAndAnnexes: 0,
      vacancyPct: 5,
      unpaidPct: 1,
      managementPct: 0,
      gliPct: 0,
      maintenancePct: 5,
      propertyTaxAnnual: 2500,
      coproNonRecoverableAnnual: 0,
      pnoAnnual: 450,
      accountingAnnual: 1200,
      cfeAnnual: 300,
      ownerUtilitiesAnnual: 600,
      otherAnnual: 300
    },
    shortTerm: {
      units: 4,
      adr: 70,
      occupancyPct: 55,
      availableNights: 330,
      averageStayNights: 3,
      platformPct: 15,
      conciergePct: 20,
      cleaningChargedPerStay: 45,
      cleaningCostPerStay: 45,
      linenCostPerStay: 14,
      consumablesPerStay: 7,
      maintenancePct: 5,
      utilitiesAnnual: 5400,
      softwareAnnual: 480,
      otherAnnual: 600
    },
    flip: {
      resalePrice: 290000,
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
      years: 20,
      rentGrowthPct: 1.5,
      chargesInflationPct: 2,
      propertyGrowthPct: 1.5
    }
  };
}
