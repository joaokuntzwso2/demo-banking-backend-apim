"use strict";

const express = require("express");
const { asyncHandler, sendData } = require("../utils/http");

function createAdminRouter(repository) {
  const router = express.Router();

  router.get("/snapshot", asyncHandler((req, res) => {
    return sendData(req, res, repository.snapshot());
  }));

  router.post("/reset", asyncHandler((req, res) => {
    repository.reset();
    return sendData(req, res, { reset: true, snapshot: repository.snapshot() });
  }));

  return router;
}

module.exports = { createAdminRouter };
