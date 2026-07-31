"use strict";

const { money } = require("./money");

function customer(customer) {
  return structuredClone(customer);
}

function account(value) {
  return {
    accountId: value.accountId,
    customerId: value.customerId,
    productType: value.productType,
    currency: value.currency,
    standardizedAccountMasked: value.standardizedAccountMasked,
    ledgerBalance: money(value.currency, value.ledgerBalanceMinor),
    availableBalance: money(value.currency, value.availableBalanceMinor),
    status: value.status,
    limits: {
      dailyTransferLimit: money(value.currency, value.limits.dailyTransferLimitMinor),
      dailyCashWithdrawalLimit: money(value.currency, value.limits.dailyCashWithdrawalLimitMinor)
    },
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

function beneficiary(value) {
  return structuredClone(value);
}

function card(value) {
  return structuredClone(value);
}

function transfer(value) {
  return {
    transferId: value.transferId,
    debtorAccountId: value.debtorAccountId,
    customerId: value.customerId,
    beneficiaryId: value.beneficiaryId,
    rail: value.rail,
    amount: money(value.currency, value.amountMinor),
    purposeCode: value.purposeCode,
    reference: value.reference,
    requestedExecutionDate: value.requestedExecutionDate,
    status: value.status,
    approvalRequired: value.approvalRequired,
    approvedBy: value.approvedBy,
    complianceCaseId: value.complianceCaseId,
    holdId: value.holdId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    settledAt: value.settledAt,
    returnedAt: value.returnedAt,
    rejectionReason: value.rejectionReason,
    version: value.version
  };
}

function ledgerEntry(value) {
  return {
    entryId: value.entryId,
    accountId: value.accountId,
    type: value.type,
    amount: money(value.currency, value.amountMinor),
    description: value.description,
    referenceId: value.referenceId,
    bookedAt: value.bookedAt
  };
}

function remittanceQuote(value) {
  return {
    quoteId: value.quoteId,
    senderCountry: value.senderCountry,
    sourceAmount: money("USD", value.sourceAmountMinor),
    fee: money("USD", value.feeMinor),
    exchangeRate: value.exchangeRate.toFixed(4),
    payoutAmount: money("GTQ", value.payoutAmountMinor),
    payoutMethod: value.payoutMethod,
    destinationAccountId: value.destinationAccountId,
    expiresAt: value.expiresAt,
    createdAt: value.createdAt
  };
}

function remittance(value) {
  return {
    remittanceId: value.remittanceId,
    quoteId: value.quoteId,
    externalReference: value.externalReference,
    sender: structuredClone(value.sender),
    beneficiaryCustomerId: value.beneficiaryCustomerId,
    destinationAccountId: value.destinationAccountId,
    sourceAmount: money("USD", value.sourceAmountMinor),
    payoutAmount: money("GTQ", value.payoutAmountMinor),
    status: value.status,
    complianceCaseId: value.complianceCaseId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    paidAt: value.paidAt,
    version: value.version
  };
}

function complianceCase(value) {
  return structuredClone(value);
}

module.exports = {
  customer,
  account,
  beneficiary,
  card,
  transfer,
  ledgerEntry,
  remittanceQuote,
  remittance,
  complianceCase
};
