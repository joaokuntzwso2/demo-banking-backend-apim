"use strict";

const { errors } = require("../errors");

const SUPPORTED_CURRENCIES = new Set(["GTQ", "USD"]);

function assertCurrency(currency) {
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw errors.badRequest(`Unsupported currency '${currency}'. Supported currencies: GTQ, USD`);
  }
}

function parseAmount(amount, fieldName = "amount") {
  if (typeof amount !== "string" || !/^\d{1,12}(\.\d{1,2})?$/.test(amount)) {
    throw errors.badRequest(`${fieldName} must be a positive decimal string with at most two fractional digits`);
  }
  const [whole, fraction = ""] = amount.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    throw errors.badRequest(`${fieldName} must be greater than zero`);
  }
  return minor;
}

function toAmount(minor) {
  if (!Number.isSafeInteger(minor)) {
    throw new TypeError("minor must be a safe integer");
  }
  const sign = minor < 0 ? "-" : "";
  const absolute = Math.abs(minor);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function money(currency, minor) {
  assertCurrency(currency);
  return { currency, amount: toAmount(minor) };
}

function parseMoney(value, fieldName = "money") {
  if (!value || typeof value !== "object") {
    throw errors.badRequest(`${fieldName} must be an object with currency and amount`);
  }
  assertCurrency(value.currency);
  return { currency: value.currency, minor: parseAmount(value.amount, `${fieldName}.amount`) };
}

function convertUsdToGtq(usdMinor, rate) {
  return Math.round(usdMinor * rate);
}

module.exports = {
  SUPPORTED_CURRENCIES,
  assertCurrency,
  parseAmount,
  parseMoney,
  toAmount,
  money,
  convertUsdToGtq
};
