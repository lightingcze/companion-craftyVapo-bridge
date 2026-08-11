const EventEmitter = require("node:events");
const noble = require("@abandonware/noble");

function normalizeUuid(uuid) {
  return String(uuid).replace(/-/g, "").toLowerCase();
}

function normalizePeripheralId(id) {
  return String(id || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
}

function nowIso() {
  return new Date().toISOString();
}

function safeName(peripheral) {
  return (
    peripheral?.advertisement?.localName ||
    peripheral?.advertisement?.completeLocalName ||
    peripheral?.name ||
    null
  );
}

function decodeTemperature(data) {
  if (!data || data.length < 2) {
    return null;
  }

  return data.readUInt16LE(0) / 10;
}

function decodeBattery(data) {
  if (!data || data.length < 1) {
    return null;
  }

  return data[0];
}

function decodeUInt16(data) {
  if (!data || data.length < 2) {
    return null;
  }

  return data.readUInt16LE(0);
}

function decodeString(data) {
  if (!data) {
    return null;
  }

  const text = data.toString("utf8").replace(/\0/g, "").trim();
  return text || null;
}

function encodeTemperature(temperatureC) {
  const raw = Math.round(Number(temperatureC) * 10);
  const data = Buffer.alloc(2);
  data.writeUInt16LE(raw, 0);
  return data;
}

class CraftyBleBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    this.autoScan = options.autoScan !== false;
    this.matchNamePattern = options.matchNamePattern || "crafty|storz\\s*&\\s*bickel|storz&bickel";
    this.matchName = options.matchName || new RegExp(this.matchNamePattern, "i");
    this.preferredPeripheralId = options.preferredPeripheralId || null;
    this.serviceUuid = normalizeUuid(
      options.serviceUuid || "00000001-4C45-4B43-4942-265A524F5453"
    );
    this.currentTemperatureUuid = normalizeUuid(
      options.currentTemperatureUuid || "00000011-4C45-4B43-4942-265A524F5453"
    );
    this.targetTemperatureUuid = normalizeUuid(
      options.targetTemperatureUuid || "00000021-4C45-4B43-4942-265A524F5453"
    );
    this.boostTemperatureUuid = normalizeUuid(
      options.boostTemperatureUuid || "00000031-4C45-4B43-4942-265A524F5453"
    );
    this.batteryUuid = normalizeUuid(
      options.batteryUuid || "00000041-4C45-4B43-4942-265A524F5453"
    );
    this.service2Uuid = normalizeUuid(
      options.service2Uuid || "00000002-4C45-4B43-4942-265A524F5453"
    );
    this.service3Uuid = normalizeUuid(
      options.service3Uuid || "00000003-4C45-4B43-4942-265A524F5453"
    );
    this.statusRegisterUuid = normalizeUuid(
      options.statusRegisterUuid || "00000052-4C45-4B43-4942-265A524F5453"
    );
    this.bleVersionUuid = normalizeUuid(
      options.bleVersionUuid || "00000072-4C45-4B43-4942-265A524F5453"
    );
    this.heaterOnUuid = normalizeUuid(
      options.heaterOnUuid || "00000081-4C45-4B43-4942-265A524F5453"
    );
    this.heaterOffUuid = normalizeUuid(
      options.heaterOffUuid || "00000091-4C45-4B43-4942-265A524F5453"
    );
    this.projectStatusUuid = normalizeUuid(
      options.projectStatusUuid || "00000093-4C45-4B43-4942-265A524F5453"
    );
    this.projectStatus2Uuid = normalizeUuid(
      options.projectStatus2Uuid || "000001C3-4C45-4B43-4942-265A524F5453"
    );
    this.akkuStatusUuid = normalizeUuid(
      options.akkuStatusUuid || "00000073-4C45-4B43-4942-265A524F5453"
    );
    this.usageHoursUuid = normalizeUuid(
      options.usageHoursUuid || "00000023-4C45-4B43-4942-265A524F5453"
    );
    this.usageMinutesUuid = normalizeUuid(
      options.usageMinutesUuid || "000001E3-4C45-4B43-4942-265A524F5453"
    );

    this.state = {
      adapterState: noble.state || "unknown",
      scanning: false,
      connected: false,
      connecting: false,
      peripheralId: null,
      peripheralName: null,
      rssi: null,
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
      lastSeenAt: null,
      lastError: null,
      raw: {
        serviceUuids: [],
        currentTemperatureHex: null,
        targetTemperatureHex: null,
        boostTemperatureHex: null,
        batteryHex: null,
        statusRegisterHex: null,
        projectStatusHex: null,
        projectStatus2Hex: null,
      },
      deviceInfo: {},
      seenPeripherals: [],
      gattProfile: [],
      lastDiscoveryMatch: null,
      lastConnectAttempt: null,
    };

    this._seenPeripherals = new Map();
    this._seenPeripheralObjects = new Map();

    this.peripheral = null;
    this._booted = false;
    this._connectPromise = null;
    this._characteristics = new Map();
    this._boundStateChange = this._handleStateChange.bind(this);
    this._boundDiscover = this._handleDiscover.bind(this);
    this._boundWarning = this._handleWarning.bind(this);
    noble.on("stateChange", this._boundStateChange);
    noble.on("discover", this._boundDiscover);
    noble.on("warning", this._boundWarning);
  }

  getSnapshot() {
    return {
      ...this.state,
      preferredPeripheralId: this.preferredPeripheralId,
      matchNamePattern: this.matchNamePattern,
    };
  }

  setDeviceFilter(options = {}) {
    if (Object.hasOwn(options, "preferredPeripheralId")) {
      this.preferredPeripheralId = options.preferredPeripheralId
        ? normalizePeripheralId(options.preferredPeripheralId)
        : null;
    }

    if (Object.hasOwn(options, "matchNamePattern")) {
      const pattern = String(options.matchNamePattern || "").trim() ||
        "crafty|storz\\s*&\\s*bickel|storz&bickel";
      this.matchNamePattern = pattern;
      try {
        this.matchName = new RegExp(pattern, "i");
      } catch {
        this.matchNamePattern = "crafty|storz\\s*&\\s*bickel|storz&bickel";
        this.matchName = /crafty|storz\s*&\s*bickel|storz&bickel/i;
      }
    }

    this._update({
      preferredPeripheralId: this.preferredPeripheralId,
      matchNamePattern: this.matchNamePattern,
      lastSeenAt: nowIso(),
    });
    return this.getSnapshot();
  }

  async start() {
    this._booted = true;
    if (noble.state === "poweredOn" && this.autoScan) {
      await this.startScanning();
    }
    return this.getSnapshot();
  }

  async stop() {
    await this.stopScanning();
    await this.disconnect();
  }

  async refresh() {
    if (this.peripheral && this.state.connected) {
      await this.pollPeripheral(this.peripheral);
      return this.getSnapshot();
    }

    await this.startScanning();
    return this.getSnapshot();
  }

  async connect() {
    if (this.peripheral && this.state.connected) {
      return this.getSnapshot();
    }

    if (this.preferredPeripheralId) {
      const preferredPeripheral = this._seenPeripheralObjects.get(this.preferredPeripheralId);
      if (preferredPeripheral && !this._connectPromise) {
        this._update({
          lastConnectAttempt: {
            id: this.preferredPeripheralId,
            source: "cached preferred peripheral",
            at: nowIso(),
          },
        });
        this._connectPromise = this._connectPeripheral(preferredPeripheral).finally(() => {
          this._connectPromise = null;
        });
        await this._connectPromise;
        return this.getSnapshot();
      }
    }

    await this.startScanning();
    return this.getSnapshot();
  }

  async disconnect() {
    await this.stopScanning();
    if (!this.peripheral) {
      return this.getSnapshot();
    }

    const peripheral = this.peripheral;
    this.peripheral = null;
    try {
      await peripheral.disconnectAsync();
    } catch (error) {
      this._update({
        connected: false,
        connecting: false,
        lastError: error.message,
      });
    }

    this._update({
      connected: false,
      connecting: false,
      peripheralId: null,
      peripheralName: null,
      rssi: null,
    });

    return this.getSnapshot();
  }

  async readCharacteristic(characteristicUuid) {
    if (!this.peripheral || !this.state.connected) {
      throw new Error("Device is not connected");
    }

    const targetUuid = normalizeUuid(characteristicUuid);
    await this._ensureCharacteristics();

    const entry = this._findCharacteristic(targetUuid);
    if (!entry) {
      throw new Error(`Characteristic not found: ${characteristicUuid}`);
    }

    const data = await entry.characteristic.readAsync();
    return {
      uuid: entry.characteristic.uuid,
      serviceUuid: entry.service.uuid,
      valueHex: data ? data.toString("hex") : null,
      valueAscii: data ? data.toString("ascii") : null,
      properties: entry.characteristic.properties,
    };
  }

  async writeCharacteristic(characteristicUuid, payloadHex, options = {}) {
    if (!this.peripheral || !this.state.connected) {
      throw new Error("Device is not connected");
    }

    const targetUuid = normalizeUuid(characteristicUuid);
    const normalizedPayload = String(payloadHex || "").replace(/\s+/g, "");
    if (!normalizedPayload || normalizedPayload.length % 2 !== 0) {
      throw new Error("payloadHex must be an even-length hex string");
    }

    if (!/^[0-9a-fA-F]+$/.test(normalizedPayload)) {
      throw new Error("payloadHex must contain only hex characters");
    }

    const data = Buffer.from(normalizedPayload, "hex");
    return this._writeCharacteristic(targetUuid, data, options);
  }

  async setTargetTemperature(temperatureC) {
    const temp = Math.min(210, Math.max(40, Number(temperatureC)));
    if (!Number.isFinite(temp)) {
      throw new Error("temperatureC must be a number between 40 and 210");
    }

    const result = await this._writeCharacteristic(this.targetTemperatureUuid, encodeTemperature(temp), {
      serviceUuid: this.serviceUuid,
      withoutResponse: false,
    });
    this._update({
      targetTemperatureC: temp,
      lastSeenAt: nowIso(),
      lastError: null,
    });
    await this.pollPeripheral(this.peripheral);
    return {
      ...this.getSnapshot(),
      write: result,
    };
  }

  async setBoostTemperature(temperatureC) {
    const temp = Math.min(210, Math.max(0, Number(temperatureC)));
    if (!Number.isFinite(temp)) {
      throw new Error("temperatureC must be a number between 0 and 210");
    }

    const result = await this._writeCharacteristic(this.boostTemperatureUuid, encodeTemperature(temp), {
      serviceUuid: this.serviceUuid,
      withoutResponse: false,
    });
    this._update({
      boostTemperatureC: temp,
      lastSeenAt: nowIso(),
      lastError: null,
    });
    await this.pollPeripheral(this.peripheral);
    return {
      ...this.getSnapshot(),
      write: result,
    };
  }

  async turnHeaterOn() {
    const result = await this._writeCharacteristic(this.heaterOnUuid, Buffer.from([0x00, 0x00]), {
      serviceUuid: this.service3Uuid,
      withoutResponse: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await this.pollPeripheral(this.peripheral);
    return {
      ...this.getSnapshot(),
      write: result,
    };
  }

  async turnHeaterOff() {
    const result = await this._writeCharacteristic(this.heaterOffUuid, Buffer.from([0x00, 0x00]), {
      serviceUuid: this.service3Uuid,
      withoutResponse: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await this.pollPeripheral(this.peripheral);
    return {
      ...this.getSnapshot(),
      write: result,
    };
  }

  async startScanning() {
    if (this.state.scanning) {
      return;
    }

    if (noble.state !== "poweredOn") {
      this._update({
        lastError: `Bluetooth adapter state is ${noble.state}`,
      });
      return;
    }

    try {
      await noble.startScanningAsync([], true);
      this._update({
        scanning: true,
        lastError: null,
      });
    } catch (error) {
      this._update({
        scanning: false,
        lastError: error.message,
      });
    }
  }

  async stopScanning() {
    if (!this.state.scanning) {
      return;
    }

    try {
      await noble.stopScanningAsync();
    } catch (error) {
      this._update({
        lastError: error.message,
      });
    } finally {
      this._update({ scanning: false });
    }
  }

  async _handleStateChange(state) {
    this._update({
      adapterState: state,
      lastError: state === "poweredOn" ? null : this.state.lastError,
    });

    if (state === "poweredOn" && this._booted && this.autoScan) {
      await this.startScanning();
    }
  }

  async _handleDiscover(peripheral) {
    const name = safeName(peripheral);
    const advertisementServiceUuids = (peripheral.advertisement.serviceUuids || []).map(
      normalizeUuid
    );
    this._rememberPeripheral(peripheral, name, advertisementServiceUuids);
    const normalizedPeripheralId = normalizePeripheralId(peripheral.id);
    const matchesPreferred = this.preferredPeripheralId
      ? normalizedPeripheralId === this.preferredPeripheralId
      : false;
    const matchesName = name ? this.matchName.test(name) : false;
    const matchesService = advertisementServiceUuids.includes(this.serviceUuid);

    this._update({
      lastDiscoveryMatch: {
        id: normalizedPeripheralId,
        name,
        preferredPeripheralId: this.preferredPeripheralId,
        matchesPreferred,
        matchesName,
        matchesService,
        connectPromiseActive: Boolean(this._connectPromise),
        at: nowIso(),
      },
    });

    if (this.preferredPeripheralId && !matchesPreferred) {
      return;
    }

    if (!matchesPreferred && !matchesName && !matchesService) {
      return;
    }

    if (this._connectPromise) {
      this._update({
        lastConnectAttempt: {
          id: normalizedPeripheralId,
          source: "discover",
          skipped: "connect already active",
          at: nowIso(),
        },
      });
      return;
    }

    this._update({
      lastConnectAttempt: {
        id: normalizedPeripheralId,
        source: "discover",
        skipped: null,
        at: nowIso(),
      },
    });
    this._connectPromise = this._connectPeripheral(peripheral).finally(() => {
      this._connectPromise = null;
    });

    await this._connectPromise;
  }

  _handleWarning(message) {
    this._update({ lastError: message });
  }

  _rememberPeripheral(peripheral, name, advertisementServiceUuids) {
    const entry = {
      id: peripheral.id,
      address: peripheral.address,
      name,
      rssi: peripheral.rssi ?? null,
      connectable: peripheral.connectable ?? null,
      serviceUuids: advertisementServiceUuids,
      lastSeenAt: nowIso(),
    };

    this._seenPeripherals.set(peripheral.id, entry);
    this._seenPeripheralObjects.set(normalizePeripheralId(peripheral.id), peripheral);
    const seenPeripherals = Array.from(this._seenPeripherals.values())
      .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1))
      .slice(0, 25);

    this._update({ seenPeripherals });
  }

  async _connectPeripheral(peripheral) {
    await this.stopScanning();

    if (this.peripheral && this.peripheral.id !== peripheral.id) {
      try {
        await this.peripheral.disconnectAsync();
      } catch (error) {
        this._update({ lastError: error.message });
      }
    }

    this.peripheral = peripheral;
    this._update({
      connecting: true,
      peripheralId: peripheral.id,
      peripheralName: safeName(peripheral),
      rssi: peripheral.rssi ?? null,
      lastSeenAt: nowIso(),
    });

    peripheral.removeAllListeners("disconnect");
    peripheral.once("disconnect", () => {
      this.peripheral = null;
      this._update({
        connected: false,
        connecting: false,
        peripheralId: null,
        peripheralName: null,
        rssi: null,
        lastSeenAt: nowIso(),
      });

      if (this.autoScan) {
        this.startScanning().catch((error) => {
          this._update({ lastError: error.message });
        });
      }
    });

    try {
      await peripheral.connectAsync();
      this._update({
        connected: true,
        connecting: false,
        lastError: null,
      });
      await this.pollPeripheral(peripheral);
    } catch (error) {
      this._update({
        connected: false,
        connecting: false,
        lastError: error.message,
      });
      try {
        await peripheral.disconnectAsync();
      } catch {
        // ignore disconnect errors after failed connect
      }
      this.peripheral = null;
    }
  }

  async pollPeripheral(peripheral) {
    if (!peripheral) {
      return;
    }

    try {
      const gattProfile = await this._buildGattProfile(peripheral);
      const currentTemperature = await this._readKnownCharacteristic(this.currentTemperatureUuid, this.service2Uuid);
      const targetTemperature = await this._readKnownCharacteristic(this.targetTemperatureUuid, this.serviceUuid);
      const boostTemperature = await this._readKnownCharacteristic(this.boostTemperatureUuid, this.serviceUuid);
      const battery = await this._readKnownCharacteristic(this.batteryUuid, this.serviceUuid);
      const statusRegister = await this._readKnownCharacteristic(this.statusRegisterUuid, this.service2Uuid);
      const projectStatus = await this._readKnownCharacteristic(this.projectStatusUuid, this.service3Uuid);
      const projectStatus2 = await this._readKnownCharacteristic(this.projectStatus2Uuid, this.service3Uuid);
      const akkuStatus = await this._readKnownCharacteristic(this.akkuStatusUuid, this.service3Uuid);
      const bleVersion = await this._readKnownCharacteristic(this.bleVersionUuid, this.service2Uuid);
      const usageHours = await this._readKnownCharacteristic(this.usageHoursUuid, this.service3Uuid);
      const usageMinutes = await this._readKnownCharacteristic(this.usageMinutesUuid, this.service3Uuid);

      await this._subscribeKnown(this.currentTemperatureUuid, this.service2Uuid, (buffer) => {
        this._update({
          currentTemperatureC: decodeTemperature(buffer),
          raw: {
            currentTemperatureHex: buffer.toString("hex"),
          },
          lastSeenAt: nowIso(),
        });
      });

      await this._subscribeKnown(this.batteryUuid, this.serviceUuid, (buffer) => {
        this._update({
          batteryPercent: decodeBattery(buffer),
          raw: {
            batteryHex: buffer.toString("hex"),
          },
          lastSeenAt: nowIso(),
        });
      });

      await this._subscribeKnown(this.projectStatusUuid, this.service3Uuid, (buffer) => {
        this._update(this._decodeProjectStatus(buffer));
      });

      await this._subscribeKnown(this.projectStatus2Uuid, this.service3Uuid, (buffer) => {
        this._update(this._decodeProjectStatus2(buffer));
      });

      const decodedStatus = this._decodeStatusRegister(statusRegister);
      const decodedProjectStatus = this._decodeProjectStatus(projectStatus);
      const decodedProjectStatus2 = this._decodeProjectStatus2(projectStatus2);
      const decodedAkku = this._decodeAkkuStatus(akkuStatus);
      this._update({
        batteryPercent: battery ? decodeBattery(battery) : this.state.batteryPercent,
        currentTemperatureC: currentTemperature
          ? decodeTemperature(currentTemperature)
          : this.state.currentTemperatureC,
        targetTemperatureC: targetTemperature
          ? decodeTemperature(targetTemperature)
          : this.state.targetTemperatureC,
        boostTemperatureC: boostTemperature
          ? decodeTemperature(boostTemperature)
          : this.state.boostTemperatureC,
        usageHours: usageHours ? decodeUInt16(usageHours) : this.state.usageHours,
        usageMinutes: usageMinutes ? decodeUInt16(usageMinutes) : this.state.usageMinutes,
        lastSeenAt: nowIso(),
        lastError: null,
        ...decodedStatus,
        ...decodedProjectStatus,
        ...decodedProjectStatus2,
        ...decodedAkku,
        raw: {
          serviceUuids: gattProfile.map((service) => service.serviceUuid),
          currentTemperatureHex: currentTemperature ? currentTemperature.toString("hex") : null,
          targetTemperatureHex: targetTemperature ? targetTemperature.toString("hex") : null,
          boostTemperatureHex: boostTemperature ? boostTemperature.toString("hex") : null,
          batteryHex: battery ? battery.toString("hex") : null,
          statusRegisterHex: statusRegister ? statusRegister.toString("hex") : null,
          projectStatusHex: projectStatus ? projectStatus.toString("hex") : null,
          projectStatus2Hex: projectStatus2 ? projectStatus2.toString("hex") : null,
        },
        gattProfile,
        deviceInfo: {
          ...extractDeviceInfo(gattProfile),
          bleVersion: decodeString(bleVersion),
        },
      });
    } catch (error) {
      this._update({
        lastError: error.message,
        lastSeenAt: nowIso(),
      });
    }
  }

  async _buildGattProfile(peripheral) {
    try {
      const discovery = await peripheral.discoverAllServicesAndCharacteristicsAsync();
      const services = discovery.services || [];
      const profile = [];
      this._characteristics = new Map();

      for (const service of services) {
        const characteristics =
          service.characteristics ||
          (await service.discoverCharacteristicsAsync([]));
        for (const characteristic of characteristics) {
          this._rememberCharacteristic(service, characteristic);
        }
        profile.push({
          serviceUuid: service.uuid,
          serviceName: service.name || null,
          characteristics: await Promise.all(
            characteristics.map(async (characteristic) => {
              let valueHex = null;
              let valueAscii = null;

              if (characteristic.properties.includes("read")) {
                try {
                  const data = await characteristic.readAsync();
                  if (data) {
                    valueHex = data.toString("hex");
                    valueAscii = data.toString("ascii");
                  }
                } catch {
                  // ignore read errors on diagnostic pass
                }
              }

              return {
                uuid: characteristic.uuid,
                name: characteristic.name || null,
                properties: characteristic.properties,
                valueHex,
                valueAscii,
              };
            })
          ),
        });
      }

      return profile;
    } catch (error) {
      return [
        {
          error: error.message,
        },
      ];
    }
  }

  _rememberCharacteristic(service, characteristic) {
    const key = this._characteristicKey(characteristic.uuid, service.uuid);
    this._characteristics.set(key, { service, characteristic });

    const uuidOnlyKey = this._characteristicKey(characteristic.uuid);
    if (!this._characteristics.has(uuidOnlyKey)) {
      this._characteristics.set(uuidOnlyKey, { service, characteristic });
    }
  }

  _characteristicKey(characteristicUuid, serviceUuid = null) {
    const normalizedCharacteristic = normalizeUuid(characteristicUuid);
    const normalizedService = serviceUuid ? normalizeUuid(serviceUuid) : "";
    return `${normalizedService}:${normalizedCharacteristic}`;
  }

  async _ensureCharacteristics() {
    if (this._characteristics.size > 0) {
      return;
    }

    if (!this.peripheral) {
      throw new Error("Device is not connected");
    }

    await this._buildGattProfile(this.peripheral);
  }

  _findCharacteristic(characteristicUuid, serviceUuid = null) {
    const serviceKey = serviceUuid ? this._characteristicKey(characteristicUuid, serviceUuid) : null;
    if (serviceKey && this._characteristics.has(serviceKey)) {
      return this._characteristics.get(serviceKey);
    }

    return this._characteristics.get(this._characteristicKey(characteristicUuid)) || null;
  }

  async _readKnownCharacteristic(characteristicUuid, serviceUuid = null) {
    await this._ensureCharacteristics();
    const entry = this._findCharacteristic(characteristicUuid, serviceUuid);
    if (!entry || !entry.characteristic.properties.includes("read")) {
      return null;
    }

    try {
      return await entry.characteristic.readAsync();
    } catch (error) {
      this._update({ lastError: `read ${characteristicUuid}: ${error.message}` });
      return null;
    }
  }

  async _writeCharacteristic(characteristicUuid, data, options = {}) {
    await this._ensureCharacteristics();
    const entry = this._findCharacteristic(characteristicUuid, options.serviceUuid);
    if (!entry) {
      throw new Error(`Characteristic not found: ${characteristicUuid}`);
    }

    const properties = entry.characteristic.properties || [];
    if (!properties.includes("write") && !properties.includes("writeWithoutResponse")) {
      throw new Error(`Characteristic is not writable: ${characteristicUuid}`);
    }

    const withoutResponse =
      options.withoutResponse ?? (!properties.includes("write") && properties.includes("writeWithoutResponse"));
    await entry.characteristic.writeAsync(data, withoutResponse);
    return {
      uuid: entry.characteristic.uuid,
      serviceUuid: entry.service.uuid,
      payloadHex: data.toString("hex"),
      withoutResponse,
      properties,
    };
  }

  async _subscribeKnown(characteristicUuid, serviceUuid, handler) {
    await this._ensureCharacteristics();
    const entry = this._findCharacteristic(characteristicUuid, serviceUuid);
    if (!entry || !entry.characteristic.properties.includes("notify")) {
      return;
    }

    try {
      entry.characteristic.removeAllListeners("data");
      entry.characteristic.on("data", handler);
      await entry.characteristic.subscribeAsync();
    } catch (error) {
      this._update({ lastError: `subscribe ${characteristicUuid}: ${error.message}` });
    }
  }

  _decodeStatusRegister(data) {
    if (!data) {
      return {};
    }

    const serialText = decodeString(data);
    if (serialText && /^[A-Z0-9-]{6,}$/.test(serialText)) {
      return {
        deviceInfo: {
          ...this.state.deviceInfo,
          serialNumber: serialText,
        },
      };
    }

    let status = null;
    status = decodeUInt16(data);

    if (status === null) {
      return {};
    }

    return {
      heaterOn: Boolean(status & 0x0001),
      boostMode: Boolean(status & 0x0002),
      vibrationOnReady: Boolean(status & 0x0004),
      fahrenheitMode: Boolean(status & 0x0008),
    };
  }

  _decodeProjectStatus(data) {
    const status = decodeUInt16(data);
    if (status === null) {
      return {};
    }

    return {
      deviceActive: Boolean(status & 0x0010),
      heaterOn: Boolean(status & 0x0010),
      boostMode: Boolean(status & 0x0020),
      superboostMode: Boolean(status & 0x0040),
      lastSeenAt: nowIso(),
      raw: {
        projectStatusHex: data.toString("hex"),
      },
    };
  }

  _decodeProjectStatus2(data) {
    const status = decodeUInt16(data);
    if (status === null) {
      return {};
    }

    return {
      vibrationEnabled: !Boolean(status & 0x0001),
      chargeLedEnabled: !Boolean(status & 0x0002),
      setpointReached: Boolean(status & 0x0004),
      permanentBluetooth: !Boolean(status & 0x1000),
      lastSeenAt: nowIso(),
      raw: {
        projectStatus2Hex: data.toString("hex"),
      },
    };
  }

  _decodeAkkuStatus(data) {
    const status = decodeUInt16(data);
    if (status === null) {
      return {};
    }

    return {
      charging: Boolean(status & 0x0001),
      batteryError: Boolean(status & 0x8000),
    };
  }

  _update(patch) {
    this.state = {
      ...this.state,
      ...patch,
      deviceInfo: patch.deviceInfo
        ? {
            ...this.state.deviceInfo,
            ...patch.deviceInfo,
          }
        : this.state.deviceInfo,
      raw: patch.raw
        ? {
            ...this.state.raw,
            ...patch.raw,
          }
        : this.state.raw,
    };

    this.emit("update", this.getSnapshot());
  }
}

module.exports = {
  CraftyBleBridge,
  normalizeUuid,
  normalizePeripheralId,
};

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    const text = String(value).replace(/\0/g, "").trim();
    if (text) {
      return text;
    }
  }

  return null;
}

function findService(profile, serviceUuid) {
  const normalized = normalizeUuid(serviceUuid);
  return profile.find((service) => normalizeUuid(service.serviceUuid) === normalized) || null;
}

function findCharacteristic(service, characteristicUuid) {
  const normalized = normalizeUuid(characteristicUuid);
  return (
    service?.characteristics?.find(
      (characteristic) => {
        const characteristicNormalized = normalizeUuid(characteristic.uuid);
        return (
          characteristicNormalized === normalized ||
          characteristicNormalized.startsWith(normalized)
        );
      }
    ) || null
  );
}

function extractDeviceInfo(profile) {
  const genericAccess = findService(profile, "1800");
  const deviceInfo = findService(profile, "180a");
  const craftyInfo = profile.find(
    (service) => normalizeUuid(service.serviceUuid).startsWith("00000002") || normalizeUuid(service.serviceUuid).startsWith("00000003")
  );

  const genericName = firstNonEmpty(
    findCharacteristic(genericAccess, "2a00")?.valueAscii,
    findCharacteristic(craftyInfo, "00000022")?.valueAscii
  );

  const manufacturer = firstNonEmpty(
    findCharacteristic(genericAccess, "2a29")?.valueAscii,
    findCharacteristic(deviceInfo, "2a29")?.valueAscii
  );

  return {
    deviceName: genericName,
    manufacturer,
    modelNumber: firstNonEmpty(
      findCharacteristic(deviceInfo, "2a24")?.valueAscii,
      findCharacteristic(craftyInfo, "00000022")?.valueAscii
    ),
    firmwareVersion: firstNonEmpty(findCharacteristic(craftyInfo, "00000032")?.valueAscii),
    serialNumber: firstNonEmpty(findCharacteristic(craftyInfo, "00000052")?.valueAscii),
    systemId: firstNonEmpty(findCharacteristic(deviceInfo, "2a23")?.valueHex),
    rawServiceCount: profile.length,
  };
}
