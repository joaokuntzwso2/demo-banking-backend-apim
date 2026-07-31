"use strict";

function positiveNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

const config = Object.freeze({
  serviceName: "banking-backend",
  serviceVersion: "1.3.0",
  port: positiveNumber("PORT", 8080),
  demoPolicy: Object.freeze({
    makerCheckerThresholdGtq: positiveNumber("MAKER_CHECKER_THRESHOLD_GTQ", 25000),
    amlReviewThresholdGtq: positiveNumber("AML_REVIEW_THRESHOLD_GTQ", 50000),
    beneficiaryCoolingHours: positiveNumber("BENEFICIARY_COOLING_HOURS", 24),
    remittanceReviewThresholdUsd: positiveNumber("REMITTANCE_REVIEW_THRESHOLD_USD", 2000),
    quoteTtlMinutes: positiveNumber("REMITTANCE_QUOTE_TTL_MINUTES", 10),
    usdToGtqRate: positiveNumber("USD_TO_GTQ_RATE", 7.75),
    remittanceFeeUsd: positiveNumber("REMITTANCE_FEE_USD", 4.99)
  })
});

module.exports = { config };
