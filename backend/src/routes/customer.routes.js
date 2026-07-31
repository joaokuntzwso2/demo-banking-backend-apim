"use strict";

const express = require("express");
const { parseIfMatch } = require("../utils/validation");
const { asyncHandler, sendData, sendCollection } = require("../utils/http");

function createCustomerRouter(entityService) {
  const router = express.Router();

  router.get("/:customerId", asyncHandler((req, res) => {
    const customer = entityService.getCustomer(req.params.customerId);
    return sendData(req, res, customer, { etag: customer.version });
  }));

  router.patch("/:customerId", asyncHandler((req, res) => {
    const customer = entityService.patchCustomer(
      req.params.customerId,
      req.body,
      parseIfMatch(req.get("if-match"))
    );
    return sendData(req, res, customer, { etag: customer.version });
  }));

  router.get("/:customerId/accounts", asyncHandler((req, res) => {
    return sendCollection(req, res, entityService.listCustomerAccounts(req.params.customerId));
  }));

  router.get("/:customerId/cards", asyncHandler((req, res) => {
    return sendCollection(req, res, entityService.listCustomerCards(req.params.customerId));
  }));

  router.get("/:customerId/beneficiaries", asyncHandler((req, res) => {
    return sendCollection(req, res, entityService.listBeneficiaries(req.params.customerId));
  }));

  router.post("/:customerId/beneficiaries", asyncHandler((req, res) => {
    const beneficiary = entityService.createBeneficiary(req.params.customerId, req.body);
    return sendData(req, res, beneficiary, { status: 201, etag: beneficiary.version });
  }));

  router.put("/:customerId/beneficiaries/:beneficiaryId", asyncHandler((req, res) => {
    const beneficiary = entityService.replaceBeneficiary(
      req.params.customerId,
      req.params.beneficiaryId,
      req.body,
      parseIfMatch(req.get("if-match"))
    );
    return sendData(req, res, beneficiary, { etag: beneficiary.version });
  }));

  return router;
}

module.exports = { createCustomerRouter };
