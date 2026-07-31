"use strict";

const { seed } = require("./data/seed");
const { InMemoryBankRepository } = require("./repositories/in-memory-bank.repository");
const { EntityService } = require("./services/entity.service");
const { TransferService } = require("./services/transfer.service");
const { RemittanceService } = require("./services/remittance.service");
const { ComplianceService } = require("./services/compliance.service");

function createContainer() {
  const repository = new InMemoryBankRepository(seed);
  const entityService = new EntityService(repository);
  const transferService = new TransferService(repository);
  const remittanceService = new RemittanceService(repository);
  const complianceService = new ComplianceService(repository, transferService, remittanceService);

  return {
    repository,
    entityService,
    transferService,
    remittanceService,
    complianceService
  };
}

module.exports = { createContainer };
