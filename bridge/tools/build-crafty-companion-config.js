const crypto = require("node:crypto");
const fs = require("node:fs");

const SOURCE = "LD_Bylok_2026-07-12-1554_custom_config.companionconfig";
const OUTPUT = "LD_Bylok_2026-07-12-1554_CRAFTY_TEST.companionconfig";
const PAGE_ID = "99";
const BRIDGE = "http://127.0.0.1:4587";

function id() {
  return crypto.randomBytes(12).toString("base64url");
}

function value(v) {
  return { value: v, isExpression: false };
}

function shellCommand(endpoint, body) {
  const bodyArg = body
    ? ` -ContentType 'application/json' -Body '${JSON.stringify(body).replace(/'/g, "''")}'`
    : "";
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-RestMethod -Method Post -Uri '${BRIDGE}${endpoint}'${bodyArg} | Out-Null"`;
}

function getCommand(endpoint) {
  return `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-RestMethod -Method Get -Uri '${BRIDGE}${endpoint}' | Out-Null"`;
}

function shellAction(command) {
  return {
    id: id(),
    definitionId: "exec",
    connectionId: "internal",
    options: {
      path: value(command),
      cwd: value(""),
      timeout: value(5000),
      targetVariable: value(""),
    },
    type: "action",
    children: {},
  };
}

function textLayer(text, fontSize = 92) {
  return {
    id: "text0",
    name: "Text",
    usage: "auto",
    type: "text",
    enabled: value(true),
    opacity: value(100),
    x: value(0),
    y: value(0),
    width: value(100),
    height: value(100),
    rotation: value(0),
    text: value(text),
    color: value(16777215),
    halign: value("center"),
    valign: value("center"),
    fontsize: value(fontSize),
    fontsizeAllowShrink: value(true),
    font: value("companion-sans"),
    outlineColor: value(4278190080),
  };
}

function makeButton(label, command, color, fontSize) {
  return {
    type: "button-layered",
    style: {
      layers: [
        {
          id: "canvas",
          name: "Canvas",
          usage: "auto",
          type: "canvas",
          decoration: value("border"),
          showStatusIcons: value("default"),
        },
        {
          id: "box0",
          name: "Background",
          usage: "auto",
          type: "box",
          enabled: value(true),
          opacity: value(100),
          x: value(0),
          y: value(0),
          width: value(100),
          height: value(100),
          rotation: value(0),
          color: value(color),
          borderWidth: value(0),
          borderColor: value(0),
          borderPosition: value("inside"),
        },
        textLayer(label, fontSize),
      ],
    },
    options: {
      stepProgression: "auto",
      stepExpression: "",
      rotaryActions: false,
      canModifyStyleInApis: false,
      notes: "Crafty+ bridge test button",
    },
    feedbacks: [],
    steps: {
      0: {
        action_sets: {
          down: [shellAction(command)],
          up: [],
        },
        options: {
          runWhileHeld: [],
        },
      },
    },
    localVariables: [],
  };
}

const config = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const page = config.pages[PAGE_ID];
if (!page) {
  throw new Error(`Page ${PAGE_ID} not found`);
}

page.name = "CRAFTY+ TEST";
page.gridSize = { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 };
page.controls = {
  0: {
    0: makeButton("CRAFTY+\nCONNECT", shellCommand("/commands/connect"), 0x0f5f2f, 70),
    1: makeButton("DISCONNECT", shellCommand("/commands/disconnect"), 0x5c1c1c, 76),
    2: makeButton("REFRESH", shellCommand("/refresh"), 0x24496f, 86),
    3: makeButton("SNAPSHOT", getCommand("/snapshot"), 0x333333, 82),
    4: makeButton("INFO", getCommand("/device-info"), 0x333333, 96),
    5: makeButton("BOOST", shellCommand("/commands/boost"), 0x8a4b00, 94),
    6: makeButton("STOP", shellCommand("/commands/stop"), 0x7a1010, 100),
    7: makeButton("HEALTH", getCommand("/health"), 0x293241, 88),
  },
  1: {
    0: makeButton("180 C", shellCommand("/commands/preset", { temperatureC: 180 }), 0x164e63, 96),
    1: makeButton("185 C", shellCommand("/commands/preset", { temperatureC: 185 }), 0x164e63, 96),
    2: makeButton("190 C", shellCommand("/commands/preset", { temperatureC: 190 }), 0x164e63, 96),
    3: makeButton("195 C", shellCommand("/commands/preset", { temperatureC: 195 }), 0x164e63, 96),
    4: makeButton("200 C", shellCommand("/commands/preset", { temperatureC: 200 }), 0x164e63, 96),
    5: makeButton("TARGET\n185 C", shellCommand("/commands/set-target-temperature", { temperatureC: 185 }), 0x394867, 72),
    6: makeButton("HEATER\nON", shellCommand("/commands/heater-on"), 0x256d1b, 78),
    7: makeButton("HEATER\nOFF", shellCommand("/commands/heater-off"), 0x6d1b1b, 78),
  },
  2: {
    0: makeButton("BAT\n25%", shellCommand("/commands/set-battery", { batteryPercent: 25 }), 0x4b5563, 78),
    1: makeButton("BAT\n50%", shellCommand("/commands/set-battery", { batteryPercent: 50 }), 0x4b5563, 78),
    2: makeButton("BAT\n75%", shellCommand("/commands/set-battery", { batteryPercent: 75 }), 0x4b5563, 78),
    3: makeButton("BAT\n100%", shellCommand("/commands/set-battery", { batteryPercent: 100 }), 0x4b5563, 72),
  },
  3: {},
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(config, null, "\t")}\n`);
console.log(OUTPUT);
