"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseMoney, money } = require("../src/utils/money");

test("money is parsed and serialized without floating-point storage", () => {
  assert.deepEqual(parseMoney({ currency: "GTQ", amount: "1234.56" }), { currency: "GTQ", minor: 123456 });
  assert.deepEqual(money("USD", 999), { currency: "USD", amount: "9.99" });
});
