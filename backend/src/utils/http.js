"use strict";

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function metadata(req, extra = {}) {
  return {
    correlationId: req.context.correlationId,
    fapiInteractionId: req.context.fapiInteractionId,
    ...extra
  };
}

function sendData(req, res, data, { status = 200, etag, extraMeta } = {}) {
  if (etag !== undefined) res.setHeader("ETag", `"${etag}"`);
  return res.status(status).json({ data, meta: metadata(req, extraMeta) });
}

function sendCollection(req, res, data, { extraMeta } = {}) {
  return res.json({ data, meta: metadata(req, { count: data.length, ...extraMeta }) });
}

module.exports = { asyncHandler, sendData, sendCollection };
