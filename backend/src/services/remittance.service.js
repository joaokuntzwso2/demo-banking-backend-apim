"use strict";

const { config } = require("../config");
const { errors } = require("../errors");
const { createId } = require("../utils/id");
const { nowIso, addMinutes, isExpired } = require("../utils/time");
const { parseMoney, money, convertUsdToGtq } = require("../utils/money");
const {
  requireObject,
  requireFields,
  assertEnum,
  assertString,
  assertVersion
} = require("../utils/validation");
const { fingerprint, requireIdempotencyKey, replayOrConflict } = require("../utils/idempotency");
const serializers = require("../utils/serializers");
const {
  REMITTANCE_STATUS,
  REMITTANCE_ACTION,
  assertRemittanceAction
} = require("../domain/remittance-state-machine");

class RemittanceService {
  constructor(repository) {
    this.repository = repository;
  }

  createQuote(payload) {
    requireObject(payload);
    requireFields(payload, ["senderCountry", "sourceAmount", "payoutMethod", "destinationAccountId"]);
    return this.repository.transaction((state) => {
      const account = this._account(state, payload.destinationAccountId);
      if (account.currency !== "GTQ") {
        throw errors.badRequest("Remittance payout account must be denominated in GTQ");
      }
      if (account.status !== "ACTIVE") {
        throw errors.unprocessable("ACCOUNT_NOT_ACTIVE", "Remittance payout account is not active");
      }
      const source = parseMoney(payload.sourceAmount, "sourceAmount");
      if (source.currency !== "USD") throw errors.badRequest("Remittance sourceAmount currency must be USD");
      const payoutMethod = assertEnum(payload.payoutMethod, ["ACCOUNT_CREDIT"], "payoutMethod");
      const feeMinor = Math.round(config.demoPolicy.remittanceFeeUsd * 100);
      if (source.minor <= feeMinor) throw errors.badRequest("sourceAmount must be greater than the remittance fee");
      const createdAt = nowIso();
      const quote = {
        quoteId: createId("RQT-GT"),
        senderCountry: assertString(payload.senderCountry, "senderCountry", { min: 2, max: 2, pattern: /^[A-Z]{2}$/ }),
        sourceAmountMinor: source.minor,
        feeMinor,
        exchangeRate: config.demoPolicy.usdToGtqRate,
        payoutAmountMinor: convertUsdToGtq(source.minor - feeMinor, config.demoPolicy.usdToGtqRate),
        payoutMethod,
        destinationAccountId: account.accountId,
        expiresAt: addMinutes(createdAt, config.demoPolicy.quoteTtlMinutes),
        createdAt,
        consumedBy: null
      };
      state.remittanceQuotes[quote.quoteId] = quote;
      this._audit(state, "REMITTANCE_QUOTE_CREATED", quote.quoteId, "api-client", {});
      return serializers.remittanceQuote(quote);
    });
  }

  create(payload, idempotencyKey, actor = "remittance-partner") {
    requireObject(payload);
    requireFields(payload, ["quoteId", "externalReference", "sender", "beneficiaryCustomerId"]);
    const key = requireIdempotencyKey(idempotencyKey);
    const requestFingerprint = fingerprint(payload);
    const replay = replayOrConflict(this.repository, "remittance.create", key, requestFingerprint);
    if (replay) return { ...replay, replayed: true };

    const response = this.repository.transaction((state) => {
      const quote = this._quote(state, payload.quoteId);
      if (isExpired(quote.expiresAt)) throw errors.conflict("QUOTE_EXPIRED", "The remittance quote has expired");
      if (quote.consumedBy) throw errors.conflict("QUOTE_ALREADY_USED", "The remittance quote has already been consumed");
      if (Object.values(state.remittances).some((item) => item.externalReference === payload.externalReference)) {
        throw errors.conflict("DUPLICATE_EXTERNAL_REFERENCE", "A remittance with this externalReference already exists");
      }
      const customer = this._customer(state, payload.beneficiaryCustomerId);
      const account = this._account(state, quote.destinationAccountId);
      if (account.customerId !== customer.customerId) {
        throw errors.forbidden("The payout account does not belong to the beneficiary customer");
      }
      requireObject(payload.sender, "sender");
      requireFields(payload.sender, ["name", "country"]);
      const reviewRequired =
        quote.sourceAmountMinor >= config.demoPolicy.remittanceReviewThresholdUsd * 100 ||
        customer.riskRating === "HIGH" ||
        customer.kycStatus !== "VERIFIED";
      const createdAt = nowIso();
      const remittance = {
        remittanceId: createId("RMT-GT"),
        quoteId: quote.quoteId,
        externalReference: assertString(payload.externalReference, "externalReference", { max: 100 }),
        sender: {
          name: assertString(payload.sender.name, "sender.name", { max: 160 }),
          country: assertString(payload.sender.country, "sender.country", { min: 2, max: 2, pattern: /^[A-Z]{2}$/ }),
          relationship: payload.sender.relationship
            ? assertString(payload.sender.relationship, "sender.relationship", { max: 80 })
            : undefined
        },
        beneficiaryCustomerId: customer.customerId,
        destinationAccountId: account.accountId,
        sourceAmountMinor: quote.sourceAmountMinor,
        payoutAmountMinor: quote.payoutAmountMinor,
        status: reviewRequired ? REMITTANCE_STATUS.PENDING_COMPLIANCE : REMITTANCE_STATUS.READY_FOR_PAYOUT,
        complianceCaseId: null,
        version: 1,
        createdAt,
        updatedAt: createdAt,
        paidAt: null
      };
      state.remittances[remittance.remittanceId] = remittance;
      quote.consumedBy = remittance.remittanceId;
      if (reviewRequired) {
        const reasons = [];
        if (quote.sourceAmountMinor >= config.demoPolicy.remittanceReviewThresholdUsd * 100) reasons.push("DEMO_HIGH_VALUE_REMITTANCE");
        if (customer.riskRating === "HIGH") reasons.push("HIGH_RISK_BENEFICIARY");
        if (customer.kycStatus !== "VERIFIED") reasons.push("KYC_REVIEW_REQUIRED");
        remittance.complianceCaseId = this._createComplianceCase(state, remittance, reasons);
      }
      this._audit(state, "REMITTANCE_CREATED", remittance.remittanceId, actor, { reviewRequired });
      return { remittance: serializers.remittance(remittance), replayed: false };
    });

    this.repository.saveIdempotent("remittance.create", key, requestFingerprint, response);
    return response;
  }

  get(remittanceId) {
    return serializers.remittance(this._remittance(this.repository.state, remittanceId));
  }

  list(filters = {}) {
    let values = Object.values(this.repository.state.remittances);
    if (filters.customerId) values = values.filter((item) => item.beneficiaryCustomerId === filters.customerId);
    if (filters.status) values = values.filter((item) => item.status === filters.status);
    return values
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, Math.min(Math.max(Number(filters.limit) || 50, 1), 200))
      .map(serializers.remittance);
  }

  applyAction(remittanceId, payload, expectedVersion, actor = "operations-user") {
    requireObject(payload);
    requireFields(payload, ["action"]);
    const action = assertEnum(payload.action, Object.values(REMITTANCE_ACTION), "action");
    return this.repository.transaction((state) => {
      const remittance = this._remittance(state, remittanceId);
      assertVersion(expectedVersion, remittance.version);
      assertRemittanceAction(remittance.status, action);
      const now = nowIso();
      if (action === REMITTANCE_ACTION.PAYOUT) {
        const account = this._account(state, remittance.destinationAccountId);
        account.ledgerBalanceMinor += remittance.payoutAmountMinor;
        account.availableBalanceMinor += remittance.payoutAmountMinor;
        account.updatedAt = now;
        account.version += 1;
        state.ledgerEntries.push({
          entryId: createId("LED"),
          accountId: account.accountId,
          type: "CREDIT",
          amountMinor: remittance.payoutAmountMinor,
          currency: "GTQ",
          description: "Abono de remesa familiar",
          referenceId: remittance.remittanceId,
          bookedAt: now
        });
        remittance.status = REMITTANCE_STATUS.PAID;
        remittance.paidAt = now;
      } else if (action === REMITTANCE_ACTION.CANCEL) {
        this._closeLinkedComplianceCase(state, remittance, actor, payload.reason || "Remittance cancelled");
        remittance.status = REMITTANCE_STATUS.CANCELLED;
      } else if (action === REMITTANCE_ACTION.REJECT) {
        this._closeLinkedComplianceCase(state, remittance, actor, payload.reason || "Remittance rejected");
        remittance.status = REMITTANCE_STATUS.REJECTED;
      }
      remittance.updatedAt = now;
      remittance.version += 1;
      this._audit(state, `REMITTANCE_${action}`, remittanceId, actor, { reason: payload.reason });
      return serializers.remittance(remittance);
    });
  }

  applyComplianceDecisionWithinState(state, remittanceId, disposition) {
    const remittance = this._remittance(state, remittanceId);
    if (remittance.status !== REMITTANCE_STATUS.PENDING_COMPLIANCE) {
      throw errors.conflict("REMITTANCE_NOT_PENDING_COMPLIANCE", "Linked remittance is not pending compliance review");
    }
    remittance.status = disposition === "CLEARED" ? REMITTANCE_STATUS.READY_FOR_PAYOUT : REMITTANCE_STATUS.REJECTED;
    remittance.updatedAt = nowIso();
    remittance.version += 1;
    return remittance;
  }

  _closeLinkedComplianceCase(state, remittance, actor, note) {
    if (!remittance.complianceCaseId) return;
    const complianceCase = state.complianceCases[remittance.complianceCaseId];
    if (!complianceCase || complianceCase.status === "RESOLVED") return;
    const now = nowIso();
    complianceCase.status = "RESOLVED";
    complianceCase.disposition = "REJECTED";
    complianceCase.resolvedAt = now;
    complianceCase.updatedAt = now;
    complianceCase.version += 1;
    complianceCase.notes.push({
      noteId: createId("NOTE"),
      text: note,
      createdBy: actor,
      createdAt: now
    });
  }

  _createComplianceCase(state, remittance, reasonCodes) {
    const caseId = createId("CMP-GT");
    const now = nowIso();
    state.complianceCases[caseId] = {
      caseId,
      caseType: "REMITTANCE_AML_REVIEW",
      subjectType: "REMITTANCE",
      subjectId: remittance.remittanceId,
      customerId: remittance.beneficiaryCustomerId,
      status: "OPEN",
      priority: reasonCodes.includes("HIGH_RISK_BENEFICIARY") ? "HIGH" : "MEDIUM",
      reasonCodes,
      amount: money("USD", remittance.sourceAmountMinor),
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

  _quote(state, id) {
    const value = state.remittanceQuotes[id];
    if (!value) throw errors.notFound("Remittance quote", id);
    return value;
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

  _remittance(state, id) {
    const value = state.remittances[id];
    if (!value) throw errors.notFound("Remittance", id);
    return value;
  }

  _audit(state, type, resourceId, actor, details) {
    state.auditEvents.push({ eventId: createId("AUD"), type, resourceId, actor, details, createdAt: nowIso() });
  }
}

module.exports = { RemittanceService };
