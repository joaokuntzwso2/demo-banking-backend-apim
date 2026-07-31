"use strict";

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const { config } = require("./config");
const { createContainer } = require("./container");
const { loadOpenApiRegistry } = require("./openapi-registry");
const { requestContext } = require("./middleware/request-context");
const { requestLogger } = require("./middleware/request-logger");
const { notFoundHandler, errorHandler } = require("./middleware/error-handler");
const { createHealthRouter } = require("./routes/health.routes");
const { createAdminRouter } = require("./routes/admin.routes");
const { createCustomerRouter } = require("./routes/customer.routes");
const { createAccountRouter } = require("./routes/account.routes");
const { createCardRouter } = require("./routes/card.routes");
const { createTransferRouter } = require("./routes/transfer.routes");
const { createRemittanceRouter } = require("./routes/remittance.routes");
const { createComplianceRouter } = require("./routes/compliance.routes");

function createApp(overrides = {}) {
  const dependencies = overrides.container || createContainer();
  const app = express();
  const openApiRegistry = loadOpenApiRegistry(path.resolve(__dirname, "../openapi"));

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(requestContext);
  app.use(requestLogger);
  app.use(express.json({ limit: "1mb", strict: true }));

  app.get("/", (req, res) => {
    res.json({
      data: {
        service: config.serviceName,
        version: config.serviceVersion,
        description: "Digital banking domain simulator for WSO2 API Manager demos",
        documentation: "/docs",
        aggregateContract: "/openapi.yaml",
        contextContracts: "/openapi"
      },
      meta: { correlationId: req.context.correlationId }
    });
  });

  app.get("/openapi.yaml", (_req, res) =>
    res.type("application/yaml").send(openApiRegistry.aggregate.text)
  );
  app.get("/openapi", (req, res) => {
    res.json({
      data: openApiRegistry.list(),
      meta: { correlationId: req.context.correlationId }
    });
  });
  app.get("/openapi/:slug.yaml", (req, res, next) => {
    const contract = openApiRegistry.get(req.params.slug);
    if (!contract) return next();
    return res.type("application/yaml").send(contract.text);
  });
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiRegistry.aggregate.document, { explorer: true })
  );
  app.use(createHealthRouter(dependencies.repository));
  app.use("/admin", createAdminRouter(dependencies.repository));
  app.use("/v1/customers", createCustomerRouter(dependencies.entityService));
  app.use("/v1/accounts", createAccountRouter(dependencies.entityService));
  app.use("/v1/cards", createCardRouter(dependencies.entityService));
  app.use("/v1/transfers", createTransferRouter(dependencies.transferService));
  app.use("/v1/remittances", createRemittanceRouter(dependencies.remittanceService));
  app.use("/v1/compliance", createComplianceRouter(dependencies.complianceService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  app.locals.dependencies = dependencies;
  return app;
}

module.exports = { createApp };
