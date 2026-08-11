const crypto = require("node:crypto");
const fs = require("node:fs");

const SOURCE = process.argv[2] || "aktulni_LD_Bylok_2026-07-12-1713_custom_config.companionconfig";
const OUTPUT =
  process.argv[3] || SOURCE.replace(/\.companionconfig$/i, "_CRAFTY_MODULE_FEEDBACK.companionconfig");
const PAGE_ID = "99";
const DEFAULT_INSTANCE_ID = "craftyBridgeLocal";
const LABEL = "crafty-bridge";

function id() {
  return crypto.randomBytes(12).toString("base64url");
}

function value(v) {
  return { value: v, isExpression: false };
}

function action(definitionId, options = {}) {
  return {
    id: id(),
    definitionId,
    connectionId: getInstanceId(),
    options,
    type: "action",
    children: {},
  };
}

function override(elementId, elementProperty, overrideValue) {
  return {
    overrideId: id(),
    elementId,
    elementProperty,
    override: value(overrideValue),
  };
}

function feedback(definitionId, styleOverrides = [], options = {}) {
  return {
    type: "feedback",
    id: id(),
    definitionId,
    connectionId: getInstanceId(),
    options,
    disabled: false,
    isInverted: value(false),
    styleOverrides,
    children: {},
  };
}

function textLayer(text, fontSize = 88) {
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

function makeButton(label, actionDef, actionOptions, color, fontSize, feedbacks = []) {
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
      notes: "Crafty+ native module action with live feedback",
    },
    feedbacks,
    steps: {
      0: {
        action_sets: {
          down: actionDef ? [action(actionDef, actionOptions)] : [],
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

function greenFeedback(definitionId) {
  return feedback(definitionId, [
    override("box0", "color", 0x00783c),
    override("text0", "color", 0xffffff),
  ]);
}

function redFeedback(definitionId) {
  return feedback(definitionId, [
    override("box0", "color", 0x781414),
    override("text0", "color", 0xffffff),
  ]);
}

function orangeFeedback(definitionId) {
  return feedback(definitionId, [
    override("box0", "color", 0xd27800),
    override("text0", "color", 0x000000),
  ]);
}

function blueFeedback(definitionId) {
  return feedback(definitionId, [
    override("box0", "color", 0x005f82),
    override("text0", "color", 0xffffff),
  ]);
}

const config = JSON.parse(fs.readFileSync(SOURCE, "utf8"));

let instanceId = null;

function getInstanceId() {
  if (!instanceId) {
    throw new Error("Crafty instance id has not been initialized");
  }
  return instanceId;
}

const maxSortOrder = Math.max(
  0,
  ...Object.values(config.instances || {}).map((instance) => Number(instance.sortOrder || 0)),
);

config.instances = config.instances || {};
instanceId =
  Object.entries(config.instances).find(([, instance]) => instance.moduleId === "crafty-bridge")?.[0] ||
  DEFAULT_INSTANCE_ID;

config.instances[instanceId] = {
  moduleInstanceType: "connection",
  moduleId: "crafty-bridge",
  moduleVersionId: "0.1.3",
  updatePolicy: "manual",
  sortOrder: Number(config.instances[instanceId]?.sortOrder || maxSortOrder + 1),
  label: LABEL,
  isFirstInit: false,
  config: {
    bridgeUrl: "http://127.0.0.1:4587",
    pollMs: 1000,
  },
  secrets: {},
  lastUpgradeIndex: 0,
  enabled: true,
};

const page = config.pages[PAGE_ID];
if (!page) throw new Error(`Page ${PAGE_ID} not found`);

page.name = "CRAFTY+ LIVE";
page.gridSize = { minColumn: 0, maxColumn: 7, minRow: 0, maxRow: 3 };
page.controls = {
  0: {
    0: makeButton("CONNECT\n$(crafty-bridge:connected)", "connect", {}, 0x0f5f2f, 56, [
      greenFeedback("connected"),
    ]),
    1: makeButton("DISCONNECT", "disconnect", {}, 0x5c1c1c, 76, [redFeedback("disconnected")]),
    2: makeButton("REFRESH", "refresh", {}, 0x24496f, 86),
    3: makeButton("STATUS\n$(crafty-bridge:status_message)", null, {}, 0x333333, 54, [
      greenFeedback("connected"),
      redFeedback("disconnected"),
    ]),
    4: makeButton("INFO\n$(crafty-bridge:firmware)", null, {}, 0x333333, 58),
    5: makeButton("BOOST\n$(crafty-bridge:boost_mode)", "boost", {}, 0x8a4b00, 62, [
      orangeFeedback("boost_active"),
    ]),
    6: makeButton("STOP", "stop", {}, 0x7a1010, 100),
    7: makeButton("BAT\n$(crafty-bridge:battery_percent)%", null, {}, 0x293241, 64, [
      feedback("battery_low", [
        override("box0", "color", 0xbe2314),
        override("text0", "color", 0xffffff),
      ], {
        threshold: value(25),
      }),
    ]),
  },
  1: {
    0: makeButton("180 C", "preset", { temperatureC: value(180) }, 0x164e63, 96),
    1: makeButton("185 C", "preset", { temperatureC: value(185) }, 0x164e63, 96),
    2: makeButton("190 C", "preset", { temperatureC: value(190) }, 0x164e63, 96),
    3: makeButton("195 C", "preset", { temperatureC: value(195) }, 0x164e63, 96),
    4: makeButton("200 C", "preset", { temperatureC: value(200) }, 0x164e63, 96),
    5: makeButton(
      "TEMP\n$(crafty-bridge:current_temperature_c) / $(crafty-bridge:target_temperature_c) C",
      "set_target_temperature",
      { temperatureC: value(185) },
      0x394867,
      48,
      [blueFeedback("target_reached")],
    ),
    6: makeButton("HEATER\nON", "heater_on", {}, 0x256d1b, 78),
    7: makeButton("HEATER\nOFF", "heater_off", {}, 0x6d1b1b, 78),
  },
  2: {
    0: makeButton("DEVICE\n$(crafty-bridge:device_name)", null, {}, 0x4b5563, 54),
    1: makeButton("SERIAL\n$(crafty-bridge:serial_number)", null, {}, 0x4b5563, 48),
    2: makeButton("FW\n$(crafty-bridge:firmware)", null, {}, 0x4b5563, 64),
    3: makeButton("UPDATED\n$(crafty-bridge:last_updated)", null, {}, 0x4b5563, 42),
  },
  3: {},
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(config, null, "\t")}\n`);
console.log(`${OUTPUT} (${instanceId})`);
