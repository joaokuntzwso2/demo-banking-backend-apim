"use strict";

const express = require("express");
const { config } = require("../config");

function createHealthRouter(repository) {
  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({
      status: "UP",
      service: config.serviceName,
      version: config.serviceVersion,
      storage: "in-memory",
      snapshot: repository.snapshot(),
      timestamp: new Date().toISOString()
    });
  });
  return router;
}

module.exports = { createHealthRouter };
