"use strict";

const crypto = require("node:crypto");

function createId(prefix) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

module.exports = { createId };
