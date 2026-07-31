"use strict";

const { config } = require("./config");
const { createApp } = require("./app");

const app = createApp();
const server = app.listen(config.port, "0.0.0.0", () => {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    message: "service_started",
    service: config.serviceName,
    version: config.serviceVersion,
    port: config.port
  })}\n`);
});

function shutdown(signal) {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    message: "shutdown_requested",
    signal
  })}\n`);
  server.close((error) => {
    if (error) {
      process.stderr.write(`${error.stack || error}\n`);
      process.exitCode = 1;
    }
    process.exit();
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
