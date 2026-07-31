"use strict";

const { errors } = require("../errors");
const { createId } = require("../utils/id");
const { nowIso } = require("../utils/time");
const { parseMoney } = require("../utils/money");
const {
  requireObject,
  requireFields,
  assertEnum,
  assertString,
  assertOptionalString,
  assertBoolean,
  assertVersion
} = require("../utils/validation");
const serializers = require("../utils/serializers");

class EntityService {
  constructor(repository) {
    this.repository = repository;
  }

  getCustomer(customerId) {
    return serializers.customer(this._customer(this.repository.state, customerId));
  }

  patchCustomer(customerId, patch, expectedVersion) {
    requireObject(patch);
    if (Object.keys(patch).length === 0) throw errors.badRequest("At least one customer field must be supplied");
    return this.repository.transaction((state) => {
      const entity = this._customer(state, customerId);
      assertVersion(expectedVersion, entity.version);
      const allowed = new Set(["displayName", "preferredLanguage", "contact", "address"]);
      for (const key of Object.keys(patch)) {
        if (!allowed.has(key)) throw errors.badRequest(`Customer field '${key}' cannot be patched`);
      }
      if (patch.displayName !== undefined) {
        entity.displayName = assertString(patch.displayName, "displayName", { max: 120 });
      }
      if (patch.preferredLanguage !== undefined) {
        entity.preferredLanguage = assertEnum(patch.preferredLanguage, ["es-GT", "en-US"], "preferredLanguage");
      }
      if (patch.contact !== undefined) {
        requireObject(patch.contact, "contact");
        entity.contact = {
          ...entity.contact,
          ...(patch.contact.email !== undefined
            ? { email: assertString(patch.contact.email, "contact.email", { max: 160, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ }) }
            : {}),
          ...(patch.contact.mobile !== undefined
            ? { mobile: assertString(patch.contact.mobile, "contact.mobile", { max: 30 }) }
            : {})
        };
      }
      if (patch.address !== undefined) {
        requireObject(patch.address, "address");
        entity.address = {
          ...entity.address,
          ...Object.fromEntries(
            Object.entries(patch.address).map(([key, value]) => [key, assertString(value, `address.${key}`, { max: 100 })])
          )
        };
      }
      entity.version += 1;
      entity.updatedAt = nowIso();
      this._audit(state, "CUSTOMER_PATCHED", customerId, { fields: Object.keys(patch) });
      return serializers.customer(entity);
    });
  }

  getAccount(accountId) {
    return serializers.account(this._account(this.repository.state, accountId));
  }

  listCustomerAccounts(customerId) {
    const entity = this._customer(this.repository.state, customerId);
    return entity.accountIds.map((id) => serializers.account(this.repository.state.accounts[id]));
  }

  listCustomerCards(customerId) {
    this._customer(this.repository.state, customerId);
    return Object.values(this.repository.state.cards)
      .filter((card) => card.customerId === customerId)
      .map(serializers.card);
  }

  listAccountTransactions(accountId, limit = 50) {
    this._account(this.repository.state, accountId);
    return this.repository.state.ledgerEntries
      .filter((entry) => entry.accountId === accountId)
      .sort((a, b) => new Date(b.bookedAt) - new Date(a.bookedAt))
      .slice(0, Math.min(Math.max(Number(limit) || 50, 1), 200))
      .map(serializers.ledgerEntry);
  }

  patchAccountLimits(accountId, patch, expectedVersion) {
    requireObject(patch);
    return this.repository.transaction((state) => {
      const entity = this._account(state, accountId);
      assertVersion(expectedVersion, entity.version);
      const allowed = new Set(["dailyTransferLimit", "dailyCashWithdrawalLimit"]);
      for (const key of Object.keys(patch)) {
        if (!allowed.has(key)) throw errors.badRequest(`Account limit '${key}' cannot be patched`);
      }
      if (Object.keys(patch).length === 0) throw errors.badRequest("At least one account limit must be supplied");
      if (patch.dailyTransferLimit !== undefined) {
        const parsed = parseMoney(patch.dailyTransferLimit, "dailyTransferLimit");
        if (parsed.currency !== entity.currency) throw errors.badRequest("dailyTransferLimit currency must match account currency");
        entity.limits.dailyTransferLimitMinor = parsed.minor;
      }
      if (patch.dailyCashWithdrawalLimit !== undefined) {
        const parsed = parseMoney(patch.dailyCashWithdrawalLimit, "dailyCashWithdrawalLimit");
        if (parsed.currency !== entity.currency) throw errors.badRequest("dailyCashWithdrawalLimit currency must match account currency");
        entity.limits.dailyCashWithdrawalLimitMinor = parsed.minor;
      }
      entity.version += 1;
      entity.updatedAt = nowIso();
      this._audit(state, "ACCOUNT_LIMITS_PATCHED", accountId, { fields: Object.keys(patch) });
      return serializers.account(entity);
    });
  }

  listBeneficiaries(customerId) {
    const entity = this._customer(this.repository.state, customerId);
    return entity.beneficiaryIds.map((id) => serializers.beneficiary(this.repository.state.beneficiaries[id]));
  }

  createBeneficiary(customerId, payload) {
    requireObject(payload);
    requireFields(payload, ["type", "name", "bankCode", "bankName", "country", "currency", "accountNumberMasked"]);
    return this.repository.transaction((state) => {
      const owner = this._customer(state, customerId);
      const beneficiaryId = createId("BEN-GT");
      const now = nowIso();
      const entity = this._validateBeneficiaryPayload({ ...payload, beneficiaryId, customerId }, state);
      entity.verificationStatus = "PENDING_VERIFICATION";
      entity.version = 1;
      entity.createdAt = now;
      entity.updatedAt = now;
      state.beneficiaries[beneficiaryId] = entity;
      owner.beneficiaryIds.push(beneficiaryId);
      owner.version += 1;
      owner.updatedAt = now;
      this._audit(state, "BENEFICIARY_CREATED", beneficiaryId, { customerId });
      return serializers.beneficiary(entity);
    });
  }

  replaceBeneficiary(customerId, beneficiaryId, payload, expectedVersion) {
    requireObject(payload);
    requireFields(payload, ["type", "name", "bankCode", "bankName", "country", "currency", "accountNumberMasked"]);
    return this.repository.transaction((state) => {
      this._customer(state, customerId);
      const current = this._beneficiary(state, beneficiaryId);
      if (current.customerId !== customerId) throw errors.notFound("Beneficiary", beneficiaryId);
      assertVersion(expectedVersion, current.version);
      const replacement = this._validateBeneficiaryPayload({ ...payload, beneficiaryId, customerId }, state);
      replacement.verificationStatus = "PENDING_VERIFICATION";
      replacement.version = current.version + 1;
      replacement.createdAt = current.createdAt;
      replacement.updatedAt = nowIso();
      state.beneficiaries[beneficiaryId] = replacement;
      this._audit(state, "BENEFICIARY_REPLACED", beneficiaryId, { customerId });
      return serializers.beneficiary(replacement);
    });
  }

  getCard(cardId) {
    return serializers.card(this._card(this.repository.state, cardId));
  }

  patchCard(cardId, patch, expectedVersion) {
    requireObject(patch);
    if (Object.keys(patch).length === 0) throw errors.badRequest("At least one card field must be supplied");
    return this.repository.transaction((state) => {
      const entity = this._card(state, cardId);
      assertVersion(expectedVersion, entity.version);
      const allowed = new Set(["status", "controls"]);
      for (const key of Object.keys(patch)) {
        if (!allowed.has(key)) throw errors.badRequest(`Card field '${key}' cannot be patched`);
      }
      if (patch.status !== undefined) {
        entity.status = assertEnum(patch.status, ["ACTIVE", "TEMPORARILY_BLOCKED"], "status");
      }
      if (patch.controls !== undefined) {
        requireObject(patch.controls, "controls");
        for (const [key, value] of Object.entries(patch.controls)) {
          if (!Object.hasOwn(entity.controls, key)) throw errors.badRequest(`Unknown card control '${key}'`);
          entity.controls[key] = assertBoolean(value, `controls.${key}`);
        }
      }
      entity.version += 1;
      entity.updatedAt = nowIso();
      this._audit(state, "CARD_PATCHED", cardId, { fields: Object.keys(patch) });
      return serializers.card(entity);
    });
  }

  _validateBeneficiaryPayload(payload, state) {
    const type = assertEnum(payload.type, ["INTERNAL", "DOMESTIC_EXTERNAL", "REGIONAL_EXTERNAL"], "type");
    const country = assertString(payload.country, "country", { min: 2, max: 2, pattern: /^[A-Z]{2}$/ });
    const currency = assertEnum(payload.currency, ["GTQ", "USD"], "currency");
    if (type === "INTERNAL") {
      if (!payload.internalAccountId) throw errors.badRequest("internalAccountId is required for INTERNAL beneficiaries");
      const target = this._account(state, payload.internalAccountId);
      if (target.currency !== currency) throw errors.badRequest("Internal beneficiary currency must match target account currency");
    }
    if (type === "DOMESTIC_EXTERNAL" && country !== "GT") {
      throw errors.badRequest("DOMESTIC_EXTERNAL beneficiary country must be GT");
    }
    if (type === "REGIONAL_EXTERNAL" && country === "GT") {
      throw errors.badRequest("REGIONAL_EXTERNAL beneficiary must be outside Guatemala");
    }
    return {
      beneficiaryId: payload.beneficiaryId,
      customerId: payload.customerId,
      type,
      name: assertString(payload.name, "name", { max: 160 }),
      bankCode: assertString(payload.bankCode, "bankCode", { max: 30 }),
      bankName: assertString(payload.bankName, "bankName", { max: 160 }),
      country,
      currency,
      accountNumberMasked: assertString(payload.accountNumberMasked, "accountNumberMasked", { max: 60 }),
      internalAccountId: type === "INTERNAL" ? payload.internalAccountId : null,
      alias: assertOptionalString(payload.alias, "alias", { max: 80 })
    };
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

  _card(state, id) {
    const value = state.cards[id];
    if (!value) throw errors.notFound("Card", id);
    return value;
  }

  _audit(state, type, resourceId, details) {
    state.auditEvents.push({ eventId: createId("AUD"), type, resourceId, details, createdAt: nowIso() });
  }
}

module.exports = { EntityService };
