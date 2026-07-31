"use strict";

const { errors } = require("../errors");

const TRANSFER_STATUS = Object.freeze({
  PENDING_COMPLIANCE: "PENDING_COMPLIANCE",
  PENDING_APPROVAL: "PENDING_APPROVAL",
  PROCESSING: "PROCESSING",
  SETTLED: "SETTLED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  RETURNED: "RETURNED"
});

const TRANSFER_ACTION = Object.freeze({
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  CANCEL: "CANCEL",
  SETTLE: "SETTLE",
  RETURN: "RETURN"
});

const allowed = Object.freeze({
  [TRANSFER_STATUS.PENDING_APPROVAL]: new Set([
    TRANSFER_ACTION.APPROVE,
    TRANSFER_ACTION.REJECT,
    TRANSFER_ACTION.CANCEL
  ]),
  [TRANSFER_STATUS.PENDING_COMPLIANCE]: new Set([
    TRANSFER_ACTION.REJECT,
    TRANSFER_ACTION.CANCEL
  ]),
  [TRANSFER_STATUS.PROCESSING]: new Set([
    TRANSFER_ACTION.SETTLE,
    TRANSFER_ACTION.REJECT,
    TRANSFER_ACTION.CANCEL
  ]),
  [TRANSFER_STATUS.SETTLED]: new Set([TRANSFER_ACTION.RETURN]),
  [TRANSFER_STATUS.REJECTED]: new Set(),
  [TRANSFER_STATUS.CANCELLED]: new Set(),
  [TRANSFER_STATUS.RETURNED]: new Set()
});

function assertTransferAction(status, action) {
  if (!allowed[status]?.has(action)) {
    throw errors.conflict(
      "INVALID_TRANSFER_TRANSITION",
      `Action '${action}' is not allowed when transfer status is '${status}'`
    );
  }
}

module.exports = { TRANSFER_STATUS, TRANSFER_ACTION, assertTransferAction };
