const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: sleep } = require("node:timers/promises");
const packageJson = require("../package.json");

const port = 4591;
const baseUrl = `http://127.0.0.1:${port}`;
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "crafty-bridge-smoke-"));
const stateFile = path.join(testDataDir, "crafty-session-state.json");
const configFile = path.join(testDataDir, "crafty-bridge-config.json");

function request(path, options) {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options && options.headers ? options.headers : {}),
    },
    ...options,
  });
}

async function waitForHealth() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await request("/health");
      if (res.ok) {
        return;
      }
    } catch {
      // keep waiting
    }
    await sleep(500);
  }

  throw new Error("Bridge did not become ready in time");
}

async function main() {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CRAFTY_BRIDGE_PORT: String(port),
      CRAFTY_AUTO_SCAN: "0",
      CRAFTY_BRIDGE_STATE_FILE: stateFile,
      CRAFTY_BRIDGE_CONFIG_FILE: configFile,
      CRAFTY_ALLOWED_ORIGINS: "https://trusted.example",
    },
    stdio: "ignore",
  });

  const cleanup = async () => {
    if (!child.killed) {
      child.kill();
    }
    await sleep(250);
    fs.rmSync(testDataDir, { recursive: true, force: true });
  };

  try {
    await waitForHealth();

    const health = await request("/health");
    if (!health.ok) {
      throw new Error("health endpoint failed");
    }

    const foreignOriginRes = await request("/health", {
      headers: { Origin: "https://example.invalid" },
    });
    if (foreignOriginRes.status !== 403) {
      throw new Error("foreign browser origin should be rejected");
    }

    const trustedOriginRes = await request("/health", {
      headers: { Origin: "https://trusted.example" },
    });
    if (
      !trustedOriginRes.ok ||
      trustedOriginRes.headers.get("access-control-allow-origin") !== "https://trusted.example"
    ) {
      throw new Error("configured browser origin should be allowed");
    }

    const capabilitiesRes = await request("/capabilities");
    const capabilities = await capabilitiesRes.json();
    if (!capabilities.ok || !Array.isArray(capabilities.capabilities?.actions)) {
      throw new Error("capabilities endpoint failed");
    }
    if (capabilities.capabilities.version !== packageJson.version) {
      throw new Error("capabilities version mismatch");
    }
    for (const action of [
      "set-boost-temperature",
      "temperature-step",
      "capsule-new",
      "capsule-reset",
      "capsule-pause",
      "capsule-resume",
      "capsule-adjust",
      "capsule-set-remaining",
      "scan-devices",
      "stop-scan",
      "select-device",
      "clear-device-selection",
      "configure-device",
      "select-known-device",
      "forget-known-devices",
      "bridge-shutdown",
    ]) {
      if (!capabilities.capabilities.actions.includes(action)) {
        throw new Error(`missing capability action: ${action}`);
      }
    }

    const snapshotRes = await request("/snapshot");
    const snapshot = await snapshotRes.json();
    if (!snapshot.ok || !snapshot.snapshot) {
      throw new Error("snapshot endpoint failed");
    }
    if (snapshot.snapshot.bridgeVersion !== packageJson.version) {
      throw new Error("snapshot missing bridge version");
    }
    if (!Object.hasOwn(snapshot.snapshot, "statusLine")) {
      throw new Error("snapshot missing derived statusLine");
    }
    for (const key of ["temperatureDisplay", "batteryDisplay", "deviceState", "heatState", "batteryBar"]) {
      if (!Object.hasOwn(snapshot.snapshot, key)) {
        throw new Error(`snapshot missing derived ${key}`);
      }
    }
    for (const key of ["capsule", "capsuleDisplay", "capsuleRemainingPercent", "capsuleState"]) {
      if (!Object.hasOwn(snapshot.snapshot, key)) {
        throw new Error(`snapshot missing capsule ${key}`);
      }
    }

    const refreshRes = await request("/refresh", {
      method: "POST",
    });
    const refreshJson = await refreshRes.json();
    if (!refreshJson.ok || refreshJson.accepted !== true) {
      throw new Error("refresh command should be accepted");
    }

    const deviceInfoRes = await request("/device-info");
    const deviceInfo = await deviceInfoRes.json();
    if (!deviceInfo.ok) {
      throw new Error("device-info endpoint failed");
    }

    const bridgeConfigRes = await request("/bridge-config");
    const bridgeConfig = await bridgeConfigRes.json();
    if (!bridgeConfig.ok || !bridgeConfig.bridgeConfig) {
      throw new Error("bridge-config endpoint failed");
    }

    const devicesRes = await request("/devices");
    const devices = await devicesRes.json();
    if (!devices.ok || !Array.isArray(devices.devices) || !Array.isArray(devices.knownDevices)) {
      throw new Error("devices endpoint failed");
    }

    const configureDeviceRes = await request("/commands/configure-device", {
      method: "POST",
      body: JSON.stringify({
        preferredPeripheralId: "aa:bb:cc:dd:ee:ff",
        matchNamePattern: "crafty|test",
      }),
    });
    const configureDeviceJson = await configureDeviceRes.json();
    if (!configureDeviceJson.ok || configureDeviceJson.bridgeConfig.preferredPeripheralId !== "aabbccddeeff") {
      throw new Error("configure-device command failed");
    }

    const selectDeviceRes = await request("/commands/select-device", {
      method: "POST",
      body: JSON.stringify({ peripheralId: "11:22:33:44:55:66" }),
    });
    const selectDeviceJson = await selectDeviceRes.json();
    if (!selectDeviceJson.ok || selectDeviceJson.bridgeConfig.preferredPeripheralId !== "112233445566") {
      throw new Error("select-device command failed");
    }

    const clearDeviceRes = await request("/commands/clear-device-selection", { method: "POST" });
    const clearDeviceJson = await clearDeviceRes.json();
    if (!clearDeviceJson.ok || clearDeviceJson.bridgeConfig.preferredPeripheralId !== null) {
      throw new Error("clear-device-selection command failed");
    }

    const forgetKnownRes = await request("/commands/forget-known-devices", { method: "POST" });
    const forgetKnownJson = await forgetKnownRes.json();
    if (!forgetKnownJson.ok || forgetKnownJson.bridgeConfig.knownDevices.length !== 0) {
      throw new Error("forget-known-devices command failed");
    }

    const presetRes = await request("/commands/preset", {
      method: "POST",
      body: JSON.stringify({ temperatureC: 185 }),
    });
    const presetJson = await presetRes.json();
    if (!presetJson.ok || presetJson.accepted !== true) {
      throw new Error("preset command should be accepted in no-BLE mode");
    }

    const boostTempRes = await request("/commands/set-boost-temperature", {
      method: "POST",
      body: JSON.stringify({ temperatureC: 12 }),
    });
    const boostTempJson = await boostTempRes.json();
    if (!boostTempJson.ok || boostTempJson.accepted !== true) {
      throw new Error("set-boost-temperature command should be accepted in no-BLE mode");
    }

    const boostRes = await request("/commands/boost", {
      method: "POST",
      body: JSON.stringify({ boostMode: true }),
    });
    const boostJson = await boostRes.json();
    if (!boostJson.ok || boostJson.state.boostMode !== true) {
      throw new Error("boost command failed");
    }

    const capsuleNewRes = await request("/commands/capsule-new", {
      method: "POST",
      body: JSON.stringify({ maxMinutes: 8, label: "Test capsule" }),
    });
    const capsuleNewJson = await capsuleNewRes.json();
    if (!capsuleNewJson.ok || capsuleNewJson.capsule.remainingPercent !== 100) {
      throw new Error("capsule-new command failed");
    }

    const capsulePauseRes = await request("/commands/capsule-pause", { method: "POST" });
    const capsulePauseJson = await capsulePauseRes.json();
    if (!capsulePauseJson.ok || capsulePauseJson.capsule.paused !== true) {
      throw new Error("capsule-pause command failed");
    }

    const capsuleResetRes = await request("/commands/capsule-reset", { method: "POST" });
    const capsuleResetJson = await capsuleResetRes.json();
    if (!capsuleResetJson.ok || capsuleResetJson.capsule.active !== false) {
      throw new Error("capsule-reset command failed");
    }

    const capsuleSetRes = await request("/commands/capsule-set-remaining", {
      method: "POST",
      body: JSON.stringify({ remainingPercent: 50 }),
    });
    const capsuleSetJson = await capsuleSetRes.json();
    if (!capsuleSetJson.ok || capsuleSetJson.capsule.remainingPercent !== 50) {
      throw new Error("capsule-set-remaining command failed");
    }

    const capsuleAdjustRes = await request("/commands/capsule-adjust", {
      method: "POST",
      body: JSON.stringify({ minutes: 1 }),
    });
    const capsuleAdjustJson = await capsuleAdjustRes.json();
    if (!capsuleAdjustJson.ok || capsuleAdjustJson.capsule.remainingPercent >= 50) {
      throw new Error("capsule-adjust command failed");
    }

    const stopRes = await request("/commands/stop", {
      method: "POST",
    });
    const stopJson = await stopRes.json();
    if (!stopJson.ok || stopJson.accepted !== true) {
      throw new Error("stop command should be accepted in no-BLE mode");
    }

    const readCharRes = await request("/commands/read-characteristic", {
      method: "POST",
      body: JSON.stringify({ characteristicUuid: "00000011-4C45-4B43-4942-265A524F5453" }),
    });
    const readCharJson = await readCharRes.json();
    if (readCharJson.ok !== false) {
      throw new Error("read-characteristic should fail in no-BLE mode");
    }

    const writeCharRes = await request("/commands/raw-write", {
      method: "POST",
      body: JSON.stringify({
        characteristicUuid: "00000021-4C45-4B43-4942-265A524F5453",
        payloadHex: "00",
      }),
    });
    const writeCharJson = await writeCharRes.json();
    if (writeCharJson.ok !== false) {
      throw new Error("raw-write should fail in no-BLE mode");
    }

    const oversizedBodyRes = await request("/commands/configure-device", {
      method: "POST",
      body: JSON.stringify({ padding: "x".repeat(65 * 1024) }),
    });
    if (oversizedBodyRes.status !== 413) {
      throw new Error(
        `oversized request body should return 413, got ${oversizedBodyRes.status}: ${await oversizedBodyRes.text()}`,
      );
    }

    console.log("Smoke test passed");
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
