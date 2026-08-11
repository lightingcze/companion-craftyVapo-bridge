const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { CraftyBleBridge, normalizePeripheralId } = require("./craftyBle");
const packageJson = require("../package.json");

const PORT = Number(process.env.CRAFTY_BRIDGE_PORT || 4587);
const HOST = process.env.CRAFTY_BRIDGE_HOST || "127.0.0.1";
const STATE_FILE = process.env.CRAFTY_BRIDGE_STATE_FILE
  ? path.resolve(process.env.CRAFTY_BRIDGE_STATE_FILE)
  : path.join(__dirname, "..", "crafty-session-state.json");
const CONFIG_FILE = process.env.CRAFTY_BRIDGE_CONFIG_FILE
  ? path.resolve(process.env.CRAFTY_BRIDGE_CONFIG_FILE)
  : path.join(__dirname, "..", "crafty-bridge-config.json");
const REQUEST_BODY_LIMIT_BYTES = 64 * 1024;
const ALLOWED_ORIGINS = new Set(
  String(process.env.CRAFTY_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const state = {
  deviceName: "Crafty+",
  connected: false,
  batteryPercent: null,
  currentTemperatureC: null,
  targetTemperatureC: null,
  boostTemperatureC: null,
  heaterOn: false,
  boostMode: false,
  superboostMode: false,
  setpointReached: false,
  deviceActive: false,
  charging: null,
  usageHours: null,
  usageMinutes: null,
  lastUpdated: null,
  statusMessage: "idle",
  ble: null,
  deviceInfo: null,
};

const defaultPresets = [180, 185, 190, 195, 200];
const capsule = loadCapsuleState();
const bridgeConfig = loadBridgeConfig();

const capabilities = {
  bridgeName: "crafty-companion-winbridge",
  version: packageJson.version,
  transport: "http",
  companionFriendly: true,
  actions: [
    "refresh",
    "connect",
    "disconnect",
    "heater-on",
    "heater-off",
    "set-target-temperature",
    "set-boost-temperature",
    "temperature-step",
    "boost",
    "stop",
    "preset",
    "set-temperature",
    "set-battery",
    "capsule-new",
    "capsule-reset",
    "capsule-pause",
    "capsule-resume",
    "capsule-adjust",
    "capsule-set-remaining",
    "scan-devices",
    "stop-scan",
    "select-device",
    "select-known-device",
    "clear-device-selection",
    "configure-device",
    "forget-known-devices",
    "bridge-shutdown",
  ],
};

const events = [];

function nowIso() {
  return new Date().toISOString();
}

function pushEvent(type, details) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: nowIso(),
    type,
    details: details || {},
  };

  events.unshift(entry);
  if (events.length > 200) {
    events.length = 200;
  }

  state.lastUpdated = entry.ts;
  return entry;
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  };
  if (res.craftyCorsOrigin) {
    headers["Access-Control-Allow-Origin"] = res.craftyCorsOrigin;
    headers.Vary = "Origin";
  }
  res.writeHead(statusCode, headers);
  res.end(payload);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > REQUEST_BODY_LIMIT_BYTES) {
        settled = true;
        const error = new Error("Request body too large");
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        const parseError = new Error("Invalid JSON body");
        parseError.statusCode = 400;
        reject(parseError);
      }
    });
    req.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function updateState(patch) {
  Object.assign(state, patch);
  state.lastUpdated = nowIso();
}

function loadBridgeConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return {
      preferredPeripheralId: parsed.preferredPeripheralId
        ? normalizePeripheralId(parsed.preferredPeripheralId)
        : null,
      matchNamePattern: String(parsed.matchNamePattern || "").trim() ||
        "crafty|storz\\s*&\\s*bickel|storz&bickel",
      knownDevices: Array.isArray(parsed.knownDevices) ? parsed.knownDevices : [],
    };
  } catch {
    return {
      preferredPeripheralId: null,
      matchNamePattern: "crafty|storz\\s*&\\s*bickel|storz&bickel",
      knownDevices: [],
    };
  }
}

function saveBridgeConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(bridgeConfig, null, 2));
}

function updateBridgeConfig(patch) {
  if (Object.hasOwn(patch, "preferredPeripheralId")) {
    bridgeConfig.preferredPeripheralId = patch.preferredPeripheralId
      ? normalizePeripheralId(patch.preferredPeripheralId)
      : null;
  }

  if (Object.hasOwn(patch, "matchNamePattern")) {
    bridgeConfig.matchNamePattern = String(patch.matchNamePattern || "").trim() ||
      "crafty|storz\\s*&\\s*bickel|storz&bickel";
  }

  saveBridgeConfig();
  bridge.setDeviceFilter(bridgeConfig);
  return bridgeConfig;
}

function rememberKnownDevices(devices = []) {
  const existing = new Map(
    (bridgeConfig.knownDevices || []).map((device) => [normalizePeripheralId(device.id), device]),
  );

  for (const device of devices) {
    const id = normalizePeripheralId(device.id || device.address);
    if (!id) {
      continue;
    }

    existing.set(id, {
      id,
      address: device.address || null,
      name: device.name || existing.get(id)?.name || null,
      rssi: device.rssi ?? existing.get(id)?.rssi ?? null,
      serviceUuids: device.serviceUuids || existing.get(id)?.serviceUuids || [],
      firstSeenAt: existing.get(id)?.firstSeenAt || device.lastSeenAt || nowIso(),
      lastSeenAt: device.lastSeenAt || nowIso(),
    });
  }

  bridgeConfig.knownDevices = Array.from(existing.values())
    .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1))
    .slice(0, 50);
  saveBridgeConfig();
}

function loadCapsuleState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    return {
      active: Boolean(parsed.active),
      paused: Boolean(parsed.paused),
      startedAt: parsed.startedAt || null,
      updatedAt: parsed.updatedAt || null,
      maxSeconds: Number(parsed.maxSeconds) || 480,
      spentSeconds: Number(parsed.spentSeconds) || 0,
      lastSampleAt: null,
      label: parsed.label || "Capsule",
    };
  } catch {
    return {
      active: false,
      paused: false,
      startedAt: null,
      updatedAt: null,
      maxSeconds: 480,
      spentSeconds: 0,
      lastSampleAt: null,
      label: "Capsule",
    };
  }
}

function saveCapsuleState() {
  const payload = {
    active: capsule.active,
    paused: capsule.paused,
    startedAt: capsule.startedAt,
    updatedAt: capsule.updatedAt,
    maxSeconds: capsule.maxSeconds,
    spentSeconds: capsule.spentSeconds,
    label: capsule.label,
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2));
}

function updateCapsuleUsage() {
  const now = Date.now();
  if (!capsule.lastSampleAt) {
    capsule.lastSampleAt = now;
    return;
  }

  const deltaSeconds = Math.max(0, Math.min(30, (now - capsule.lastSampleAt) / 1000));
  capsule.lastSampleAt = now;

  if (!capsule.active || capsule.paused || deltaSeconds <= 0) {
    return;
  }

  const current = Number(state.currentTemperatureC);
  const target = Number(state.targetTemperatureC);
  const usefulTemperature = Number.isFinite(current) ? current : target;
  if (!Number.isFinite(usefulTemperature) || usefulTemperature < 80) {
    return;
  }

  const temperatureFactor = Math.min(1.8, Math.max(0.25, (usefulTemperature - 80) / 100));
  const activeFactor = state.heaterOn || state.deviceActive ? 1 : 0.45;
  const readyFactor = state.setpointReached ? 1.15 : 1;
  capsule.spentSeconds = Math.min(
    capsule.maxSeconds,
    capsule.spentSeconds + deltaSeconds * temperatureFactor * activeFactor * readyFactor,
  );
  capsule.updatedAt = nowIso();
}

function capsuleSnapshot() {
  const maxSeconds = Math.max(1, Number(capsule.maxSeconds) || 480);
  const spentSeconds = Math.max(0, Math.min(maxSeconds, Number(capsule.spentSeconds) || 0));
  const usedPercent = Math.round((spentSeconds / maxSeconds) * 100);
  const remainingPercent = Math.max(0, 100 - usedPercent);
  const remainingSeconds = Math.max(0, Math.round(maxSeconds - spentSeconds));
  const stateName = !capsule.active
    ? "inactive"
    : capsule.paused
      ? "paused"
      : remainingPercent <= 0
        ? "spent"
        : remainingPercent <= 20
          ? "nearly spent"
          : remainingPercent <= 45
            ? "fading"
            : remainingPercent <= 75
              ? "good"
              : "fresh";
  const barCount = Math.max(0, Math.min(5, Math.ceil(remainingPercent / 20)));
  const bar = `${"#".repeat(barCount)}${"-".repeat(5 - barCount)}`;

  return {
    active: capsule.active,
    paused: capsule.paused,
    label: capsule.label,
    startedAt: capsule.startedAt,
    updatedAt: capsule.updatedAt,
    maxSeconds,
    maxMinutes: Math.round(maxSeconds / 60),
    spentSeconds: Math.round(spentSeconds),
    remainingSeconds,
    usedPercent,
    remainingPercent,
    state: stateName,
    bar,
    display: `CAPSULE\n${remainingPercent}% ${bar}\n${stateName}`,
  };
}

function queueBleCommand(res, type, task, details = {}) {
  updateState({
    statusMessage: `${type} queued`,
  });
  pushEvent(`${type}_queued`, details);

  Promise.resolve()
    .then(task)
    .then((snapshot) => {
      updateState({
        statusMessage: `${type} done`,
      });
      pushEvent(type, {
        ...details,
        snapshot,
      });
    })
    .catch((error) => {
      updateState({
        statusMessage: error.message,
      });
      pushEvent(`${type}_error`, {
        ...details,
        message: error.message,
      });
    });

  sendJson(res, 202, {
    ok: true,
    accepted: true,
    message: `${type} queued`,
    state,
  });
}

function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function calculateDerivedState() {
  const current = Number(state.currentTemperatureC);
  const target = Number(state.targetTemperatureC);
  const battery = Number(state.batteryPercent);
  const usageHours = Number(state.usageHours);
  const usageMinutes = Number(state.usageMinutes);
  const rssi = Number(state.ble?.rssi);
  const hasBattery = state.connected && Number.isFinite(battery);
  const hasCurrent = state.connected && Number.isFinite(current);
  const hasTarget = state.connected && Number.isFinite(target);

  const temperatureDeltaC =
    hasCurrent && hasTarget
      ? Math.round((target - current) * 10) / 10
      : null;
  const heatProgressPercent =
    hasCurrent && hasTarget && target > 0
      ? Math.min(100, Math.max(0, Math.round((current / target) * 100)))
      : null;
  const usageTotalMinutes =
    Number.isFinite(usageHours) || Number.isFinite(usageMinutes)
      ? (Number.isFinite(usageHours) ? usageHours * 60 : 0) +
        (Number.isFinite(usageMinutes) ? usageMinutes : 0)
      : null;
  const signalQuality =
    Number.isFinite(rssi)
      ? rssi >= -60
        ? "excellent"
        : rssi >= -75
          ? "good"
          : rssi >= -90
            ? "weak"
            : "poor"
      : "";
  const batteryState =
    hasBattery
      ? battery <= 15
        ? "critical"
        : battery <= 30
          ? "low"
          : battery >= 80
            ? "high"
            : "ok"
      : "";
  const heatState = !state.connected
    ? "disconnected"
    : state.heaterOn || state.deviceActive
      ? temperatureDeltaC !== null && temperatureDeltaC <= 2
        ? "ready"
        : "heating"
      : "idle";
  const deviceState = !state.connected
    ? "DISCONNECTED"
    : state.charging
      ? "CHARGING"
      : heatState === "ready"
        ? "READY"
        : heatState === "heating"
          ? "HEATING"
          : "IDLE";
  const batteryBars = Number.isFinite(battery)
    ? Math.max(0, Math.min(5, Math.ceil(battery / 20)))
    : 0;
  const batteryBar = hasBattery
    ? `${"#".repeat(batteryBars)}${"-".repeat(5 - batteryBars)}`
    : "";
  const currentText = hasCurrent ? `${current.toFixed(1)} C` : "--.- C";
  const targetText = hasTarget ? `${target} C` : "--- C";
  const deltaText = temperatureDeltaC === null
    ? "--.- C"
    : temperatureDeltaC > 0
      ? `+${temperatureDeltaC.toFixed(1)} C`
      : `${temperatureDeltaC.toFixed(1)} C`;
  const progressText = heatProgressPercent === null ? "--%" : `${heatProgressPercent}%`;
  const batteryText = hasBattery ? `${battery}%` : "--%";
  const capsuleInfo = capsuleSnapshot();
  const selectedDevice = state.ble?.preferredPeripheralId || state.ble?.peripheralId || null;
  const selectedDeviceShort = selectedDevice
    ? `${String(selectedDevice).slice(0, 6)}...`
    : "auto";
  const statusShort = state.connected
    ? `${deviceState}\n${currentText}\nBAT ${batteryText}`
    : `OFFLINE\nBLE ${signalQuality || "--"}\n${selectedDeviceShort}`;
  const temperatureShort = state.connected
    ? `NOW ${currentText}\nSET ${targetText}\n${progressText}`
    : "TEMP\n--.- C\noffline";
  const batteryShort = state.connected
    ? `BAT ${batteryText}\n${batteryBar}\n${batteryState || "unknown"}`
    : "BAT\n--%\noffline";
  const bleShort = `${signalQuality || "--"}\n${Number.isFinite(rssi) ? rssi : "--"}\n${selectedDeviceShort}`;

  return {
    temperatureDeltaC,
    heatProgressPercent,
    usageTotalMinutes,
    usageText: usageTotalMinutes === null
      ? ""
      : `${Math.floor(usageTotalMinutes / 60)}h ${usageTotalMinutes % 60}m`,
    batteryState,
    batteryBar,
    batteryDisplay: `${batteryText}\n${batteryBar}\n${batteryState || "unknown"}`,
    batteryShort,
    deviceState,
    heatState,
    temperatureDisplay: `NOW ${currentText}\nSET ${targetText}\n${deltaText} ${progressText}`,
    temperatureShort,
    statusShort,
    bleShort,
    selectedDeviceShort,
    capsule: capsuleInfo,
    capsuleDisplay: capsuleInfo.display,
    capsuleRemainingPercent: capsuleInfo.remainingPercent,
    capsuleUsedPercent: capsuleInfo.usedPercent,
    capsuleState: capsuleInfo.state,
    capsuleBar: capsuleInfo.bar,
    signalQuality,
    statusLine: [
      deviceState,
      hasCurrent ? `${current.toFixed(1)} C` : null,
      hasTarget ? `set ${target} C` : null,
      hasBattery ? `bat ${battery}%` : null,
      capsuleInfo.active ? `caps ${capsuleInfo.remainingPercent}%` : null,
      signalQuality ? `ble ${signalQuality}` : null,
    ].filter(Boolean).join(" | "),
  };
}

function snapshotState() {
  const derived = calculateDerivedState();
  return {
    bridgeName: capabilities.bridgeName,
    bridgeVersion: capabilities.version,
    deviceName: state.deviceName,
    connected: state.connected,
    batteryPercent: state.batteryPercent,
    currentTemperatureC: state.currentTemperatureC,
    targetTemperatureC: state.targetTemperatureC,
    boostTemperatureC: state.boostTemperatureC,
    heaterOn: state.heaterOn,
    boostMode: state.boostMode,
    superboostMode: state.superboostMode,
    setpointReached: state.setpointReached,
    deviceActive: state.deviceActive,
    charging: state.charging,
    usageHours: state.usageHours,
    usageMinutes: state.usageMinutes,
    lastUpdated: state.lastUpdated,
    statusMessage: state.statusMessage,
    ble: state.ble,
    deviceInfo: state.deviceInfo,
    bridgeConfig,
    seenDevices: state.ble?.seenPeripherals || [],
    knownDevices: bridgeConfig.knownDevices || [],
    selectedPeripheralId: bridgeConfig.preferredPeripheralId,
    deviceNamePattern: bridgeConfig.matchNamePattern,
    rssi: state.ble?.rssi ?? null,
    peripheralId: state.ble?.peripheralId ?? null,
    peripheralName: state.ble?.peripheralName ?? null,
    ...derived,
  };
}

const bridge = new CraftyBleBridge({
  autoScan: process.env.CRAFTY_AUTO_SCAN !== "0",
  preferredPeripheralId: bridgeConfig.preferredPeripheralId,
  matchNamePattern: bridgeConfig.matchNamePattern,
});

bridge.on("update", (bleState) => {
  state.ble = bleState;
  if (Array.isArray(bleState.seenPeripherals) && bleState.seenPeripherals.length > 0) {
    rememberKnownDevices(bleState.seenPeripherals);
  }
  state.deviceInfo = bleState.deviceInfo || state.deviceInfo;
  if (bleState.connected) {
    state.connected = true;
    state.batteryPercent = bleState.batteryPercent;
    state.currentTemperatureC = bleState.currentTemperatureC;
    state.targetTemperatureC = bleState.targetTemperatureC;
    state.boostTemperatureC = bleState.boostTemperatureC;
    state.heaterOn = bleState.heaterOn;
    state.boostMode = bleState.boostMode;
    state.superboostMode = bleState.superboostMode;
    state.setpointReached = bleState.setpointReached;
    state.deviceActive = bleState.deviceActive;
    state.charging = bleState.charging;
    state.usageHours = bleState.usageHours;
    state.usageMinutes = bleState.usageMinutes;
    state.lastUpdated = bleState.lastSeenAt;
    state.statusMessage = "ble connected";
    updateCapsuleUsage();
  } else if (!bleState.connecting) {
    state.connected = false;
    state.lastUpdated = bleState.lastSeenAt || nowIso();
    state.statusMessage = bleState.lastError || "ble disconnected";
  }
});

bridge.start().catch((error) => {
  pushEvent("bridge_start_error", { message: error.message });
  state.statusMessage = error.message;
});

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const origin = req.headers.origin;

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    sendJson(res, 403, {
      ok: false,
      error: "Browser origin is not allowed",
    });
    return;
  }

  if (origin) {
    res.craftyCorsOrigin = origin;
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > REQUEST_BODY_LIMIT_BYTES) {
    sendJson(res, 413, {
      ok: false,
      error: "Request body too large",
    });
    req.resume();
    return;
  }

  if (req.method === "OPTIONS") {
    const headers = {
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (origin) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers.Vary = "Origin";
    }
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "crafty-companion-winbridge",
      time: nowIso(),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/capabilities") {
    sendJson(res, 200, {
      ok: true,
      capabilities,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    sendJson(res, 200, {
      ok: true,
      state,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/snapshot") {
    sendJson(res, 200, {
      ok: true,
      snapshot: snapshotState(),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/device-info") {
    sendJson(res, 200, {
      ok: true,
      deviceInfo: snapshotState().deviceInfo,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    sendJson(res, 200, {
      ok: true,
      events,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/devices") {
    sendJson(res, 200, {
      ok: true,
      selectedPeripheralId: bridgeConfig.preferredPeripheralId,
      deviceNamePattern: bridgeConfig.matchNamePattern,
      devices: state.ble?.seenPeripherals || [],
      knownDevices: bridgeConfig.knownDevices || [],
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/bridge-config") {
    sendJson(res, 200, {
      ok: true,
      bridgeConfig,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/refresh") {
    queueBleCommand(res, "refresh_requested", () => bridge.refresh());
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/scan-devices") {
    try {
      const body = await readRequestBody(req);
      const durationSeconds = clampInt(body.durationSeconds ?? 15, 1, 120);
      queueBleCommand(res, "scan_devices", async () => {
        const snapshot = await bridge.startScanning();
        setTimeout(() => {
          bridge.stopScanning().catch((error) => {
            pushEvent("scan_stop_error", { message: error.message });
          });
        }, durationSeconds * 1000);
        return snapshot;
      }, { durationSeconds });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/stop-scan") {
    queueBleCommand(res, "stop_scan", () => bridge.stopScanning());
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/configure-device") {
    try {
      const body = await readRequestBody(req);
      const config = updateBridgeConfig({
        preferredPeripheralId: body.preferredPeripheralId,
        matchNamePattern: body.matchNamePattern,
      });
      pushEvent("device_configured", config);
      sendJson(res, 200, {
        ok: true,
        bridgeConfig: config,
        state: snapshotState(),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/select-device") {
    try {
      const body = await readRequestBody(req);
      const preferredPeripheralId = body.peripheralId || body.preferredPeripheralId;
      if (!preferredPeripheralId) {
        sendJson(res, 400, {
          ok: false,
          error: "peripheralId is required",
        });
        return;
      }

      const config = updateBridgeConfig({ preferredPeripheralId });
      pushEvent("device_selected", config);
      sendJson(res, 200, {
        ok: true,
        bridgeConfig: config,
        state: snapshotState(),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/select-known-device") {
    try {
      const body = await readRequestBody(req);
      const preferredPeripheralId = body.peripheralId || body.preferredPeripheralId;
      const id = normalizePeripheralId(preferredPeripheralId);
      const known = (bridgeConfig.knownDevices || []).find((device) => device.id === id);
      if (!known) {
        sendJson(res, 404, {
          ok: false,
          error: "Known device not found",
        });
        return;
      }

      const config = updateBridgeConfig({ preferredPeripheralId: id });
      pushEvent("known_device_selected", { selected: known, config });
      sendJson(res, 200, {
        ok: true,
        selected: known,
        bridgeConfig: config,
        state: snapshotState(),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/clear-device-selection") {
    const config = updateBridgeConfig({ preferredPeripheralId: null });
    pushEvent("device_selection_cleared", config);
    sendJson(res, 200, {
      ok: true,
      bridgeConfig: config,
      state: snapshotState(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/forget-known-devices") {
    bridgeConfig.knownDevices = [];
    saveBridgeConfig();
    pushEvent("known_devices_forgotten", {});
    sendJson(res, 200, {
      ok: true,
      bridgeConfig,
      state: snapshotState(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/bridge-shutdown") {
    pushEvent("bridge_shutdown_requested", {});
    sendJson(res, 202, {
      ok: true,
      accepted: true,
      message: "Bridge shutdown requested",
    });
    setTimeout(async () => {
      await bridge.stop().catch(() => {});
      process.exit(0);
    }, 250);
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/connect") {
    try {
      const snapshot = await bridge.connect();
      pushEvent("connect", { snapshot });
      sendJson(res, 200, {
        ok: true,
        state,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/read-characteristic") {
    try {
      const body = await readRequestBody(req);
      if (!body.characteristicUuid) {
        sendJson(res, 400, {
          ok: false,
          error: "characteristicUuid is required",
        });
        return;
      }

      const value = await bridge.readCharacteristic(body.characteristicUuid);
      pushEvent("characteristic_read", value);
      sendJson(res, 200, {
        ok: true,
        value,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/raw-write") {
    try {
      const body = await readRequestBody(req);
      if (!body.characteristicUuid || !body.payloadHex) {
        sendJson(res, 400, {
          ok: false,
          error: "characteristicUuid and payloadHex are required",
        });
        return;
      }

      const value = await bridge.writeCharacteristic(body.characteristicUuid, body.payloadHex, {
        withoutResponse: body.withoutResponse,
      });
      pushEvent("characteristic_written", value);
      sendJson(res, 200, {
        ok: true,
        value,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/disconnect") {
    try {
      const snapshot = await bridge.disconnect();
      pushEvent("disconnect", { snapshot });
      sendJson(res, 200, {
        ok: true,
        state,
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/boost") {
    try {
      const body = await readRequestBody(req);
      const nextBoostMode =
        typeof body.boostMode === "boolean" ? body.boostMode : !state.boostMode;

      updateState({
        boostMode: nextBoostMode,
        statusMessage: nextBoostMode ? "boost on" : "boost off",
      });
      pushEvent("boost_mode", { boostMode: nextBoostMode });
      sendJson(res, 200, {
        ok: true,
        state,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/stop") {
    queueBleCommand(res, "stop", () => bridge.turnHeaterOff());
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/heater-on") {
    queueBleCommand(res, "heater_on_requested", () => bridge.turnHeaterOn());
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/heater-off") {
    queueBleCommand(res, "heater_off_requested", () => bridge.turnHeaterOff());
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/preset") {
    try {
      const body = await readRequestBody(req);
      const temperatureC =
        clampInt(body.temperatureC, 40, 230) ??
        clampInt(defaultPresets[clampInt(body.presetIndex, 0, defaultPresets.length - 1) || 0], 40, 230);

      if (temperatureC === null) {
        sendJson(res, 400, {
          ok: false,
          error: "Provide temperatureC or presetIndex",
        });
        return;
      }

      queueBleCommand(
        res,
        "preset_selected",
        () => bridge.setTargetTemperature(temperatureC),
        { temperatureC },
      );
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/set-temperature") {
    try {
      const body = await readRequestBody(req);
      const temperatureC = clampInt(body.temperatureC, 40, 230);
      if (temperatureC === null) {
        sendJson(res, 400, {
          ok: false,
          error: "temperatureC must be a number between 40 and 230",
        });
        return;
      }

      queueBleCommand(
        res,
        "temperature_set",
        () => bridge.setTargetTemperature(temperatureC),
        { temperatureC },
      );
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/set-target-temperature") {
    try {
      const body = await readRequestBody(req);
      const temperatureC = clampInt(body.temperatureC, 40, 230);
      if (temperatureC === null) {
        sendJson(res, 400, {
          ok: false,
          error: "temperatureC must be a number between 40 and 230",
        });
        return;
      }

      queueBleCommand(
        res,
        "target_temperature_set",
        () => bridge.setTargetTemperature(temperatureC),
        { temperatureC },
      );
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/set-boost-temperature") {
    try {
      const body = await readRequestBody(req);
      const temperatureC = clampInt(body.temperatureC, 0, 210);
      if (temperatureC === null) {
        sendJson(res, 400, {
          ok: false,
          error: "temperatureC must be a number between 0 and 210",
        });
        return;
      }

      queueBleCommand(
        res,
        "boost_temperature_set",
        () => bridge.setBoostTemperature(temperatureC),
        { temperatureC },
      );
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/temperature-step") {
    try {
      const body = await readRequestBody(req);
      const stepC = clampInt(body.stepC, -50, 50);
      const baseTemperature = clampInt(state.targetTemperatureC, 40, 210);
      if (stepC === null || baseTemperature === null) {
        sendJson(res, 400, {
          ok: false,
          error: "stepC is required and target temperature must be known",
        });
        return;
      }

      const temperatureC = clampInt(baseTemperature + stepC, 40, 210);
      queueBleCommand(
        res,
        "temperature_step",
        () => bridge.setTargetTemperature(temperatureC),
        { stepC, temperatureC },
      );
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/set-battery") {
    try {
      const body = await readRequestBody(req);
      const batteryPercent = clampInt(body.batteryPercent, 0, 100);
      if (batteryPercent === null) {
        sendJson(res, 400, {
          ok: false,
          error: "batteryPercent must be a number between 0 and 100",
        });
        return;
      }

      updateState({
        batteryPercent,
        statusMessage: "battery updated",
      });
      pushEvent("battery_set", { batteryPercent });
      sendJson(res, 200, {
        ok: true,
        state,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/capsule-new") {
    try {
      const body = await readRequestBody(req);
      const maxMinutes = clampInt(body.maxMinutes ?? 8, 1, 60);
      capsule.active = true;
      capsule.paused = false;
      capsule.startedAt = nowIso();
      capsule.updatedAt = capsule.startedAt;
      capsule.maxSeconds = maxMinutes * 60;
      capsule.spentSeconds = 0;
      capsule.lastSampleAt = Date.now();
      capsule.label = String(body.label || "Capsule").slice(0, 40);
      saveCapsuleState();
      pushEvent("capsule_new", capsuleSnapshot());
      sendJson(res, 200, {
        ok: true,
        capsule: capsuleSnapshot(),
        state: snapshotState(),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/capsule-reset") {
    capsule.active = false;
    capsule.paused = false;
    capsule.startedAt = null;
    capsule.updatedAt = nowIso();
    capsule.spentSeconds = 0;
    capsule.lastSampleAt = null;
    saveCapsuleState();
    pushEvent("capsule_reset", capsuleSnapshot());
    sendJson(res, 200, {
      ok: true,
      capsule: capsuleSnapshot(),
      state: snapshotState(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/capsule-pause") {
    updateCapsuleUsage();
    capsule.paused = true;
    capsule.updatedAt = nowIso();
    saveCapsuleState();
    pushEvent("capsule_pause", capsuleSnapshot());
    sendJson(res, 200, {
      ok: true,
      capsule: capsuleSnapshot(),
      state: snapshotState(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/capsule-resume") {
    capsule.active = true;
    capsule.paused = false;
    capsule.updatedAt = nowIso();
    capsule.lastSampleAt = Date.now();
    saveCapsuleState();
    pushEvent("capsule_resume", capsuleSnapshot());
    sendJson(res, 200, {
      ok: true,
      capsule: capsuleSnapshot(),
      state: snapshotState(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/capsule-adjust") {
    try {
      const body = await readRequestBody(req);
      const minutes = clampInt(body.minutes, -60, 60);
      if (minutes === null) {
        sendJson(res, 400, {
          ok: false,
          error: "minutes must be a number between -60 and 60",
        });
        return;
      }

      updateCapsuleUsage();
      capsule.active = true;
      capsule.spentSeconds = Math.max(
        0,
        Math.min(capsule.maxSeconds, capsule.spentSeconds + minutes * 60),
      );
      capsule.updatedAt = nowIso();
      capsule.lastSampleAt = Date.now();
      saveCapsuleState();
      pushEvent("capsule_adjust", { minutes, capsule: capsuleSnapshot() });
      sendJson(res, 200, {
        ok: true,
        capsule: capsuleSnapshot(),
        state: snapshotState(),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/commands/capsule-set-remaining") {
    try {
      const body = await readRequestBody(req);
      const remainingPercent = clampInt(body.remainingPercent, 0, 100);
      if (remainingPercent === null) {
        sendJson(res, 400, {
          ok: false,
          error: "remainingPercent must be a number between 0 and 100",
        });
        return;
      }

      capsule.active = true;
      capsule.paused = false;
      capsule.spentSeconds = capsule.maxSeconds * ((100 - remainingPercent) / 100);
      capsule.updatedAt = nowIso();
      capsule.lastSampleAt = Date.now();
      saveCapsuleState();
      pushEvent("capsule_set_remaining", { remainingPercent, capsule: capsuleSnapshot() });
      sendJson(res, 200, {
        ok: true,
        capsule: capsuleSnapshot(),
        state: snapshotState(),
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error.message,
      });
    }
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: "Not found",
  });
}

pushEvent("service_started", {
  port: PORT,
  host: HOST,
});

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    pushEvent("request_error", { message: error.message });
    sendJson(res, error.statusCode || 500, {
      ok: false,
      error: error.message,
    });
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Crafty bridge is already running on http://${HOST}:${PORT}`);
    console.error("Stop it with: npm run stop");
    process.exit(1);
  }

  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Crafty bridge listening on http://${HOST}:${PORT}`);
});

process.on("SIGINT", async () => {
  await bridge.stop().catch(() => {});
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await bridge.stop().catch(() => {});
  process.exit(0);
});
