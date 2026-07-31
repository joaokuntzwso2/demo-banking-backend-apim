"use strict";

const express = require("express");
const { parseIfMatch } = require("../utils/validation");
const { asyncHandler, sendData, sendCollection } = require("../utils/http");

function createAccountRouter(entityService) {
  const router = express.Router();

  router.get("/:accountId", asyncHandler((req, res) => {
    const account = entityService.getAccount(req.params.accountId);
    return sendData(req, res, account, { etag: account.version });
  }));

  router.get("/:accountId/transactions", asyncHandler((req, res) => {
    return sendCollection(
      req,
      res,
      entityService.listAccountTransactions(req.params.accountId, req.query.limit)
    );
  }));

  router.patch("/:accountId/limits", asyncHandler((req, res) => {
    const account = entityService.patchAccountLimits(
      req.params.accountId,
      req.body,
      parseIfMatch(req.get("if-match"))
    );
    return sendData(req, res, account, { etag: account.version });
  }));

  return router;
}

module.exports = { createAccountRouter };
