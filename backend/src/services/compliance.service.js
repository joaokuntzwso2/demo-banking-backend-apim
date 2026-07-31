"use strict";

const { errors } = require("../errors");
const { createId } = require("../utils/id");
const { nowIso } = require("../utils/time");
const { parseMoney, money } = require("../utils/money");
const {
  requireObject,
  requireFields,
  assertEnum,
  assertString,
  assertOptionalString,
  assertVersion
} = require("../utils/validation");
const serializers = require("../utils/serializers");

class ComplianceService {
  constructor(repository, transferService, remittanceService) {
    this.repository = repository;
    this.transferService = transferService;
    this.remittanceService = remittanceService;
  }

  create(payload, actor = "compliance-user") {
    requireObject(payload);
    requireFields(payload, ["caseType", "subjectType", "subjectId", "customerId", "priority", "reasonCodes"]);
    return this.repository.transaction((state) => {
      if (!state.customers[payload.customerId]) throw errors.notFound("Customer", payload.customerId);
      const subjectType = assertEnum(payload.subjectType, ["CUSTOMER", "TRANSFER", "REMITTANCE"], "subjectType");
      if (subjectType === "CUSTOMER" && payload.subjectId !== payload.customerId) {
        throw errors.badRequest("A CUSTOMER case subjectId must equal customerId");
      }
      if (subjectType === "TRANSFER") {
        const transfer = state.transfers[payload.subjectId];
        if (!transfer) throw errors.notFound("Transfer", payload.subjectId);
        if (transfer.customerId !== payload.customerId) throw errors.badRequest("Transfer does not belong to customerId");
      }
      if (subjectType === "REMITTANCE") {
        const remittance = state.remittances[payload.subjectId];
        if (!remittance) throw errors.notFound("Remittance", payload.subjectId);
        if (remittance.beneficiaryCustomerId !== payload.customerId) throw errors.badRequest("Remittance does not belong to customerId");
      }
      const now = nowIso();
      const parsedAmount = payload.amount === undefined ? null : parseMoney(payload.amount, "amount");
      const entity = {
        caseId: createId("CMP-GT"),
        caseType: assertString(payload.caseType, "caseType", { max: 80 }),
        subjectType,
        subjectId: assertString(payload.subjectId, "subjectId", { max: 120 }),
        customerId: payload.customerId,
        status: "OPEN",
        priority: assertEnum(payload.priority, ["LOW", "MEDIUM", "HIGH", "CRITICAL"], "priority"),
        reasonCodes: Array.isArray(payload.reasonCodes)
          ? payload.reasonCodes.map((value, index) => assertString(value, `reasonCodes[${index}]`, { max: 80 }))
          : (() => { throw errors.badRequest("reasonCodes must be an array"); })(),
        amount: parsedAmount ? money(parsedAmount.currency, parsedAmount.minor) : undefined,
        assignedTo: null,
        notes: [],
        disposition: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null
      };
      state.complianceCases[entity.caseId] = entity;
      this._audit(state, "COMPLIANCE_CASE_CREATED", entity.caseId, actor, {});
      return serializers.complianceCase(entity);
    });
  }

  get(caseId) {
    return serializers.complianceCase(this._case(this.repository.state, caseId));
  }

  list(filters = {}) {
    let values = Object.values(this.repository.state.complianceCases);
    if (filters.status) values = values.filter((item) => item.status === filters.status);
    if (filters.customerId) values = values.filter((item) => item.customerId === filters.customerId);
    return values
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, Math.min(Math.max(Number(filters.limit) || 50, 1), 200))
      .map(serializers.complianceCase);
  }

  patch(caseId, payload, expectedVersion, actor = "compliance-user") {
    requireObject(payload);
    requireFields(payload, ["action"]);
    const action = assertEnum(payload.action, ["ASSIGN", "ADD_NOTE", "RESOLVE"], "action");
    return this.repository.transaction((state) => {
      const entity = this._case(state, caseId);
      assertVersion(expectedVersion, entity.version);
      if (entity.status === "RESOLVED" && action !== "ADD_NOTE") {
        throw errors.conflict("CASE_ALREADY_RESOLVED", "The compliance case is already resolved");
      }
      const now = nowIso();
      if (action === "ASSIGN") {
        entity.assignedTo = assertString(payload.assignedTo, "assignedTo", { max: 120 });
        entity.status = "IN_REVIEW";
      } else if (action === "ADD_NOTE") {
        entity.notes.push({
          noteId: createId("NOTE"),
          text: assertString(payload.note, "note", { max: 1000 }),
          createdBy: actor,
          createdAt: now
        });
      } else if (action === "RESOLVE") {
        const disposition = assertEnum(payload.disposition, ["CLEARED", "REJECTED"], "disposition");
        entity.disposition = disposition;
        entity.status = "RESOLVED";
        entity.resolvedAt = now;
        if (payload.note) {
          entity.notes.push({
            noteId: createId("NOTE"),
            text: assertOptionalString(payload.note, "note", { max: 1000 }),
            createdBy: actor,
            createdAt: now
          });
        }
        if (entity.subjectType === "TRANSFER") {
          this.transferService.applyComplianceDecisionWithinState(state, entity.subjectId, disposition, actor);
        } else if (entity.subjectType === "REMITTANCE") {
          this.remittanceService.applyComplianceDecisionWithinState(state, entity.subjectId, disposition, actor);
        }
      }
      entity.version += 1;
      entity.updatedAt = now;
      this._audit(state, `COMPLIANCE_CASE_${action}`, caseId, actor, { disposition: payload.disposition });
      return serializers.complianceCase(entity);
    });
  }

  _case(state, id) {
    const value = state.complianceCases[id];
    if (!value) throw errors.notFound("Compliance case", id);
    return value;
  }

  _audit(state, type, resourceId, actor, details) {
    state.auditEvents.push({ eventId: createId("AUD"), type, resourceId, actor, details, createdAt: nowIso() });
  }
}

module.exports = { ComplianceService };
