"use strict";

function clone(value) {
  return structuredClone(value);
}

class InMemoryBankRepository {
  constructor(seed) {
    this._seed = clone(seed);
    this.reset();
  }

  get state() {
    return this._state;
  }

  reset() {
    this._state = clone(this._seed);
    return this._state;
  }

  transaction(mutator) {
    const snapshot = clone(this._state);
    try {
      return mutator(this._state);
    } catch (error) {
      this._state = snapshot;
      throw error;
    }
  }

  getIdempotent(scope, key) {
    return this._state.idempotency[`${scope}:${key}`];
  }

  saveIdempotent(scope, key, fingerprint, response) {
    this._state.idempotency[`${scope}:${key}`] = {
      fingerprint,
      response: clone(response),
      createdAt: new Date().toISOString()
    };
  }

  snapshot() {
    const state = this._state;
    return {
      customers: Object.keys(state.customers).length,
      accounts: Object.keys(state.accounts).length,
      beneficiaries: Object.keys(state.beneficiaries).length,
      cards: Object.keys(state.cards).length,
      transfers: Object.keys(state.transfers).length,
      activeHolds: Object.keys(state.holds).length,
      ledgerEntries: state.ledgerEntries.length,
      remittances: Object.keys(state.remittances).length,
      complianceCases: Object.keys(state.complianceCases).length,
      auditEvents: state.auditEvents.length
    };
  }
}

module.exports = { InMemoryBankRepository };
