"use strict";

const crypto = require("node:crypto");
const { errors } = require("../errors");

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function requireIdempotencyKey(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{8,100}$/.test(value)) {
    throw errors.badRequest(
      "Idempotency-Key is required and must contain 8-100 letters, numbers, dots, underscores, colons, or hyphens"
    );
  }
  return value;
}

function replayOrConflict(repository, scope, key, requestFingerprint) {
  const existing = repository.getIdempotent(scope, key);
  if (!existing) return null;
  if (existing.fingerprint !== requestFingerprint) {
    throw errors.conflict(
      "IDEMPOTENCY_KEY_REUSED",
      "The Idempotency-Key was already used with a different request payload"
    );
  }
  return structuredClone(existing.response);
}

module.exports = { fingerprint, requireIdempotencyKey, replayOrConflict };
