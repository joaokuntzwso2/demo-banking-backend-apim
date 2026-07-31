"use strict";

const express = require("express");
const { parseIfMatch } = require("../utils/validation");
const { asyncHandler, sendData } = require("../utils/http");

function createCardRouter(entityService) {
  const router = express.Router();

  router.get("/:cardId", asyncHandler((req, res) => {
    const card = entityService.getCard(req.params.cardId);
    return sendData(req, res, card, { etag: card.version });
  }));

  router.patch("/:cardId", asyncHandler((req, res) => {
    const card = entityService.patchCard(
      req.params.cardId,
      req.body,
      parseIfMatch(req.get("if-match"))
    );
    return sendData(req, res, card, { etag: card.version });
  }));

  return router;
}

module.exports = { createCardRouter };
