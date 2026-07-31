"use strict";

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const AGGREGATE_FILE = "banking-platform-api.yaml";

const CONTRACTS = Object.freeze([
  {
    slug: "operations",
    fileName: "operations-api.yaml"
  },
  {
    slug: "customers",
    fileName: "customer-profile-api.yaml"
  },
  {
    slug: "accounts",
    fileName: "account-management-api.yaml"
  },
  {
    slug: "beneficiaries",
    fileName: "beneficiary-management-api.yaml"
  },
  {
    slug: "cards",
    fileName: "card-controls-api.yaml"
  },
  {
    slug: "transfers",
    fileName: "transfer-processing-api.yaml"
  },
  {
    slug: "remittances",
    fileName: "family-remittance-api.yaml"
  },
  {
    slug: "compliance",
    fileName: "compliance-case-api.yaml"
  }
]);

function findContractPath(baseDirectory, fileName) {
  const candidates = [
    path.join(baseDirectory, fileName),
    path.join(baseDirectory, "apim-import", fileName)
  ];

  const existingPath = candidates.find((candidate) =>
    fs.existsSync(candidate)
  );

  if (!existingPath) {
    throw new Error(
      `OpenAPI contract not found: ${fileName}. ` +
        `Checked: ${candidates.join(", ")}`
    );
  }

  return existingPath;
}

function readContract(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const document = YAML.parse(text);

  if (!document || typeof document !== "object") {
    throw new Error(
      `Invalid OpenAPI document: ${filePath}`
    );
  }

  if (!document.openapi && !document.swagger) {
    throw new Error(
      `Missing OpenAPI version declaration: ${filePath}`
    );
  }

  if (!document.info?.title || !document.info?.version) {
    throw new Error(
      `Missing info.title or info.version: ${filePath}`
    );
  }

  return Object.freeze({
    fileName: path.basename(filePath),
    filePath,
    text,
    document
  });
}

function deriveApimContext(document) {
  const basePath = document["x-wso2-basePath"];

  if (typeof basePath !== "string") {
    return null;
  }

  return (
    basePath.replace(
      /\/v?\d+(?:\.\d+){1,2}\/?$/,
      ""
    ) || "/"
  );
}

function loadOpenApiRegistry(baseDirectory) {
  if (!baseDirectory) {
    throw new Error(
      "An OpenAPI base directory must be provided."
    );
  }

  const aggregatePath = findContractPath(
    baseDirectory,
    AGGREGATE_FILE
  );

  const aggregate = readContract(aggregatePath);

  const contracts = new Map(
    CONTRACTS.map(({ slug, fileName }) => {
      const contractPath = findContractPath(
        baseDirectory,
        fileName
      );

      const contract = readContract(contractPath);

      return [
        slug,
        Object.freeze({
          slug,
          ...contract,
          recommendedApimContext:
            deriveApimContext(contract.document)
        })
      ];
    })
  );

  function list() {
    return Array.from(
      contracts.values(),
      (contract) => ({
        slug: contract.slug,
        fileName: contract.fileName,
        title: contract.document.info.title,
        apiTitle: contract.document.info.title,
        apiVersion: contract.document.info.version,
        recommendedApimContext:
          contract.recommendedApimContext,
        contractUrl:
          `/openapi/${contract.slug}.yaml`
      })
    );
  }

  function get(slug) {
    return contracts.get(slug);
  }

  return Object.freeze({
    aggregate,
    list,
    get
  });
}

module.exports = {
  loadOpenApiRegistry
};
