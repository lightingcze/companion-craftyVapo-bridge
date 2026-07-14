const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = require(path.join(root, "package.json"));
const manifest = require(path.join(root, "companion", "manifest.json"));

const requiredFiles = [
  "LICENSE",
  "README.md",
  "FINAL_SUBMISSION_AUDIT.md",
  "package.json",
  "package-lock.json",
  "src/main.js",
  "companion/manifest.json",
  "companion/HELP.md",
  "OFFICIAL_RELEASE_CHECKLIST.md",
  "PUBLISHING.md",
  "SUBMISSION_STATUS.md",
  ".github/workflows/ci.yml",
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  "tools/create-handoff-folder.js",
  "tools/create-public-repo-source.js",
  "tools/set-public-repo.js",
  "tools/write-release-manifest.js",
];

const bannedSourceStrings = [
  "node:child_process",
  "spawn(",
  "bridge_start",
  "bridge_stop",
  "bridge_restart",
  "bridgeControlEnabled",
  "autoStartBridge",
  "bridge_control_enabled",
  "C:\\Users\\ondra",
  "crafty iphone",
  "\"repository\":\"local",
  "\"bugs\":\"local",
  "0.1.14",
];

function fail(message) {
  console.error(`release audit failed: ${message}`);
  process.exitCode = 1;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`missing required file: ${file}`);
  }
}

if (packageJson.version !== manifest.version) {
  fail(`package/manifest version mismatch: ${packageJson.version} !== ${manifest.version}`);
}

if (manifest.runtime?.type !== "node22") {
  fail(`unexpected runtime type: ${manifest.runtime?.type}`);
}

if (manifest.runtime?.api !== "nodejs-ipc") {
  fail(`unexpected runtime api: ${manifest.runtime?.api}`);
}

if (manifest.runtime?.apiVersion !== "2.0.4") {
  fail(`unexpected runtime apiVersion: ${manifest.runtime?.apiVersion}`);
}

const permissions = manifest.runtime?.permissions || {};
for (const key of ["child-process", "filesystem", "native-addons", "worker-threads", "insecure-algorithms"]) {
  if (permissions[key] === true) {
    fail(`runtime permission should not be enabled for official package: ${key}`);
  }
}

for (const file of ["src/main.js", "companion/manifest.json", "companion/HELP.md", "README.md"]) {
  const text = read(file);
  for (const needle of bannedSourceStrings) {
    if (text.includes(needle)) {
      fail(`${file} contains banned release string: ${needle}`);
    }
  }
}

if (String(manifest.repository || "").includes("REPLACE-ME")) {
  console.warn("release audit warning: manifest.repository still uses REPLACE-ME placeholder");
  if (process.argv.includes("--strict")) {
    fail("manifest.repository must be replaced before public submission");
  }
}

if (String(manifest.bugs || "").includes("REPLACE-ME")) {
  console.warn("release audit warning: manifest.bugs still uses REPLACE-ME placeholder");
  if (process.argv.includes("--strict")) {
    fail("manifest.bugs must be replaced before public submission");
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`release audit passed for ${manifest.id} ${manifest.version}`);
