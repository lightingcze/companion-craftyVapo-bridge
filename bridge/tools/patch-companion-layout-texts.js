const fs = require("node:fs");
const path = require("node:path");

const input = process.argv[2];
const output = process.argv[3];

if (!input || !output) {
  console.error("Usage: node tools/patch-companion-layout-texts.js <input.companionconfig> <output.companionconfig>");
  process.exit(2);
}

const replacements = new Map([
  ["CRAFTY+\n$(crafty-bridge:current_temperature_c)/$(crafty-bridge:target_temperature_c) C\n$(crafty-bridge:battery_percent)%", "$(crafty-bridge:status_short)"],
  ["TEMP\n$(crafty-bridge:current_temperature_c) / $(crafty-bridge:target_temperature_c) C", "$(crafty-bridge:temperature_short)"],
  ["TEMP\n$(crafty-bridge:current_temperature_c) C\n$(crafty-bridge:heat_progress_percent)%", "$(crafty-bridge:temperature_short)"],
  ["BAT\n$(crafty-bridge:battery_percent)%", "$(crafty-bridge:battery_short)"],
  ["BAT\n$(crafty-bridge:battery_percent)%\n$(crafty-bridge:battery_state)", "$(crafty-bridge:battery_short)"],
  ["BLE\n$(crafty-bridge:signal_quality)\n$(crafty-bridge:rssi)", "BLE\n$(crafty-bridge:ble_short)"],
  ["BRIDGE\n$(crafty-bridge:bridge_process_status)\nv$(crafty-bridge:bridge_version)", "BRIDGE\n$(crafty-bridge:bridge_process_status)\n$(crafty-bridge:bridge_version)"],
  ["CONNECT\n$(crafty-bridge:connected)", "CONNECT\n$(crafty-bridge:connected)"],
  ["STATUS\n$(crafty-bridge:status_message)", "$(crafty-bridge:status_line)"],
]);

const config = JSON.parse(fs.readFileSync(input, "utf8"));
let replaced = 0;

function visit(value) {
  if (!value || typeof value !== "object") return;

  if (Object.hasOwn(value, "value") && typeof value.value === "string") {
    const next = replacements.get(value.value);
    if (next) {
      value.value = next;
      replaced += 1;
    }
  }

  for (const child of Object.values(value)) {
    visit(child);
  }
}

visit(config.pages);

fs.writeFileSync(output, `${JSON.stringify(config, null, "\t")}\n`);
console.log(`Updated ${replaced} button text value(s)`);
console.log(path.resolve(output));
