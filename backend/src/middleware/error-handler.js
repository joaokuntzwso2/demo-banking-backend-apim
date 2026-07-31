"use strict";

const { AppError } = require("../errors");

function notFoundHandler(req, _res, next) {
  next(new AppError({
    status: 404,
    code: "ROUTE_NOT_FOUND",
    title: "Route not found",
    detail: `No route matches ${req.method} ${req.originalUrl}`
  }));
}

function errorHandler(error, req, res, _next) {
  let normalized = error;
  if (!(error instanceof AppError) && error?.type === "entity.parse.failed") {
    normalized = new AppError({ status: 400, code: "INVALID_JSON", title: "Invalid JSON", detail: "The request body is not valid JSON" });
  } else if (!(error instanceof AppError) && error?.type === "entity.too.large") {
    normalized = new AppError({ status: 413, code: "PAYLOAD_TOO_LARGE", title: "Payload too large", detail: "The request body exceeds the configured size limit" });
  }
  const known = normalized instanceof AppError;
  const status = known ? normalized.status : 500;
  const problem = {
    type: `https://demo-bank.example.gt/problems/${known ? normalized.code.toLowerCase() : "internal-error"}`,
    title: known ? normalized.title : "Internal server error",
    status,
    detail: known ? normalized.detail : "An unexpected error occurred",
    instance: req.originalUrl,
    code: known ? normalized.code : "INTERNAL_ERROR",
    correlationId: req.context?.correlationId
  };
  if (known && normalized.errors) problem.errors = normalized.errors;
  if (known && normalized.headers) {
    for (const [name, value] of Object.entries(normalized.headers)) res.setHeader(name, value);
  }
  if (!known) {
    process.stderr.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      message: "unhandled_error",
      correlationId: req.context?.correlationId,
      error: error.stack || String(error)
    })}\n`);
  }
  res.status(status).type("application/problem+json").json(problem);
}

module.exports = { notFoundHandler, errorHandler };
