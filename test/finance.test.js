import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProject } from "../src/defaults.js";
import {
  acquisitionSummary,
  amortizationSchedule,
  analyzeProject,
  corporateTax,
  monthlyPayment,
  scenarioTable
} from "../src/finance.js";

test("monthlyPayment calculates a standard amortizing loan", () => {
  const payment = monthlyPayment(100000, 4, 20);
  assert.ok(Math.abs(payment - 605.98) < 0.02);
});

test("zero-rate loan divides principal by months", () => {
  assert.equal(monthlyPayment(120000, 0, 10), 1000);
});

test("amortization schedule finishes close to zero", () => {
  const schedule = amortizationSchedule(225500, 4.2, 20);
  assert.equal(schedule.length, 240);
  assert.ok(schedule.at(-1).balance < 0.01);
  assert.ok(schedule[0].interest > schedule.at(-1).interest);
});

test("new project starts without example acquisition data", () => {
  const project = createDefaultProject();
  const acquisition = acquisitionSummary(project);
  assert.equal(project.acquisition.guaranteeRatePct, 0);
  assert.equal(acquisition.notaryFees, 0);
  assert.equal(acquisition.worksContingency, 0);
  assert.equal(acquisition.guaranteeFees, 0);
  assert.equal(acquisition.totalProjectCost, 0);
  assert.equal(acquisition.loanAmount, 0);
});

test("corporateTax applies reduced and normal bands", () => {
  assert.equal(corporateTax(-100, 42500, 15, 25), 0);
  assert.equal(corporateTax(40000, 42500, 15, 25), 6000);
  assert.equal(corporateTax(50000, 42500, 15, 25), 8250);
});

test("analysis returns finite values for all three strategies", () => {
  const result = analyzeProject(createDefaultProject());
  for (const value of [
    result.loan.monthlyDebtService,
    result.longTerm.cashflowAfterTaxMonthly,
    result.shortTerm.cashflowAfterTaxMonthly,
    result.flip.netProfit
  ]) assert.ok(Number.isFinite(value));
  assert.ok(result.longTerm.score >= 0 && result.longTerm.score <= 100);
  assert.ok(result.shortTerm.breakEven >= 0 && result.shortTerm.breakEven <= 100);
});

test("prudent scenario is less favorable than central on a populated project", () => {
  const project = createDefaultProject();
  project.acquisition.purchasePrice = 180000;
  project.acquisition.works = 35000;
  project.financing.downPayment = 20000;
  project.longTerm.monthlyRent = 2200;
  project.shortTerm.adr = 70;
  project.shortTerm.occupancyPct = 55;
  project.flip.resalePrice = 290000;
  const scenarios = scenarioTable(project);
  const prudent = scenarios.find((row) => row.name === "Prudent");
  const central = scenarios.find((row) => row.name === "Central");
  assert.ok(prudent.longTermMonthly < central.longTermMonthly);
  assert.ok(prudent.shortTermMonthly < central.shortTermMonthly);
  assert.ok(prudent.flipNetProfit < central.flipNetProfit);
});
