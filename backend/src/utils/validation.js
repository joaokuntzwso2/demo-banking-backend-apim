"use strict";

const { errors } = require("../errors");

function requireObject(value, name = "request body") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw errors.badRequest(`${name} must be a JSON object`);
  }
  return value;
}

function requireFields(object, fields) {
  const missing = fields.filter((field) => object[field] === undefined || object[field] === null || object[field] === "");
  if (missing.length > 0) {
    throw errors.badRequest(`Missing required field(s): ${missing.join(", ")}`);
  }
}

function assertEnum(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw errors.badRequest(`${fieldName} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

function assertString(value, fieldName, { min = 1, max = 200, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || (pattern && !pattern.test(value))) {
    throw errors.badRequest(`${fieldName} is invalid`);
  }
  return value;
}

function assertOptionalString(value, fieldName, options) {
  if (value === undefined) return undefined;
  return assertString(value, fieldName, options);
}


function assertOptionalDate(value, fieldName) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw errors.badRequest(`${fieldName} must use YYYY-MM-DD format`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw errors.badRequest(`${fieldName} must be a valid calendar date`);
  }
  return value;
}

function assertBoolean(value, fieldName) {
  if (typeof value !== "boolean") throw errors.badRequest(`${fieldName} must be boolean`);
  return value;
}

function parseIfMatch(headerValue) {
  if (!headerValue) throw errors.preconditionRequired();
  const match = /^(?:W\/)?"?(\d+)"?$/.exec(headerValue.trim());
  if (!match) throw errors.badRequest("If-Match must contain a numeric entity version");
  return Number(match[1]);
}

function assertVersion(expected, actual) {
  if (expected !== actual) throw errors.preconditionFailed(expected, actual);
}

module.exports = {
  requireObject,
  requireFields,
  assertEnum,
  assertString,
  assertOptionalString,
  assertOptionalDate,
  assertBoolean,
  parseIfMatch,
  assertVersion
};
