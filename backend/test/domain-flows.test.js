"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createContainer } = require("../src/container");

function transferPayload(overrides = {}) {
  return {
    debtorAccountId: "ACC-GTQ-001",
    beneficiaryId: "BEN-GT-002",
    rail: "INTERNAL",
    amount: { currency: "GTQ", amount: "150.00" },
    purposeCode: "FAMILY_SUPPORT",
    reference: "Demo transfer",
    ...overrides
  };
}

test("internal transfer settles atomically and creates both ledger entries", () => {
  const { repository, transferService } = createContainer();
  const sourceBefore = repository.state.accounts["ACC-GTQ-001"].ledgerBalanceMinor;
  const targetBefore = repository.state.accounts["ACC-GTQ-002"].ledgerBalanceMinor;

  const result = transferService.create(transferPayload(), "internal-transfer-001", "maker.ana");

  assert.equal(result.transfer.status, "SETTLED");
  assert.equal(repository.state.accounts["ACC-GTQ-001"].ledgerBalanceMinor, sourceBefore - 15000);
  assert.equal(repository.state.accounts["ACC-GTQ-002"].ledgerBalanceMinor, targetBefore + 15000);
  assert.equal(Object.keys(repository.state.holds).length, 0);
  assert.equal(repository.state.ledgerEntries.filter((entry) => entry.referenceId === result.transfer.transferId).length, 2);
});

test("idempotency replays the same transfer and rejects a different payload", () => {
  const { transferService } = createContainer();
  const first = transferService.create(transferPayload(), "idempotency-key-001");
  const replay = transferService.create(transferPayload(), "idempotency-key-001");

  assert.equal(replay.replayed, true);
  assert.equal(replay.transfer.transferId, first.transfer.transferId);
  assert.throws(
    () => transferService.create(transferPayload({ amount: { currency: "GTQ", amount: "151.00" } }), "idempotency-key-001"),
    (error) => error.code === "IDEMPOTENCY_KEY_REUSED"
  );
});

test("high-value domestic transfer follows compliance, approval, and settlement stages", () => {
  const { repository, transferService, complianceService } = createContainer();
  const created = transferService.create(
    transferPayload({
      debtorAccountId: "ACC-GTQ-003",
      beneficiaryId: "BEN-GT-005",
      rail: "CCA",
      amount: { currency: "GTQ", amount: "60000.00" },
      purposeCode: "SUPPLIER_PAYMENT"
    }),
    "high-value-cca-001"
  ).transfer;

  assert.equal(created.status, "PENDING_COMPLIANCE");
  assert.equal(created.approvalRequired, true);
  assert.ok(created.complianceCaseId);
  assert.equal(Object.keys(repository.state.holds).length, 1);

  const caseBefore = complianceService.get(created.complianceCaseId);
  const resolved = complianceService.patch(
    created.complianceCaseId,
    { action: "RESOLVE", disposition: "CLEARED", note: "Demo source-of-funds evidence accepted" },
    caseBefore.version,
    "aml.analyst"
  );
  assert.equal(resolved.status, "RESOLVED");

  const afterCompliance = transferService.get(created.transferId);
  assert.equal(afterCompliance.status, "PENDING_APPROVAL");

  const approved = transferService.applyAction(
    created.transferId,
    { action: "APPROVE", actor: "supervisor.maria" },
    afterCompliance.version,
    "supervisor.maria"
  );
  assert.equal(approved.status, "PROCESSING");

  const settled = transferService.applyAction(
    created.transferId,
    { action: "SETTLE" },
    approved.version,
    "settlement.adapter"
  );
  assert.equal(settled.status, "SETTLED");
  assert.equal(Object.keys(repository.state.holds).length, 0);
});

test("stale If-Match-style version fails a transfer action", () => {
  const { transferService } = createContainer();
  const created = transferService.create(
    transferPayload({ beneficiaryId: "BEN-GT-001", rail: "CCA" }),
    "stale-version-001"
  ).transfer;

  assert.throws(
    () => transferService.applyAction(created.transferId, { action: "SETTLE" }, created.version + 1),
    (error) => error.code === "VERSION_MISMATCH" && error.status === 412
  );
});

test("incoming remittance quote is consumed once and payout credits the beneficiary account", () => {
  const { repository, remittanceService } = createContainer();
  const before = repository.state.accounts["ACC-GTQ-001"].ledgerBalanceMinor;
  const quote = remittanceService.createQuote({
    senderCountry: "US",
    sourceAmount: { currency: "USD", amount: "350.00" },
    payoutMethod: "ACCOUNT_CREDIT",
    destinationAccountId: "ACC-GTQ-001"
  });

  const created = remittanceService.create({
    quoteId: quote.quoteId,
    externalReference: "MTO-TEST-0001",
    sender: { name: "Luis Herrera", country: "US", relationship: "Hermano" },
    beneficiaryCustomerId: "CUS-GT-001"
  }, "remittance-001").remittance;

  assert.equal(created.status, "READY_FOR_PAYOUT");
  const paid = remittanceService.applyAction(created.remittanceId, { action: "PAYOUT" }, created.version, "branch.teller");
  assert.equal(paid.status, "PAID");
  assert.equal(
    repository.state.accounts["ACC-GTQ-001"].ledgerBalanceMinor,
    before + Number(paid.payoutAmount.amount.replace(".", ""))
  );
});

test("SIPA demo transfer supports a regional USD beneficiary", () => {
  const { transferService } = createContainer();
  const created = transferService.create({
    debtorAccountId: "ACC-USD-001",
    beneficiaryId: "BEN-GT-004",
    rail: "SIPA",
    amount: { currency: "USD", amount: "200.00" },
    purposeCode: "SUPPLIER_PAYMENT",
    reference: "Regional demo payment"
  }, "sipa-transfer-001").transfer;

  assert.equal(created.rail, "SIPA");
  assert.equal(created.status, "PROCESSING");
});

test("account limits and card controls use optimistic concurrency", () => {
  const { entityService } = createContainer();
  const account = entityService.getAccount("ACC-GTQ-001");
  const updatedAccount = entityService.patchAccountLimits(
    account.accountId,
    { dailyTransferLimit: { currency: "GTQ", amount: "85000.00" } },
    account.version
  );
  assert.equal(updatedAccount.limits.dailyTransferLimit.amount, "85000.00");
  assert.throws(
    () => entityService.patchAccountLimits(account.accountId, { dailyTransferLimit: { currency: "GTQ", amount: "90000.00" } }, account.version),
    (error) => error.code === "VERSION_MISMATCH"
  );

  const card = entityService.getCard("CARD-GT-001");
  const updatedCard = entityService.patchCard(card.cardId, { controls: { ecommerceEnabled: false } }, card.version);
  assert.equal(updatedCard.controls.ecommerceEnabled, false);
});

test("PUT-style beneficiary replacement resets verification and increments version", () => {
  const { entityService } = createContainer();
  const current = entityService.listBeneficiaries("CUS-GT-001").find((item) => item.beneficiaryId === "BEN-GT-001");
  const replaced = entityService.replaceBeneficiary("CUS-GT-001", "BEN-GT-001", {
    type: "DOMESTIC_EXTERNAL",
    name: "Servicios Educativos Actualizados",
    bankCode: "DEMO-02",
    bankName: "Banco Regional Demo",
    country: "GT",
    currency: "GTQ",
    accountNumberMasked: "**** **** **** 9911",
    alias: "Colegio"
  }, current.version);

  assert.equal(replaced.version, current.version + 1);
  assert.equal(replaced.verificationStatus, "PENDING_VERIFICATION");
  assert.equal(replaced.name, "Servicios Educativos Actualizados");
});

test("cancelling a transfer under compliance releases funds and closes the linked case", () => {
  const { repository, transferService, complianceService } = createContainer();
  const availableBefore = repository.state.accounts["ACC-GTQ-003"].availableBalanceMinor;
  const created = transferService.create({
    debtorAccountId: "ACC-GTQ-003",
    beneficiaryId: "BEN-GT-005",
    rail: "CCA",
    amount: { currency: "GTQ", amount: "60000.00" },
    purposeCode: "SUPPLIER_PAYMENT"
  }, "cancel-compliance-001").transfer;

  const cancelled = transferService.applyAction(created.transferId, { action: "CANCEL", reason: "Customer withdrew instruction" }, created.version, "operations.user");
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(repository.state.accounts["ACC-GTQ-003"].availableBalanceMinor, availableBefore);
  const linkedCase = complianceService.get(created.complianceCaseId);
  assert.equal(linkedCase.status, "RESOLVED");
  assert.equal(linkedCase.disposition, "REJECTED");
});
