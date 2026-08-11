const fs = require("node:fs");
const path = require("node:path");

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
  console.error("Usage: node tools/patch-companion-config.js <input.companionconfig> <output.companionconfig>");
  process.exit(2);
}

const config = JSON.parse(fs.readFileSync(input, "utf8"));
const instances = config.instances || {};
let patched = 0;

for (const instance of Object.values(instances)) {
  if (instance.moduleId !== "crafty-bridge") continue;

  instance.moduleVersionId = "0.1.14";
  instance.updatePolicy = "beta";
  instance.enabled = true;
  instance.config = {
    ...(instance.config || {}),
    bridgeUrl: "http://127.0.0.1:4587",
    pollMs: 1000,
    preferredPeripheralId: "f4b8981f1f72",
    deviceSelectionMode: "manual",
    preferredKnownDevice: "f4b8981f1f72",
    matchNamePattern: "crafty|storz\\s*&\\s*bickel|storz&bickel",
    scanOnConnectionSetup: false,
    connectAfterConnectionSetup: false,
    bridgeControlEnabled: false,
    autoStartBridge: false,
    connectionSetupScanSeconds: 10,
  };
  patched += 1;
}

if (patched === 0) {
  console.error("No crafty-bridge instance found");
  process.exit(1);
}

fs.writeFileSync(output, `${JSON.stringify(config, null, "\t")}\n`);
console.log(`Patched ${patched} crafty-bridge instance(s)`);
console.log(path.resolve(output));
