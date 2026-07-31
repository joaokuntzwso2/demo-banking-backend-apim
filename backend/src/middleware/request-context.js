"use strict";

const { randomUUID } = require("node:crypto");

function safeHeader(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 128 ? normalized : fallback;
}

function requestContext(req, res, next) {
  const generated = randomUUID();
  req.context = {
    correlationId: safeHeader(req.get("x-correlation-id"), generated),
    fapiInteractionId: safeHeader(req.get("x-fapi-interaction-id"), generated),
    actor: safeHeader(req.get("x-actor-id"), "api-client"),
    startedAt: process.hrtime.bigint()
  };

  res.setHeader("X-Correlation-Id", req.context.correlationId);
  res.setHeader("X-FAPI-Interaction-Id", req.context.fapiInteractionId);
  next();
}

module.exports = { requestContext };
