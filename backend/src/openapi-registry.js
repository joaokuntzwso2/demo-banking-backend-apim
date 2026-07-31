"use strict";

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

function readYaml(baseDirectory, fileName) {
  const filePath = path.join(baseDirectory, fileName);
  const text = fs.readFileSync(filePath, "utf8");
  return { fileName, text, document: YAML.parse(text) };
}

function loadOpenApiRegistry(baseDirectory) {
  const catalog = JSON.parse(fs.readFileSync(path.join(baseDirectory, "context-catalog.json"), "utf8"));
  const aggregate = readYaml(baseDirectory, catalog.aggregate);
  const contracts = new Map(
    catalog.contracts.map((definition) => {
      const contract = readYaml(baseDirectory, definition.fileName);
      return [definition.slug, Object.freeze({ ...definition, ...contract })];
    })
  );

  function list() {
    return Array.from(contracts.values(), ({ slug, fileName, title, document, recommendedApimContext }) => ({
      slug,
      fileName,
      title,
      apiTitle: document.info.title,
      apiVersion: document.info.version,
      recommendedApimContext,
      contractUrl: `/openapi/${slug}.yaml`
    }));
  }

  function get(slug) {
    return contracts.get(slug);
  }

  return Object.freeze({ aggregate, list, get });
}

module.exports = { loadOpenApiRegistry };
