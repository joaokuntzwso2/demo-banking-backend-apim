"use strict";

function requestLogger(req, res, next) {
  res.on("finish", () => {
    const elapsedNs = process.hrtime.bigint() - req.context.startedAt;
    const log = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      message: "http_request",
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Number(elapsedNs) / 1_000_000,
      correlationId: req.context.correlationId,
      fapiInteractionId: req.context.fapiInteractionId,
      actor: req.context.actor
    };
    process.stdout.write(`${JSON.stringify(log)}\n`);
  });
  next();
}

module.exports = { requestLogger };
