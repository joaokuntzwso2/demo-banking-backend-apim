"use strict";

const express = require("express");
const { parseIfMatch } = require("../utils/validation");
const { asyncHandler, sendData, sendCollection } = require("../utils/http");

function createRemittanceRouter(remittanceService) {
  const router = express.Router();

  router.post("/quotes", asyncHandler((req, res) => {
    const quote = remittanceService.createQuote(req.body);
    return sendData(req, res, quote, { status: 201 });
  }));

  router.post("/", asyncHandler((req, res) => {
    const result = remittanceService.create(req.body, req.get("idempotency-key"), req.context.actor);
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    return sendData(req, res, result.remittance, {
      status: result.replayed ? 200 : 201,
      etag: result.remittance.version,
      extraMeta: { replayed: result.replayed }
    });
  }));

  router.get("/", asyncHandler((req, res) => {
    return sendCollection(req, res, remittanceService.list({
      customerId: req.query.customerId,
      status: req.query.status,
      limit: req.query.limit
    }));
  }));

  router.get("/:remittanceId", asyncHandler((req, res) => {
    const remittance = remittanceService.get(req.params.remittanceId);
    return sendData(req, res, remittance, { etag: remittance.version });
  }));

  router.patch("/:remittanceId", asyncHandler((req, res) => {
    const remittance = remittanceService.applyAction(
      req.params.remittanceId,
      req.body,
      parseIfMatch(req.get("if-match")),
      req.context.actor
    );
    return sendData(req, res, remittance, { etag: remittance.version });
  }));

  return router;
}

module.exports = { createRemittanceRouter };
