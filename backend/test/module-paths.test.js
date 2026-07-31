"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const backendRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(backendRoot, "src");
const relativeRequirePattern = /require\(["'](\.[^"']*)["']\)/g;

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

function resolvesRelativeModule(sourceFile, request) {
  const target = path.resolve(path.dirname(sourceFile), request);
  return [target, `${target}.js`, path.join(target, "index.js")].some((candidate) => fs.existsSync(candidate));
}

test("all relative CommonJS imports resolve to local modules", () => {
  const broken = [];

  for (const sourceFile of javascriptFiles(sourceRoot)) {
    const source = fs.readFileSync(sourceFile, "utf8");
    for (const match of source.matchAll(relativeRequirePattern)) {
      if (!resolvesRelativeModule(sourceFile, match[1])) {
        broken.push(`${path.relative(backendRoot, sourceFile)} -> ${match[1]}`);
      }
    }
  }

  assert.deepEqual(broken, [], `Broken relative imports:\n${broken.join("\n")}`);
});
