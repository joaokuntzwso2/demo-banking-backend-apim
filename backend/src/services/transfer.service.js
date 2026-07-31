"use strict";

const { config } = require("../config");
const { errors } = require("../errors");
const { createId } = require("../utils/id");
const { nowIso, hoursSince, todayUtc } = require("../utils/time");
const { parseMoney, money } = require("../utils/money");
const {
  requireObject,
  requireFields,
  assertEnum,
  assertString,
  assertOptionalString,
  assertOptionalDate,
  assertVersion
} = require("../utils/validation");
const { fingerprint, requireIdempotencyKey, replayOrConflict } = require("../utils/idempotency");
const serializers = require("../utils/serializers");
const { TRANSFER_STATUS, TRANSFER_ACTION, assertTransferAction } = require("../domain/transfer-state-machine");

const RAILS = Object.freeze(["INTERNAL", "CCA", "LBTR", "SIPA"]);
const PURPOSE_CODES = Object.freeze([
  "PERSON_TO_PERSON",
  "SUPPLIER_PAYMENT",
  "PAYROLL",
  "EDUCATION",
  "HEALTHCARE",
  "FAMILY_SUPPORT",
  "OTHER"
]);
const SIPA_COUNTRIES = new Set(["SV", "HN", "NI", "CR", "DO"]);

class TransferService {
  constructor(repository) {
    this.repository = repository;
  }

  create(payload, idempotencyKey, actor = "api-client") {
    requireObject(payload);
    requireFields(payload, ["debtorAccountId", "beneficiaryId", "rail", "amount", "purposeCode"]);
    const key = requireIdempotencyKey(idempotencyKey);
    const requestFingerprint = fingerprint(payload);
    const replay = replayOrConflict(this.repository, "transfer.create", key, requestFingerprint);
    if (replay) return { ...replay, replayed: true };

    const response = this.repository.transaction((state) => {
      const account = this._account(state, payload.debtorAccountId);
      const customer = this._customer(state, account.customerId);
      const beneficiary = this._beneficiary(state, payload.beneficiaryId);
      if (beneficiary.customerId !== customer.customerId) {
        throw errors.forbidden("The beneficiary does not belong to the debtor account owner");
      }
      if (account.status !== "ACTIVE") throw errors.unprocessable("ACCOUNT_NOT_ACTIVE", "The debtor account is not active");
      if (customer.kycStatus !== "VERIFIED" && customer.kycStatus !== "ENHANCED_DUE_DILIGENCE") {
        throw errors.unprocessable("KYC_NOT_COMPLETE", "Customer due diligence is not complete");
      }

      const parsed = parseMoney(payload.amount, "amount");
      if (parsed.currency !== account.currency) throw errors.badRequest("Transfer currency must match the debtor account currency");
      if (beneficiary.currency !== account.currency) throw errors.badRequest("Beneficiary currency must match the transfer currency");
      const rail = assertEnum(payload.rail, RAILS, "rail");
      this._validateRail(rail, account, beneficiary);
      const purposeCode = assertEnum(payload.purposeCode, PURPOSE_CODES, "purposeCode");
      if (account.availableBalanceMinor < parsed.minor) {
        throw errors.unprocessable("INSUFFICIENT_AVAILABLE_BALANCE", "The account does not have sufficient available balance");
      }
      this._assertDailyLimit(state, account, parsed.minor);

      const amountGtqMinor = account.currency === "GTQ" ? parsed.minor : Math.round(parsed.minor * config.demoPolicy.usdToGtqRate);
      const beneficiaryIsCooling =
        beneficiary.verificationStatus !== "VERIFIED" || hoursSince(beneficiary.createdAt) < config.demoPolicy.beneficiaryCoolingHours;
      const approvalRequired =
        rail === "LBTR" ||
        amountGtqMinor >= config.demoPolicy.makerCheckerThresholdGtq * 100 ||
        beneficiaryIsCooling;
      const complianceRequired =
        amountGtqMinor >= config.demoPolicy.amlReviewThresholdGtq * 100 || customer.riskRating === "HIGH";

      const createdAt = nowIso();
      const transferId = createId("TRF-GT");
      const holdId = createId("HLD");
      account.availableBalanceMinor -= parsed.minor;
      account.updatedAt = createdAt;
      account.version += 1;
      state.holds[holdId] = {
        holdId,
        accountId: account.accountId,
        referenceId: transferId,
        currency: account.currency,
        amountMinor: parsed.minor,
        createdAt
      };

      const transfer = {
        transferId,
        debtorAccountId: account.accountId,
        customerId: customer.customerId,
        beneficiaryId: beneficiary.beneficiaryId,
        rail,
        currency: parsed.currency,
        amountMinor: parsed.minor,
        purposeCode,
        reference: assertOptionalString(payload.reference, "reference", { max: 140 }),
        requestedExecutionDate: assertOptionalDate(payload.requestedExecutionDate, "requestedExecutionDate") || createdAt.slice(0, 10),
        status: complianceRequired
          ? TRANSFER_STATUS.PENDING_COMPLIANCE
          : approvalRequired
            ? TRANSFER_STATUS.PENDING_APPROVAL
            : TRANSFER_STATUS.PROCESSING,
        approvalRequired,
        approvedBy: null,
        complianceCaseId: null,
        holdId,
        rejectionReason: null,
        settledAt: null,
        returnedAt: null,
        version: 1,
        createdAt,
        updatedAt: createdAt
      };
      state.transfers[transferId] = transfer;

      if (complianceRequired) {
        const reasons = [];
        if (amountGtqMinor >= config.demoPolicy.amlReviewThresholdGtq * 100) reasons.push("DEMO_HIGH_VALUE");
        if (customer.riskRating === "HIGH") reasons.push("HIGH_RISK_CUSTOMER");
        transfer.complianceCaseId = this._createComplianceCase(state, transfer, reasons);
      }

      if (transfer.status === TRANSFER_STATUS.PROCESSING && rail === "INTERNAL") {
        this._settleWithinState(state, transfer, actor);
      }

      this._audit(state, "TRANSFER_CREATED", transferId, actor, {
        rail,
        approvalRequired,
        complianceRequired
      });
      return { transfer: serializers.transfer(transfer), replayed: false };
    });

    this.repository.saveIdempotent("transfer.create", key, requestFingerprint, response);
    return response;
  }

  get(transferId) {
    return serializers.transfer(this._transfer(this.repository.state, transferId));
  }

  list(filters = {}) {
    let values = Object.values(this.repository.state.transfers);
    if (filters.accountId) values = values.filter((item) => item.debtorAccountId === filters.accountId);
    if (filters.status) values = values.filter((item) => item.status === filters.status);
    return values
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, Math.min(Math.max(Number(filters.limit) || 50, 1), 200))
      .map(serializers.transfer);
  }

  applyAction(transferId, payload, expectedVersion, actor = "operations-user") {
    requireObject(payload);
    requireFields(payload, ["action"]);
    const action = assertEnum(payload.action, Object.values(TRANSFER_ACTION), "action");
    return this.repository.transaction((state) => {
      const transfer = this._transfer(state, transferId);
      assertVersion(expectedVersion, transfer.version);
      assertTransferAction(transfer.status, action);
      const now = nowIso();

      switch (action) {
        case TRANSFER_ACTION.APPROVE:
          transfer.approvedBy = assertString(payload.actor || actor, "actor", { max: 120 });
          transfer.status = TRANSFER_STATUS.PROCESSING;
          transfer.updatedAt = now;
          transfer.version += 1;
          if (transfer.rail === "INTERNAL") this._settleWithinState(state, transfer, actor);
          break;
        case TRANSFER_ACTION.REJECT:
          this._releaseHoldWithinState(state, transfer);
          this._closeLinkedComplianceCase(state, transfer, "REJECTED", actor, payload.reason);
          transfer.status = TRANSFER_STATUS.REJECTED;
          transfer.rejectionReason = assertString(payload.reason, "reason", { max: 240 });
          transfer.updatedAt = now;
          transfer.version += 1;
          break;
        case TRANSFER_ACTION.CANCEL:
          this._releaseHoldWithinState(state, transfer);
          this._closeLinkedComplianceCase(state, transfer, "REJECTED", actor, payload.reason || "Transfer cancelled");
          transfer.status = TRANSFER_STATUS.CANCELLED;
          transfer.rejectionReason = assertOptionalString(payload.reason, "reason", { max: 240 }) || "Cancelled by request";
          transfer.updatedAt = now;
          transfer.version += 1;
          break;
        case TRANSFER_ACTION.SETTLE:
          this._settleWithinState(state, transfer, actor);
          break;
        case TRANSFER_ACTION.RETURN:
          this._returnWithinState(state, transfer, payload.reason, actor);
          break;
        default:
          throw errors.badRequest("Unsupported transfer action");
      }

      this._audit(state, `TRANSFER_${action}`, transferId, actor, { reason: payload.reason });
      return serializers.transfer(transfer);
    });
  }

  applyComplianceDecisionWithinState(state, transferId, disposition, actor) {
    const transfer = this._transfer(state, transferId);
    if (transfer.status !== TRANSFER_STATUS.PENDING_COMPLIANCE) {
      throw errors.conflict("TRANSFER_NOT_PENDING_COMPLIANCE", "Linked transfer is not pending compliance review");
    }
    if (disposition === "CLEARED") {
      transfer.status = transfer.approvalRequired ? TRANSFER_STATUS.PENDING_APPROVAL : TRANSFER_STATUS.PROCESSING;
      transfer.updatedAt = nowIso();
      transfer.version += 1;
      if (transfer.status === TRANSFER_STATUS.PROCESSING && transfer.rail === "INTERNAL") {
        this._settleWithinState(state, transfer, actor);
      }
    } else if (disposition === "REJECTED") {
      this._releaseHoldWithinState(state, transfer);
      transfer.status = TRANSFER_STATUS.REJECTED;
      transfer.rejectionReason = "Rejected by compliance review";
      transfer.updatedAt = nowIso();
      transfer.version += 1;
    } else {
      throw errors.badRequest("Compliance disposition must be CLEARED or REJECTED");
    }
    return transfer;
  }

  _validateRail(rail, account, beneficiary) {
    if (rail === "INTERNAL" && beneficiary.type !== "INTERNAL") {
      throw errors.badRequest("INTERNAL rail requires an INTERNAL beneficiary");
    }
    if (rail === "CCA" && (beneficiary.type !== "DOMESTIC_EXTERNAL" || beneficiary.country !== "GT")) {
      throw errors.badRequest("CCA rail requires a domestic external beneficiary in Guatemala");
    }
    if (rail === "LBTR" && beneficiary.country !== "GT") {
      throw errors.badRequest("LBTR rail requires a beneficiary in Guatemala");
    }
    if (rail === "SIPA") {
      if (beneficiary.type !== "REGIONAL_EXTERNAL" || !SIPA_COUNTRIES.has(beneficiary.country)) {
        throw errors.badRequest("SIPA rail requires a regional beneficiary in a supported country");
      }
      if (account.currency !== "USD") throw errors.badRequest("SIPA transfers in this demo must originate from a USD account");
    }
  }

  _assertDailyLimit(state, account, requestedMinor) {
    const today = todayUtc();
    const used = Object.values(state.transfers)
      .filter(
        (item) =>
          item.debtorAccountId === account.accountId &&
          item.createdAt.slice(0, 10) === today &&
          ![TRANSFER_STATUS.REJECTED, TRANSFER_STATUS.CANCELLED].includes(item.status)
      )
      .reduce((sum, item) => sum + item.amountMinor, 0);
    if (used + requestedMinor > account.limits.dailyTransferLimitMinor) {
      throw errors.unprocessable("DAILY_TRANSFER_LIMIT_EXCEEDED", "The transfer would exceed the account daily transfer limit");
    }
  }

  _settleWithinState(state, transfer, actor) {
    const hold = state.holds[transfer.holdId];
    if (!hold) throw errors.conflict("HOLD_NOT_FOUND", "The transfer funds hold is missing");
    const source = this._account(state, transfer.debtorAccountId);
    if (source.ledgerBalanceMinor < transfer.amountMinor) {
      throw errors.conflict("LEDGER_BALANCE_INCONSISTENT", "The ledger balance is lower than the reserved transfer amount");
    }
    const now = nowIso();
    source.ledgerBalanceMinor -= transfer.amountMinor;
    source.updatedAt = now;
    source.version += 1;
    delete state.holds[transfer.holdId];
    state.ledgerEntries.push({
      entryId: createId("LED"),
      accountId: source.accountId,
      type: "DEBIT",
      amountMinor: transfer.amountMinor,
      currency: transfer.currency,
      description: `Transferencia ${transfer.rail}`,
      referenceId: transfer.transferId,
      bookedAt: now
    });

    if (transfer.rail === "INTERNAL") {
      const beneficiary = this._beneficiary(state, transfer.beneficiaryId);
      const target = this._account(state, beneficiary.internalAccountId);
      target.ledgerBalanceMinor += transfer.amountMinor;
      target.availableBalanceMinor += transfer.amountMinor;
      target.updatedAt = now;
      target.version += 1;
      state.ledgerEntries.push({
        entryId: createId("LED"),
        accountId: target.accountId,
        type: "CREDIT",
        amountMinor: transfer.amountMinor,
        currency: transfer.currency,
        description: "Transferencia interna recibida",
        referenceId: transfer.transferId,
        bookedAt: now
      });
    }

    transfer.status = TRANSFER_STATUS.SETTLED;
    transfer.settledAt = now;
    transfer.updatedAt = now;
    transfer.version += 1;
    this._audit(state, "TRANSFER_SETTLED", transfer.transferId, actor, {});
  }

  _releaseHoldWithinState(state, transfer) {
    const hold = state.holds[transfer.holdId];
    if (!hold) return;
    const account = this._account(state, hold.accountId);
    account.availableBalanceMinor += hold.amountMinor;
    account.updatedAt = nowIso();
    account.version += 1;
    delete state.holds[hold.holdId];
  }

  _returnWithinState(state, transfer, reason, actor) {
    if (transfer.rail === "INTERNAL") {
      throw errors.conflict("INTERNAL_RETURN_NOT_SUPPORTED", "Use a compensating internal transfer for an internal payment return");
    }
    const account = this._account(state, transfer.debtorAccountId);
    const now = nowIso();
    account.ledgerBalanceMinor += transfer.amountMinor;
    account.availableBalanceMinor += transfer.amountMinor;
    account.updatedAt = now;
    account.version += 1;
    state.ledgerEntries.push({
      entryId: createId("LED"),
      accountId: account.accountId,
      type: "CREDIT",
      amountMinor: transfer.amountMinor,
      currency: transfer.currency,
      description: "Devolución de transferencia",
      referenceId: transfer.transferId,
      bookedAt: now
    });
    transfer.status = TRANSFER_STATUS.RETURNED;
    transfer.returnedAt = now;
    transfer.rejectionReason = assertString(reason, "reason", { max: 240 });
    transfer.updatedAt = now;
    transfer.version += 1;
    this._audit(state, "TRANSFER_RETURNED", transfer.transferId, actor, { reason });
  }

  _closeLinkedComplianceCase(state, transfer, disposition, actor, note) {
    if (!transfer.complianceCaseId) return;
    const complianceCase = state.complianceCases[transfer.complianceCaseId];
    if (!complianceCase || complianceCase.status === "RESOLVED") return;
    const now = nowIso();
    complianceCase.status = "RESOLVED";
    complianceCase.disposition = disposition;
    complianceCase.resolvedAt = now;
    complianceCase.updatedAt = now;
    complianceCase.version += 1;
    complianceCase.notes.push({
      noteId: createId("NOTE"),
      text: note || "Linked transfer was closed",
      createdBy: actor,
      createdAt: now
    });
  }

  _createComplianceCase(state, transfer, reasonCodes) {
    const caseId = createId("CMP-GT");
    const now = nowIso();
    state.complianceCases[caseId] = {
      caseId,
      caseType: "TRANSFER_AML_REVIEW",
      subjectType: "TRANSFER",
      subjectId: transfer.transferId,
      customerId: transfer.customerId,
      status: "OPEN",
      priority: reasonCodes.includes("HIGH_RISK_CUSTOMER") ? "HIGH" : "MEDIUM",
      reasonCodes,
      amount: money(transfer.currency, transfer.amountMinor),
      assignedTo: null,
      notes: [],
      disposition: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null
    };
    return caseId;
  }

  _customer(state, id) {
    const value = state.customers[id];
    if (!value) throw errors.notFound("Customer", id);
    return value;
  }

  _account(state, id) {
    const value = state.accounts[id];
    if (!value) throw errors.notFound("Account", id);
    return value;
  }

  _beneficiary(state, id) {
    const value = state.beneficiaries[id];
    if (!value) throw errors.notFound("Beneficiary", id);
    return value;
  }

  _transfer(state, id) {
    const value = state.transfers[id];
    if (!value) throw errors.notFound("Transfer", id);
    return value;
  }

  _audit(state, type, resourceId, actor, details) {
    state.auditEvents.push({ eventId: createId("AUD"), type, resourceId, actor, details, createdAt: nowIso() });
  }
}

module.exports = { TransferService, RAILS, PURPOSE_CODES };
