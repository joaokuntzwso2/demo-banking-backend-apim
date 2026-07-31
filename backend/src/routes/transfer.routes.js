"use strict";

const express = require("express");
const { parseIfMatch } = require("../utils/validation");
const { asyncHandler, sendData, sendCollection } = require("../utils/http");

function createTransferRouter(transferService) {
  const router = express.Router();

  router.post("/", asyncHandler((req, res) => {
    const result = transferService.create(req.body, req.get("idempotency-key"), req.context.actor);
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    return sendData(req, res, result.transfer, {
      status: result.replayed ? 200 : 201,
      etag: result.transfer.version,
      extraMeta: { replayed: result.replayed }
    });
  }));

  router.get("/", asyncHandler((req, res) => {
    return sendCollection(req, res, transferService.list({
      accountId: req.query.accountId,
      status: req.query.status,
      limit: req.query.limit
    }));
  }));

  router.get("/:transferId", asyncHandler((req, res) => {
    const transfer = transferService.get(req.params.transferId);
    return sendData(req, res, transfer, { etag: transfer.version });
  }));

  router.patch("/:transferId", asyncHandler((req, res) => {
    const transfer = transferService.applyAction(
      req.params.transferId,
      req.body,
      parseIfMatch(req.get("if-match")),
      req.context.actor
    );
    return sendData(req, res, transfer, { etag: transfer.version });
  }));

  return router;
}

module.exports = { createTransferRouter };
