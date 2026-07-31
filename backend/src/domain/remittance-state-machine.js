"use strict";

const { errors } = require("../errors");

const REMITTANCE_STATUS = Object.freeze({
  PENDING_COMPLIANCE: "PENDING_COMPLIANCE",
  READY_FOR_PAYOUT: "READY_FOR_PAYOUT",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  REJECTED: "REJECTED"
});

const REMITTANCE_ACTION = Object.freeze({
  PAYOUT: "PAYOUT",
  CANCEL: "CANCEL",
  REJECT: "REJECT"
});

const allowed = Object.freeze({
  [REMITTANCE_STATUS.PENDING_COMPLIANCE]: new Set([
    REMITTANCE_ACTION.CANCEL,
    REMITTANCE_ACTION.REJECT
  ]),
  [REMITTANCE_STATUS.READY_FOR_PAYOUT]: new Set([
    REMITTANCE_ACTION.PAYOUT,
    REMITTANCE_ACTION.CANCEL,
    REMITTANCE_ACTION.REJECT
  ]),
  [REMITTANCE_STATUS.PAID]: new Set(),
  [REMITTANCE_STATUS.CANCELLED]: new Set(),
  [REMITTANCE_STATUS.REJECTED]: new Set()
});

function assertRemittanceAction(status, action) {
  if (!allowed[status]?.has(action)) {
    throw errors.conflict(
      "INVALID_REMITTANCE_TRANSITION",
      `Action '${action}' is not allowed when remittance status is '${status}'`
    );
  }
}

module.exports = { REMITTANCE_STATUS, REMITTANCE_ACTION, assertRemittanceAction };
