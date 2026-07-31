"use strict";

class AppError extends Error {
  constructor({ status, code, title, detail, errors, headers }) {
    super(detail || title);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail || title;
    this.errors = errors;
    this.headers = headers;
    Error.captureStackTrace?.(this, AppError);
  }
}

function problem(status, code, title, detail, options = {}) {
  return new AppError({ status, code, title, detail, ...options });
}

const errors = Object.freeze({
  badRequest: (detail, validationErrors) =>
    problem(400, "BAD_REQUEST", "Invalid request", detail, { errors: validationErrors }),
  unauthorized: (detail = "Authentication is required") =>
    problem(401, "UNAUTHORIZED", "Unauthorized", detail),
  forbidden: (detail) => problem(403, "FORBIDDEN", "Forbidden", detail),
  notFound: (resource, id) =>
    problem(404, "NOT_FOUND", `${resource} not found`, `${resource} '${id}' does not exist`),
  conflict: (code, detail) => problem(409, code, "Conflict", detail),
  preconditionRequired: () =>
    problem(428, "IF_MATCH_REQUIRED", "Precondition required", "The If-Match header is required"),
  preconditionFailed: (expected, actual) =>
    problem(412, "VERSION_MISMATCH", "Precondition failed", `Expected version ${expected}, current version is ${actual}`),
  unprocessable: (code, detail) => problem(422, code, "Business rule violation", detail)
});

module.exports = { AppError, errors };
