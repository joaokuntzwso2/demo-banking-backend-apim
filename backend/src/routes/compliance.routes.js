"use strict";

const express = require("express");
const { parseIfMatch } = require("../utils/validation");
const { asyncHandler, sendData, sendCollection } = require("../utils/http");

function createComplianceRouter(complianceService) {
  const router = express.Router();

  router.post("/cases", asyncHandler((req, res) => {
    const complianceCase = complianceService.create(req.body, req.context.actor);
    return sendData(req, res, complianceCase, { status: 201, etag: complianceCase.version });
  }));

  router.get("/cases", asyncHandler((req, res) => {
    return sendCollection(req, res, complianceService.list({
      status: req.query.status,
      customerId: req.query.customerId,
      limit: req.query.limit
    }));
  }));

  router.get("/cases/:caseId", asyncHandler((req, res) => {
    const complianceCase = complianceService.get(req.params.caseId);
    return sendData(req, res, complianceCase, { etag: complianceCase.version });
  }));

  router.patch("/cases/:caseId", asyncHandler((req, res) => {
    const complianceCase = complianceService.patch(
      req.params.caseId,
      req.body,
      parseIfMatch(req.get("if-match")),
      req.context.actor
    );
    return sendData(req, res, complianceCase, { etag: complianceCase.version });
  }));

  return router;
}

module.exports = { createComplianceRouter };
