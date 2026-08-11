const {
  InstanceBase,
  InstanceStatus,
  Regex,
  combineRgb,
} = require("@companion-module/base");

class CraftyBridgeInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
    this.config = {};
    this.pollTimer = null;
    this.snapshot = {};
    this.knownDeviceSignature = "";
    this.bridgeProcessStatus = "unknown";
    this.bridgeLastError = "";
  }

  async init(config) {
    this.config = config;
    this.updateStatus(InstanceStatus.Connecting);
    this.initVariables();
    this.initActions();
    this.initFeedbacks();
    this.initPresets();
    this.applyDeviceConfig().catch(() => undefined);
    this.runConnectionSetupAutomation().catch((error) => this.log("warn", `Connection setup automation failed: ${error.message}`));
    this.startPolling();
  }

  async configUpdated(config) {
    this.config = config;
    await this.applyDeviceConfig().catch(() => undefined);
    await this.runConnectionSetupAutomation().catch((error) => this.log("warn", `Connection setup automation failed: ${error.message}`));
    this.startPolling();
  }

  async destroy() {
    this.stopPolling();
  }

  getConfigFields() {
    return [
      {
        type: "textinput",
        id: "bridgeUrl",
        label: "Crafty bridge URL",
        width: 8,
        default: "http://127.0.0.1:4587",
        regex: Regex.URL,
      },
      {
        type: "number",
        id: "pollMs",
        label: "Poll interval (ms)",
        width: 4,
        default: 1000,
        min: 250,
        max: 10000,
      },
      {
        type: "textinput",
        id: "preferredPeripheralId",
        label: "Preferred BLE device ID",
        width: 6,
        default: "",
        tooltip: "Optional. Example: f4b8981f1f72. Leave empty to connect by name/service.",
      },
      {
        type: "dropdown",
        id: "deviceSelectionMode",
        label: "Device selection mode",
        width: 6,
        default: "known",
        choices: [
          { id: "known", label: "Use known/seen dropdown first" },
          { id: "manual", label: "Use manual BLE device ID" },
          { id: "auto", label: "Automatic by name/service when no known device is selected" },
        ],
        tooltip: "If a known/seen device is selected, it is used first. Automatic mode falls back to name/service matching.",
      },
      {
        type: "textinput",
        id: "matchNamePattern",
        label: "Device name pattern",
        width: 6,
        default: "crafty|storz\\s*&\\s*bickel|storz&bickel",
        tooltip: "Regular expression used when no preferred BLE device ID is set.",
      },
      {
        type: "dropdown",
        id: "preferredKnownDevice",
        label: "Known/seen BLE device",
        width: 6,
        default: "",
        choices: this.configDeviceChoices(),
        tooltip: "Pick a device discovered by the bridge. If set, it is used before the manual BLE ID above.",
      },
      {
        type: "checkbox",
        id: "scanOnConnectionSetup",
        label: "Scan BLE devices after save/load",
        width: 6,
        default: false,
        tooltip: "Starts a timed BLE scan when the connection is loaded or saved. Use this to refresh the Known/seen BLE device dropdown.",
      },
      {
        type: "number",
        id: "connectionSetupScanSeconds",
        label: "Connection setup scan seconds",
        width: 6,
        default: 12,
        min: 1,
        max: 120,
      },
      {
        type: "checkbox",
        id: "connectAfterConnectionSetup",
        label: "Connect after applying device selection",
        width: 6,
        default: false,
        tooltip: "After saving/loading this connection, apply the selected device and send Connect.",
      },
    ];
  }

  initVariables() {
    this.setVariableDefinitions({
      connected: { name: "Connected" },
      device_name: { name: "Device name" },
      battery_percent: { name: "Battery percent" },
      current_temperature_c: { name: "Current temperature C" },
      target_temperature_c: { name: "Target temperature C" },
      boost_temperature_c: { name: "Boost temperature C" },
      temperature_delta_c: { name: "Temperature delta C" },
      heat_progress_percent: { name: "Heat progress percent" },
      temperature_display: { name: "Temperature display" },
      temperature_short: { name: "Temperature short display" },
      heat_state: { name: "Heat state" },
      heater_on: { name: "Heater on" },
      boost_mode: { name: "Boost mode" },
      superboost_mode: { name: "Superboost mode" },
      setpoint_reached: { name: "Setpoint reached" },
      device_active: { name: "Device active" },
      charging: { name: "Charging" },
      battery_state: { name: "Battery state" },
      battery_bar: { name: "Battery bar" },
      battery_display: { name: "Battery display" },
      battery_short: { name: "Battery short display" },
      device_state: { name: "Device state" },
      status_short: { name: "Status short display" },
      ble_short: { name: "BLE short display" },
      signal_quality: { name: "Signal quality" },
      rssi: { name: "Bluetooth RSSI" },
      usage_hours: { name: "Usage hours" },
      usage_minutes: { name: "Usage minutes" },
      usage_text: { name: "Usage text" },
      status_line: { name: "Status line" },
      status_message: { name: "Status message" },
      capsule_display: { name: "Capsule display" },
      capsule_remaining_percent: { name: "Capsule remaining percent" },
      capsule_used_percent: { name: "Capsule used percent" },
      capsule_state: { name: "Capsule state" },
      capsule_bar: { name: "Capsule bar" },
      capsule_active: { name: "Capsule active" },
      capsule_paused: { name: "Capsule paused" },
      capsule_remaining_seconds: { name: "Capsule remaining seconds" },
      model_number: { name: "Model number" },
      manufacturer: { name: "Manufacturer" },
      serial_number: { name: "Serial number" },
      firmware: { name: "Firmware" },
      ble_version: { name: "BLE firmware" },
      system_id: { name: "System ID" },
      peripheral_name: { name: "BLE peripheral name" },
      peripheral_id: { name: "BLE peripheral ID" },
      device_selection_mode: { name: "Device selection mode" },
      selected_peripheral_id: { name: "Selected BLE peripheral ID" },
      selected_device_short: { name: "Selected BLE device short" },
      device_name_pattern: { name: "Device name pattern" },
      seen_device_count: { name: "Seen BLE device count" },
      seen_devices: { name: "Seen BLE devices" },
      known_device_count: { name: "Known BLE device count" },
      known_devices: { name: "Known BLE devices" },
      bridge_process_status: { name: "Bridge HTTP status" },
      bridge_url: { name: "Bridge URL" },
      bridge_version: { name: "Bridge version" },
      bridge_last_error: { name: "Bridge last error" },
      last_updated: { name: "Last updated" },
    });
  }

  initActions() {
    this.setActionDefinitions({
      refresh: {
        name: "Refresh status",
        options: [],
        callback: async () => this.post("/refresh"),
      },
      connect: {
        name: "Connect",
        options: [],
        callback: async () => this.post("/commands/connect"),
      },
      scan_devices: {
        name: "Scan BLE devices",
        options: [
          {
            type: "number",
            id: "durationSeconds",
            label: "Scan duration seconds",
            default: 15,
            min: 1,
            max: 120,
          },
        ],
        callback: async (event) =>
          this.post("/commands/scan-devices", {
            durationSeconds: Number(event.options.durationSeconds),
          }),
      },
      stop_scan: {
        name: "Stop BLE scan",
        options: [],
        callback: async () => this.post("/commands/stop-scan"),
      },
      apply_device_config: {
        name: "Apply device selection from connection config",
        options: [],
        callback: async () => this.applyDeviceConfig(),
      },
      select_device: {
        name: "Select BLE device by ID",
        options: [
          {
            type: "textinput",
            id: "peripheralId",
            label: "BLE peripheral ID",
            default: "",
          },
        ],
        callback: async (event) =>
          this.post("/commands/select-device", {
            peripheralId: event.options.peripheralId,
          }),
      },
      select_known_device: {
        name: "Select known BLE device",
        options: [
          {
            type: "dropdown",
            id: "peripheralId",
            label: "Known device",
            default: this.knownDeviceChoices()[0]?.id || "",
            choices: this.knownDeviceChoices(),
          },
        ],
        callback: async (event) =>
          this.post("/commands/select-known-device", {
            peripheralId: event.options.peripheralId,
          }),
      },
      clear_device_selection: {
        name: "Clear selected BLE device",
        options: [],
        callback: async () => this.post("/commands/clear-device-selection"),
      },
      forget_known_devices: {
        name: "Forget known BLE devices",
        options: [],
        callback: async () => this.post("/commands/forget-known-devices"),
      },
      bridge_shutdown: {
        name: "Bridge: shutdown",
        options: [],
        callback: async () => this.post("/commands/bridge-shutdown"),
      },
      disconnect: {
        name: "Disconnect",
        options: [],
        callback: async () => this.post("/commands/disconnect"),
      },
      boost: {
        name: "Toggle boost",
        options: [],
        callback: async () => this.post("/commands/boost"),
      },
      stop: {
        name: "Stop",
        options: [],
        callback: async () => this.post("/commands/stop"),
      },
      heater_on: {
        name: "Heater on",
        options: [],
        callback: async () => this.post("/commands/heater-on"),
      },
      heater_off: {
        name: "Heater off",
        options: [],
        callback: async () => this.post("/commands/heater-off"),
      },
      preset: {
        name: "Set preset temperature",
        options: [
          {
            type: "dropdown",
            id: "temperatureC",
            label: "Temperature",
            default: 185,
            choices: [180, 185, 190, 195, 200].map((temp) => ({
              id: temp,
              label: `${temp} C`,
            })),
          },
        ],
        callback: async (event) =>
          this.post("/commands/preset", { temperatureC: Number(event.options.temperatureC) }),
      },
      set_target_temperature: {
        name: "Set target temperature",
        options: [
          {
            type: "number",
            id: "temperatureC",
            label: "Temperature C",
            default: 185,
            min: 40,
            max: 230,
          },
        ],
        callback: async (event) =>
          this.post("/commands/set-target-temperature", {
            temperatureC: Number(event.options.temperatureC),
          }),
      },
      set_boost_temperature: {
        name: "Set boost temperature",
        options: [
          {
            type: "number",
            id: "temperatureC",
            label: "Boost temperature C",
            default: 10,
            min: 0,
            max: 210,
          },
        ],
        callback: async (event) =>
          this.post("/commands/set-boost-temperature", {
            temperatureC: Number(event.options.temperatureC),
          }),
      },
      temperature_step: {
        name: "Adjust target temperature",
        options: [
          {
            type: "number",
            id: "stepC",
            label: "Step C",
            default: 5,
            min: -50,
            max: 50,
          },
        ],
        callback: async (event) =>
          this.post("/commands/temperature-step", {
            stepC: Number(event.options.stepC),
          }),
      },
      capsule_new: {
        name: "Capsule: new inserted",
        options: [
          {
            type: "number",
            id: "maxMinutes",
            label: "Expected useful minutes",
            default: 8,
            min: 1,
            max: 60,
          },
          {
            type: "textinput",
            id: "label",
            label: "Label",
            default: "Capsule",
          },
        ],
        callback: async (event) =>
          this.post("/commands/capsule-new", {
            maxMinutes: Number(event.options.maxMinutes),
            label: event.options.label,
          }),
      },
      capsule_reset: {
        name: "Capsule: reset",
        options: [],
        callback: async () => this.post("/commands/capsule-reset"),
      },
      capsule_pause: {
        name: "Capsule: pause",
        options: [],
        callback: async () => this.post("/commands/capsule-pause"),
      },
      capsule_resume: {
        name: "Capsule: resume",
        options: [],
        callback: async () => this.post("/commands/capsule-resume"),
      },
      capsule_adjust: {
        name: "Capsule: adjust used minutes",
        options: [
          {
            type: "number",
            id: "minutes",
            label: "Add used minutes",
            default: 1,
            min: -60,
            max: 60,
          },
        ],
        callback: async (event) =>
          this.post("/commands/capsule-adjust", {
            minutes: Number(event.options.minutes),
          }),
      },
      capsule_set_remaining: {
        name: "Capsule: set remaining percent",
        options: [
          {
            type: "number",
            id: "remainingPercent",
            label: "Remaining percent",
            default: 50,
            min: 0,
            max: 100,
          },
        ],
        callback: async (event) =>
          this.post("/commands/capsule-set-remaining", {
            remainingPercent: Number(event.options.remainingPercent),
          }),
      },
    });
  }

  initFeedbacks() {
    this.setFeedbackDefinitions({
      connected: {
        type: "boolean",
        name: "Device connected",
        description: "True when the bridge reports an active BLE connection",
        defaultStyle: {
          bgcolor: combineRgb(0, 120, 60),
          color: combineRgb(255, 255, 255),
        },
        options: [],
        callback: () => this.snapshot.connected === true,
      },
      disconnected: {
        type: "boolean",
        name: "Device disconnected",
        defaultStyle: {
          bgcolor: combineRgb(120, 20, 20),
          color: combineRgb(255, 255, 255),
        },
        options: [],
        callback: () => this.snapshot.connected !== true,
      },
      bridge_online: {
        type: "boolean",
        name: "Bridge online",
        defaultStyle: {
          bgcolor: combineRgb(0, 120, 60),
          color: combineRgb(255, 255, 255),
        },
        options: [],
        callback: () => this.bridgeProcessStatus === "online",
      },
      bridge_offline: {
        type: "boolean",
        name: "Bridge offline",
        defaultStyle: {
          bgcolor: combineRgb(150, 20, 20),
          color: combineRgb(255, 255, 255),
        },
        options: [],
        callback: () => this.bridgeProcessStatus === "offline",
      },
      boost_active: {
        type: "boolean",
        name: "Boost active",
        defaultStyle: {
          bgcolor: combineRgb(210, 120, 0),
          color: combineRgb(0, 0, 0),
        },
        options: [],
        callback: () => this.snapshot.boostMode === true,
      },
      heater_on: {
        type: "boolean",
        name: "Heater on",
        defaultStyle: {
          bgcolor: combineRgb(220, 70, 20),
          color: combineRgb(255, 255, 255),
        },
        options: [],
        callback: () => this.snapshot.heaterOn === true,
      },
      charging: {
        type: "boolean",
        name: "Charging",
        defaultStyle: {
          bgcolor: combineRgb(25, 110, 190),
          color: combineRgb(255, 255, 255),
        },
        options: [],
        callback: () => this.snapshot.charging === true,
      },
      target_reached: {
        type: "boolean",
        name: "Target temperature reached",
        defaultStyle: {
          bgcolor: combineRgb(0, 95, 130),
          color: combineRgb(255, 255, 255),
        },
        options: [],
        callback: () => {
          const current = Number(this.snapshot.currentTemperatureC);
          const target = Number(this.snapshot.targetTemperatureC);
          return Number.isFinite(current) && Number.isFinite(target) && current >= target - 2;
        },
      },
      heating_up: {
        type: "boolean",
        name: "Heating up",
        defaultStyle: {
          bgcolor: combineRgb(245, 145, 30),
          color: combineRgb(0, 0, 0),
        },
        options: [],
        callback: () => {
          const current = Number(this.snapshot.currentTemperatureC);
          const target = Number(this.snapshot.targetTemperatureC);
          return Number.isFinite(current) && Number.isFinite(target) && current < target - 2;
        },
      },
      battery_low: {
        type: "boolean",
        name: "Battery low",
        defaultStyle: {
          bgcolor: combineRgb(190, 35, 20),
          color: combineRgb(255, 255, 255),
        },
        options: [
          {
            type: "number",
            id: "threshold",
            label: "Threshold percent",
            default: 25,
            min: 1,
            max: 100,
          },
        ],
        callback: (feedback) => {
          const battery = Number(this.snapshot.batteryPercent);
          return Number.isFinite(battery) && battery <= Number(feedback.options.threshold);
        },
      },
      signal_weak: {
        type: "boolean",
        name: "Bluetooth signal weak",
        defaultStyle: {
          bgcolor: combineRgb(130, 70, 0),
          color: combineRgb(255, 255, 255),
        },
        options: [
          {
            type: "number",
            id: "threshold",
            label: "Weak under RSSI",
            default: -85,
            min: -120,
            max: -30,
          },
        ],
        callback: (feedback) => {
          const rssi = Number(this.snapshot.rssi ?? this.snapshot.ble?.rssi);
          return Number.isFinite(rssi) && rssi <= Number(feedback.options.threshold);
        },
      },
      capsule_low: {
        type: "boolean",
        name: "Capsule remaining below",
        defaultStyle: {
          bgcolor: combineRgb(170, 70, 0),
          color: combineRgb(255, 255, 255),
        },
        options: [
          {
            type: "number",
            id: "threshold",
            label: "Remaining percent threshold",
            default: 25,
            min: 0,
            max: 100,
          },
        ],
        callback: (feedback) => {
          const remaining = Number(this.snapshot.capsuleRemainingPercent);
          return this.snapshot.capsule?.active === true &&
            Number.isFinite(remaining) &&
            remaining <= Number(feedback.options.threshold);
        },
      },
      capsule_active: {
        type: "boolean",
        name: "Capsule active",
        defaultStyle: {
          bgcolor: combineRgb(0, 125, 65),
          color: combineRgb(255, 255, 255),
        },
        options: [],
        callback: () => this.snapshot.capsule?.active === true,
      },
      capsule_state_is: {
        type: "boolean",
        name: "Capsule state is",
        defaultStyle: {
          bgcolor: combineRgb(180, 125, 0),
          color: combineRgb(0, 0, 0),
        },
        options: [
          {
            type: "dropdown",
            id: "state",
            label: "State",
            default: "fresh",
            choices: ["inactive", "paused", "spent", "nearly spent", "fading", "good", "fresh"].map((state) => ({
              id: state,
              label: state,
            })),
          },
        ],
        callback: (feedback) => this.snapshot.capsuleState === feedback.options.state,
      },
      temperature_above: {
        type: "boolean",
        name: "Current temperature above",
        defaultStyle: {
          bgcolor: combineRgb(220, 80, 15),
          color: combineRgb(0, 0, 0),
        },
        options: [
          {
            type: "number",
            id: "temperatureC",
            label: "Temperature C",
            default: 180,
            min: 0,
            max: 230,
          },
        ],
        callback: (feedback) => {
          const current = Number(this.snapshot.currentTemperatureC);
          return Number.isFinite(current) && current >= Number(feedback.options.temperatureC);
        },
      },
      temperature_below: {
        type: "boolean",
        name: "Current temperature below",
        defaultStyle: {
          bgcolor: combineRgb(15, 55, 95),
          color: combineRgb(255, 255, 255),
        },
        options: [
          {
            type: "number",
            id: "temperatureC",
            label: "Temperature C",
            default: 100,
            min: 0,
            max: 230,
          },
        ],
        callback: (feedback) => {
          const current = Number(this.snapshot.currentTemperatureC);
          return Number.isFinite(current) && current <= Number(feedback.options.temperatureC);
        },
      },
      battery_above: {
        type: "boolean",
        name: "Battery above",
        defaultStyle: {
          bgcolor: combineRgb(0, 130, 65),
          color: combineRgb(255, 255, 255),
        },
        options: [
          {
            type: "number",
            id: "threshold",
            label: "Threshold percent",
            default: 80,
            min: 0,
            max: 100,
          },
        ],
        callback: (feedback) => {
          const battery = Number(this.snapshot.batteryPercent);
          return Number.isFinite(battery) && battery >= Number(feedback.options.threshold);
        },
      },
      battery_between: {
        type: "boolean",
        name: "Battery between",
        defaultStyle: {
          bgcolor: combineRgb(180, 125, 0),
          color: combineRgb(0, 0, 0),
        },
        options: [
          {
            type: "number",
            id: "min",
            label: "Minimum percent",
            default: 30,
            min: 0,
            max: 100,
          },
          {
            type: "number",
            id: "max",
            label: "Maximum percent",
            default: 80,
            min: 0,
            max: 100,
          },
        ],
        callback: (feedback) => {
          const battery = Number(this.snapshot.batteryPercent);
          return Number.isFinite(battery) &&
            battery >= Number(feedback.options.min) &&
            battery <= Number(feedback.options.max);
        },
      },
      signal_quality_is: {
        type: "boolean",
        name: "BLE signal quality is",
        defaultStyle: {
          bgcolor: combineRgb(15, 55, 95),
          color: combineRgb(255, 255, 255),
        },
        options: [
          {
            type: "dropdown",
            id: "quality",
            label: "Signal quality",
            default: "weak",
            choices: ["excellent", "good", "weak", "poor"].map((quality) => ({
              id: quality,
              label: quality,
            })),
          },
        ],
        callback: (feedback) => this.snapshot.signalQuality === feedback.options.quality,
      },
      heat_state_is: {
        type: "boolean",
        name: "Heat state is",
        defaultStyle: {
          bgcolor: combineRgb(240, 125, 20),
          color: combineRgb(0, 0, 0),
        },
        options: [
          {
            type: "dropdown",
            id: "state",
            label: "Heat state",
            default: "heating",
            choices: ["disconnected", "idle", "heating", "ready"].map((state) => ({
              id: state,
              label: state,
            })),
          },
        ],
        callback: (feedback) => this.snapshot.heatState === feedback.options.state,
      },
    });
  }

  initPresets() {
    const presets = {
      status_overview: makePreset({
        name: "Status overview",
        text: "$(crafty-bridge:status_short)",
        size: 12,
        bgcolor: colors.deep,
        feedbacks: [
          feedback("connected", {}, { bgcolor: colors.green }),
          feedback("disconnected", {}, { bgcolor: colors.red }),
          feedback("heating_up", {}, { bgcolor: colors.orange, color: colors.black }),
          feedback("target_reached", {}, { bgcolor: colors.blue }),
          feedback("battery_low", { threshold: 50 }, { bgcolor: colors.amber, color: colors.black }),
          feedback("battery_low", { threshold: 25 }, { bgcolor: colors.red }),
        ],
        keywords: ["status", "temperature", "battery", "overview"],
      }),
      status_line: makePreset({
        name: "Full status line",
        text: "$(crafty-bridge:status_line)",
        size: 13,
        bgcolor: colors.slate,
        feedbacks: [
          feedback("connected", {}, { bgcolor: colors.green }),
          feedback("disconnected", {}, { bgcolor: colors.red }),
        ],
        keywords: ["status", "line", "summary"],
      }),
      bridge_health: makePreset({
        name: "Bridge health",
        text: "BRIDGE\n$(crafty-bridge:bridge_process_status)\n$(crafty-bridge:bridge_version)",
        size: 11,
        bgcolor: colors.slate,
        feedbacks: [
          feedback("bridge_online", {}, { bgcolor: colors.greenDark }),
          feedback("bridge_offline", {}, { bgcolor: colors.red }),
        ],
        keywords: ["bridge", "health", "online", "offline", "version"],
      }),
      bridge_error: makePreset({
        name: "Bridge last error",
        text: "$(crafty-bridge:bridge_last_error)",
        size: 8,
        bgcolor: colors.redDark,
        feedbacks: [feedback("bridge_offline", {}, { bgcolor: colors.red })],
        keywords: ["bridge", "error", "diagnostic"],
      }),
      battery: makePreset({
        name: "Battery",
        text: "$(crafty-bridge:battery_short)",
        size: 12,
        bgcolor: colors.greenDark,
        feedbacks: [
          feedback("battery_low", { threshold: 50 }, { bgcolor: colors.amber, color: colors.black }),
          feedback("battery_low", { threshold: 30 }, { bgcolor: colors.orange, color: colors.black }),
          feedback("battery_low", { threshold: 15 }, { bgcolor: colors.red }),
          feedback("charging", {}, { bgcolor: colors.blue }),
        ],
        keywords: ["battery", "charge"],
      }),
      signal: makePreset({
        name: "Bluetooth signal",
        text: "BLE\n$(crafty-bridge:ble_short)",
        bgcolor: colors.blueDark,
        feedbacks: [feedback("signal_weak", { threshold: -85 }, { bgcolor: colors.orange, color: colors.black })],
        keywords: ["bluetooth", "signal", "rssi"],
      }),
      usage: makePreset({
        name: "Usage hours",
        text: "USAGE\n$(crafty-bridge:usage_text)",
        bgcolor: colors.gray,
        keywords: ["usage", "hours", "operation"],
      }),
      device_info: makePreset({
        name: "Device info",
        text: "$(crafty-bridge:model_number)\n$(crafty-bridge:firmware)\n$(crafty-bridge:serial_number)",
        size: 12,
        bgcolor: colors.gray,
        keywords: ["device", "firmware", "serial"],
      }),
      pairing_status: makePreset({
        name: "Pairing status",
        text: "BLE SEL\n$(crafty-bridge:selected_device_short)\nseen $(crafty-bridge:seen_device_count)",
        size: 10,
        bgcolor: colors.slate,
        feedbacks: [
          feedback("connected", {}, { bgcolor: colors.green }),
          feedback("disconnected", {}, { bgcolor: colors.red }),
        ],
        keywords: ["pairing", "device", "selection"],
      }),
      seen_devices: makePreset({
        name: "Seen BLE devices",
        text: "$(crafty-bridge:seen_devices)",
        size: 9,
        bgcolor: colors.gray,
        keywords: ["pairing", "seen", "devices", "scan"],
      }),
      known_devices: makePreset({
        name: "Known BLE devices",
        text: "KNOWN $(crafty-bridge:known_device_count)\n$(crafty-bridge:selected_device_short)",
        size: 8,
        bgcolor: colors.gray,
        keywords: ["pairing", "known", "devices"],
      }),
      capsule_status: makePreset({
        name: "Capsule status",
        text: "$(crafty-bridge:capsule_display)",
        size: 12,
        bgcolor: colors.greenDark,
        feedbacks: [
          feedback("capsule_low", { threshold: 45 }, { bgcolor: colors.amber, color: colors.black }),
          feedback("capsule_low", { threshold: 20 }, { bgcolor: colors.red }),
        ],
        keywords: ["capsule", "content", "remaining"],
      }),
      capsule_new: makePreset({
        name: "New capsule",
        text: "NEW\nCAPSULE\n8m",
        size: 14,
        bgcolor: colors.green,
        actions: [action("capsule_new", { maxMinutes: 8, label: "Capsule" })],
        keywords: ["capsule", "new", "start"],
      }),
      capsule_new_5: capsuleNewPreset(5),
      capsule_new_10: capsuleNewPreset(10),
      capsule_new_12: capsuleNewPreset(12),
      capsule_pause: makePreset({
        name: "Pause capsule",
        text: "PAUSE\nCAPSULE",
        size: 13,
        bgcolor: colors.amber,
        color: colors.black,
        actions: [action("capsule_pause")],
        keywords: ["capsule", "pause"],
      }),
      capsule_resume: makePreset({
        name: "Resume capsule",
        text: "RESUME\nCAPSULE",
        size: 12,
        bgcolor: colors.blue,
        actions: [action("capsule_resume")],
        keywords: ["capsule", "resume"],
      }),
      capsule_reset: makePreset({
        name: "Reset capsule",
        text: "RESET\nCAPSULE",
        size: 12,
        bgcolor: colors.redDark,
        actions: [action("capsule_reset")],
        keywords: ["capsule", "reset"],
      }),
      capsule_add_1: capsuleAdjustPreset(1),
      capsule_sub_1: capsuleAdjustPreset(-1),
      heater_on: makePreset({
        name: "Heater on",
        text: "HEAT\nON",
        bgcolor: colors.orange,
        color: colors.black,
        actions: [action("heater_on")],
        feedbacks: [feedback("heater_on", {}, { bgcolor: colors.red })],
        keywords: ["heater", "heat", "on"],
      }),
      heater_off: makePreset({
        name: "Heater off",
        text: "HEAT\nOFF",
        bgcolor: colors.redDark,
        actions: [action("heater_off")],
        feedbacks: [feedback("heater_on", {}, { bgcolor: colors.red }, true)],
        keywords: ["heater", "heat", "off", "stop"],
      }),
      stop: makePreset({
        name: "Stop",
        text: "STOP",
        size: 24,
        bgcolor: colors.red,
        actions: [action("stop")],
        feedbacks: [feedback("heater_on", {}, { bgcolor: colors.red })],
        keywords: ["stop", "off", "heater"],
      }),
      refresh: makePreset({
        name: "Refresh",
        text: "REFRESH\nSTATUS",
        bgcolor: colors.slate,
        actions: [action("refresh")],
        keywords: ["refresh", "poll", "status"],
      }),
      connect: makePreset({
        name: "Connect",
        text: "CONNECT",
        bgcolor: colors.greenDark,
        actions: [action("connect")],
        feedbacks: [feedback("connected", {}, { bgcolor: colors.green })],
        keywords: ["connect", "ble"],
      }),
      scan_devices: makePreset({
        name: "Scan devices",
        text: "SCAN\nBLE\n15s",
        bgcolor: colors.blueDark,
        actions: [action("scan_devices", { durationSeconds: 15 })],
        keywords: ["scan", "pairing", "ble"],
      }),
      stop_scan: makePreset({
        name: "Stop BLE scan",
        text: "STOP\nSCAN",
        bgcolor: colors.redDark,
        actions: [action("stop_scan")],
        keywords: ["scan", "stop", "ble"],
      }),
      select_known_device: makePreset({
        name: "Select known device",
        text: "SELECT\nKNOWN\nDEVICE",
        size: 11,
        bgcolor: colors.blue,
        actions: [action("select_known_device", { peripheralId: this.knownDeviceChoices()[0]?.id || "" })],
        keywords: ["known", "select", "pairing"],
      }),
      apply_device_config: makePreset({
        name: "Apply device config",
        text: "APPLY\nDEVICE\nCONFIG",
        size: 11,
        bgcolor: colors.slate,
        actions: [action("apply_device_config")],
        keywords: ["pairing", "config", "device"],
      }),
      clear_device_selection: makePreset({
        name: "Clear device selection",
        text: "CLEAR\nBLE\nSELECT",
        size: 11,
        bgcolor: colors.redDark,
        actions: [action("clear_device_selection")],
        keywords: ["pairing", "clear", "device"],
      }),
      forget_known_devices: makePreset({
        name: "Forget known devices",
        text: "FORGET\nKNOWN\nBLE",
        size: 11,
        bgcolor: colors.redDark,
        actions: [action("forget_known_devices")],
        keywords: ["forget", "known", "devices"],
      }),
      bridge_shutdown: makePreset({
        name: "Bridge shutdown",
        text: "BRIDGE\nSHUTDOWN",
        size: 12,
        bgcolor: colors.redDark,
        actions: [action("bridge_shutdown")],
        keywords: ["bridge", "shutdown", "service"],
      }),
      disconnect: makePreset({
        name: "Disconnect",
        text: "DISCONNECT",
        bgcolor: colors.redDark,
        actions: [action("disconnect")],
        feedbacks: [feedback("disconnected", {}, { bgcolor: colors.red })],
        keywords: ["disconnect", "ble"],
      }),
      target_temp: makePreset({
        name: "Target temperature",
        text: "TARGET\n$(crafty-bridge:target_temperature_c) C\n$(crafty-bridge:temperature_delta_c)",
        size: 13,
        bgcolor: colors.blueDark,
        feedbacks: [
          feedback("heating_up", {}, { bgcolor: colors.orange, color: colors.black }),
          feedback("target_reached", {}, { bgcolor: colors.blue }),
        ],
        keywords: ["target", "temperature"],
      }),
      custom_target_temp: makePreset({
        name: "Custom target temperature",
        text: "SET\nCUSTOM\n185 C",
        size: 13,
        bgcolor: colors.blueDark,
        actions: [action("set_target_temperature", { temperatureC: 185 })],
        feedbacks: [
          feedback("heating_up", {}, { bgcolor: colors.orange, color: colors.black }),
          feedback("target_reached", {}, { bgcolor: colors.blue }),
        ],
        keywords: ["custom", "target", "temperature", "editable"],
      }),
      current_temp: makePreset({
        name: "Current temperature",
        text: "$(crafty-bridge:temperature_short)",
        size: 11,
        bgcolor: colors.blueDark,
        feedbacks: [
          feedback("heating_up", {}, { bgcolor: colors.orange, color: colors.black }),
          feedback("target_reached", {}, { bgcolor: colors.blue }),
        ],
        keywords: ["current", "temperature", "progress"],
      }),
      temp_up_1: tempStepPreset(1),
      temp_up_5: tempStepPreset(5),
      temp_down_1: tempStepPreset(-1),
      temp_down_5: tempStepPreset(-5),
      boost_toggle: makePreset({
        name: "Toggle boost",
        text: "BOOST\n$(crafty-bridge:boost_temperature_c) C",
        bgcolor: colors.amber,
        color: colors.black,
        actions: [action("boost")],
        feedbacks: [feedback("boost_active", {}, { bgcolor: colors.orange, color: colors.black })],
        keywords: ["boost", "toggle"],
      }),
      custom_boost_temp: makePreset({
        name: "Custom boost temperature",
        text: "BOOST\nCUSTOM\n10 C",
        size: 13,
        bgcolor: colors.amber,
        color: colors.black,
        actions: [action("set_boost_temperature", { temperatureC: 10 })],
        feedbacks: [feedback("boost_active", {}, { bgcolor: colors.orange, color: colors.black })],
        keywords: ["boost", "custom", "temperature", "editable"],
      }),
      boost_temp_10: boostTempPreset(10),
      boost_temp_15: boostTempPreset(15),
      preset_180: temperaturePreset(180),
      preset_185: temperaturePreset(185),
      preset_190: temperaturePreset(190),
      preset_195: temperaturePreset(195),
      preset_200: temperaturePreset(200),
    };

    const structure = [
      {
        id: "dashboard",
        name: "Dashboard",
        definitions: [
          {
            id: "dashboard-main",
            type: "simple",
            name: "Live status",
            presets: [
              "status_overview",
              "status_line",
              "bridge_health",
              "battery",
              "signal",
              "pairing_status",
              "capsule_status",
              "usage",
              "device_info",
              "bridge_error",
            ],
          },
          {
            id: "dashboard-devices",
            type: "simple",
            name: "Pairing info",
            presets: ["seen_devices", "known_devices"],
          },
        ],
      },
      {
        id: "control",
        name: "Control",
        definitions: [
          {
            id: "control-power",
            type: "simple",
            name: "Power and connection",
            presets: [
              "heater_on",
              "heater_off",
              "stop",
              "refresh",
              "scan_devices",
              "stop_scan",
              "select_known_device",
              "apply_device_config",
              "connect",
              "disconnect",
              "clear_device_selection",
              "forget_known_devices",
              "bridge_shutdown",
              "bridge_health",
            ],
          },
          {
            id: "control-capsule",
            type: "simple",
            name: "Capsule tracking",
            presets: [
              "capsule_new_5",
              "capsule_new",
              "capsule_new_10",
              "capsule_new_12",
              "capsule_pause",
              "capsule_resume",
              "capsule_add_1",
              "capsule_sub_1",
              "capsule_reset",
            ],
          },
        ],
      },
      {
        id: "temperature",
        name: "Temperature",
        definitions: [
          {
            id: "temperature-live",
            type: "simple",
            name: "Live temperature",
            presets: [
              "current_temp",
              "target_temp",
              "custom_target_temp",
              "temp_up_1",
              "temp_down_1",
              "temp_up_5",
              "temp_down_5",
            ],
          },
          {
            id: "temperature-presets",
            type: "simple",
            name: "Temperature presets",
            presets: ["preset_180", "preset_185", "preset_190", "preset_195", "preset_200"],
          },
          {
            id: "temperature-boost",
            type: "simple",
            name: "Boost",
            presets: ["boost_toggle", "custom_boost_temp", "boost_temp_10", "boost_temp_15"],
          },
        ],
      },
    ];

    this.setPresetDefinitions(structure, presets);
  }

  startPolling() {
    this.stopPolling();
    this.poll().catch(() => undefined);
    const interval = Number(this.config.pollMs || 1000);
    this.pollTimer = setInterval(() => this.poll().catch(() => undefined), interval);
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async poll() {
    let data;
    try {
      data = await this.get("/snapshot");
    } catch (error) {
      this.bridgeProcessStatus = "offline";
      this.bridgeLastError = error.message;
      this.updateStatus(InstanceStatus.ConnectionFailure, error.message);
      this.updateVariables();
      this.checkFeedbacks("bridge_online", "bridge_offline");
      return;
    }

    this.bridgeProcessStatus = "online";
    this.bridgeLastError = "";
    this.snapshot = data.snapshot || {};
    const nextKnownSignature = JSON.stringify(
      (this.snapshot.knownDevices || []).map((device) => [device.id, device.name, device.rssi]),
    );
    if (nextKnownSignature !== this.knownDeviceSignature) {
      this.knownDeviceSignature = nextKnownSignature;
      this.initActions();
      this.initPresets();
    }
    this.updateStatus(this.snapshot.connected ? InstanceStatus.Ok : InstanceStatus.UnknownWarning);
    this.updateVariables();
    this.checkFeedbacks(
      "connected",
      "disconnected",
      "boost_active",
      "heater_on",
      "charging",
      "target_reached",
      "heating_up",
      "battery_low",
      "signal_weak",
      "capsule_low",
      "capsule_active",
      "capsule_state_is",
      "temperature_above",
      "temperature_below",
      "battery_above",
      "battery_between",
      "signal_quality_is",
      "heat_state_is",
      "bridge_online",
      "bridge_offline",
    );
  }

  updateVariables() {
    const info = this.snapshot.deviceInfo || {};
    const ble = this.snapshot.ble || {};
    this.setVariableValues({
      connected: this.snapshot.connected ? "yes" : "no",
      device_name: this.snapshot.deviceName || "",
      battery_percent: this.snapshot.batteryPercent ?? "",
      current_temperature_c: this.snapshot.currentTemperatureC ?? "",
      target_temperature_c: this.snapshot.targetTemperatureC ?? "",
      boost_temperature_c: this.snapshot.boostTemperatureC ?? "",
      temperature_delta_c: this.snapshot.temperatureDeltaC ?? "",
      heat_progress_percent: this.snapshot.heatProgressPercent ?? "",
      temperature_display: this.snapshot.temperatureDisplay || "",
      temperature_short: this.snapshot.temperatureShort || "",
      heat_state: this.snapshot.heatState || "",
      heater_on: this.snapshot.heaterOn ? "on" : "off",
      boost_mode: this.snapshot.boostMode ? "on" : "off",
      superboost_mode: this.snapshot.superboostMode ? "on" : "off",
      setpoint_reached: this.snapshot.setpointReached ? "yes" : "no",
      device_active: this.snapshot.deviceActive ? "yes" : "no",
      charging: this.snapshot.charging === null || this.snapshot.charging === undefined
        ? ""
        : this.snapshot.charging
          ? "yes"
          : "no",
      battery_state: this.snapshot.batteryState || "",
      battery_bar: this.snapshot.batteryBar || "",
      battery_display: this.snapshot.batteryDisplay || "",
      battery_short: this.snapshot.batteryShort || "",
      device_state: this.snapshot.deviceState || "",
      status_short: this.snapshot.statusShort || "",
      ble_short: this.snapshot.bleShort || "",
      signal_quality: this.snapshot.signalQuality || "",
      rssi: this.snapshot.rssi ?? ble.rssi ?? "",
      usage_hours: this.snapshot.usageHours ?? "",
      usage_minutes: this.snapshot.usageMinutes ?? "",
      usage_text: this.snapshot.usageText || "",
      status_line: this.snapshot.statusLine || "",
      status_message: this.snapshot.statusMessage || "",
      capsule_display: this.snapshot.capsuleDisplay || "",
      capsule_remaining_percent: this.snapshot.capsuleRemainingPercent ?? "",
      capsule_used_percent: this.snapshot.capsuleUsedPercent ?? "",
      capsule_state: this.snapshot.capsuleState || "",
      capsule_bar: this.snapshot.capsuleBar || "",
      capsule_active: this.snapshot.capsule?.active ? "yes" : "no",
      capsule_paused: this.snapshot.capsule?.paused ? "yes" : "no",
      capsule_remaining_seconds: this.snapshot.capsule?.remainingSeconds ?? "",
      model_number: info.modelNumber || "",
      manufacturer: info.manufacturer || "",
      serial_number: info.serialNumber || info.serial || "",
      firmware: info.firmwareVersion || info.firmwareRevision || info.firmware || "",
      ble_version: info.bleVersion || "",
      system_id: info.systemId || "",
      peripheral_name: this.snapshot.peripheralName || ble.peripheralName || "",
      peripheral_id: this.snapshot.peripheralId || ble.peripheralId || "",
      device_selection_mode: this.config.deviceSelectionMode || "known",
      selected_peripheral_id: this.snapshot.selectedPeripheralId || "",
      selected_device_short: this.snapshot.selectedDeviceShort || "",
      device_name_pattern: this.snapshot.deviceNamePattern || "",
      seen_device_count: Array.isArray(this.snapshot.seenDevices) ? this.snapshot.seenDevices.length : 0,
      seen_devices: Array.isArray(this.snapshot.seenDevices)
        ? this.snapshot.seenDevices
            .slice(0, 5)
            .map((device) => `${device.name || "unknown"} ${device.id || ""} ${device.rssi ?? ""}`)
            .join(" | ")
        : "",
      known_device_count: Array.isArray(this.snapshot.knownDevices) ? this.snapshot.knownDevices.length : 0,
      known_devices: Array.isArray(this.snapshot.knownDevices)
        ? this.snapshot.knownDevices
            .slice(0, 8)
            .map((device) => `${device.name || "unknown"} ${device.id || ""} ${device.rssi ?? ""}`)
            .join(" | ")
        : "",
      bridge_process_status: this.bridgeProcessStatus,
      bridge_url: this.baseUrl(),
      bridge_version: this.snapshot.bridgeVersion || "",
      bridge_last_error: this.bridgeLastError,
      last_updated: this.snapshot.lastUpdated || "",
    });
  }

  knownDeviceChoices() {
    const devices = Array.isArray(this.snapshot.knownDevices) ? this.snapshot.knownDevices : [];
    if (devices.length === 0) {
      return [{ id: "", label: "No known devices yet - scan first" }];
    }

    return devices.map((device) => ({
      id: device.id,
      label: `${device.name || "unknown"} ${device.id}${device.rssi === null || device.rssi === undefined ? "" : ` (${device.rssi})`}`,
    }));
  }

  configDeviceChoices() {
    const choices = [{ id: "", label: "Automatic/manual selection" }];
    const byId = new Map();
    for (const source of [this.snapshot.knownDevices, this.snapshot.seenDevices]) {
      if (!Array.isArray(source)) continue;
      for (const device of source) {
        if (!device?.id || byId.has(device.id)) continue;
        byId.set(device.id, {
          id: device.id,
          label: `${device.name || "unknown"} ${device.id}${device.rssi === null || device.rssi === undefined ? "" : ` (${device.rssi})`}`,
        });
      }
    }
    return choices.concat(Array.from(byId.values()));
  }

  async get(path) {
    const res = await fetch(`${this.baseUrl()}${path}`);
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
  }

  async post(path, body) {
    const res = await fetch(`${this.baseUrl()}${path}`, {
      method: "POST",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    await this.poll().catch(() => undefined);
  }

  async applyDeviceConfig() {
    const mode = String(this.config.deviceSelectionMode || "known");
    const preferredKnownDevice = String(this.config.preferredKnownDevice || "").trim();
    const manualPeripheralId = String(this.config.preferredPeripheralId || "").trim();
    const effectiveMode = mode === "auto" && preferredKnownDevice ? "known" : mode;
    const preferredPeripheralId = effectiveMode === "auto"
      ? ""
      : effectiveMode === "manual"
        ? manualPeripheralId
        : preferredKnownDevice || manualPeripheralId;
    const matchNamePattern = String(
      this.config.matchNamePattern || "crafty|storz\\s*&\\s*bickel|storz&bickel",
    ).trim();

    await this.post("/commands/configure-device", {
      preferredPeripheralId: preferredPeripheralId || null,
      matchNamePattern,
    });
  }

  async runConnectionSetupAutomation() {
    const scanSeconds = Number(this.config.connectionSetupScanSeconds || 12);
    if (this.config.scanOnConnectionSetup) {
      await this.post("/commands/scan-devices", {
        durationSeconds: scanSeconds,
      });

      if (this.config.connectAfterConnectionSetup) {
        const delayMs = Math.min(Math.max(scanSeconds, 1), 120) * 1000 + 1000;
        setTimeout(() => {
          this.post("/commands/connect").catch((error) =>
            this.log("warn", `Delayed connect after scan failed: ${error.message}`),
          );
        }, delayMs);
      }
      return;
    }

    if (this.config.connectAfterConnectionSetup) {
      await this.post("/commands/connect");
    }
  }

  baseUrl() {
    return String(this.config.bridgeUrl || "http://127.0.0.1:4587").replace(/\/+$/, "");
  }

}

const colors = {
  black: combineRgb(0, 0, 0),
  white: combineRgb(255, 255, 255),
  deep: combineRgb(16, 20, 24),
  slate: combineRgb(42, 50, 58),
  gray: combineRgb(58, 58, 58),
  green: combineRgb(0, 150, 70),
  greenDark: combineRgb(0, 90, 55),
  red: combineRgb(190, 35, 25),
  redDark: combineRgb(95, 15, 15),
  orange: combineRgb(240, 125, 20),
  amber: combineRgb(180, 125, 0),
  blue: combineRgb(0, 105, 165),
  blueDark: combineRgb(15, 55, 95),
};

function action(actionId, options = {}) {
  return {
    actionId,
    options,
  };
}

function feedback(feedbackId, options = {}, style = {}, isInverted = false) {
  return {
    feedbackId,
    options,
    style,
    isInverted,
  };
}

function makePreset({
  name,
  text,
  size = 15,
  color = colors.white,
  bgcolor = colors.deep,
  actions = [],
  feedbacks = [],
  keywords = [],
}) {
  return {
    type: "simple",
    name,
    keywords,
    style: {
      text,
      size,
      color,
      bgcolor,
    },
    steps: [
      {
        down: actions,
        up: [],
      },
    ],
    feedbacks,
  };
}

function temperaturePreset(temperatureC) {
  return makePreset({
    name: `Set ${temperatureC} C`,
    text: `${temperatureC} C`,
    size: 22,
    bgcolor: colors.blueDark,
    actions: [action("preset", { temperatureC })],
    feedbacks: [
      feedback("heating_up", {}, { bgcolor: colors.orange, color: colors.black }),
      feedback("target_reached", {}, { bgcolor: colors.blue }),
    ],
    keywords: ["preset", "temperature", String(temperatureC)],
  });
}

function tempStepPreset(stepC) {
  const sign = stepC > 0 ? "+" : "";
  return makePreset({
    name: `Target ${sign}${stepC} C`,
    text: `TEMP\n${sign}${stepC} C`,
    bgcolor: stepC > 0 ? colors.orange : colors.blueDark,
    color: stepC > 0 ? colors.black : colors.white,
    actions: [action("temperature_step", { stepC })],
    feedbacks: [
      feedback("heating_up", {}, { bgcolor: colors.orange, color: colors.black }),
      feedback("target_reached", {}, { bgcolor: colors.blue }),
    ],
    keywords: ["temperature", "step", "adjust", String(stepC)],
  });
}

function boostTempPreset(temperatureC) {
  return makePreset({
    name: `Boost ${temperatureC} C`,
    text: `BOOST\n${temperatureC} C`,
    bgcolor: colors.amber,
    color: colors.black,
    actions: [action("set_boost_temperature", { temperatureC })],
    feedbacks: [feedback("boost_active", {}, { bgcolor: colors.orange, color: colors.black })],
    keywords: ["boost", "temperature", String(temperatureC)],
  });
}

function capsuleNewPreset(maxMinutes) {
  return makePreset({
    name: `New capsule ${maxMinutes}m`,
    text: `NEW\nCAPSULE\n${maxMinutes}m`,
    size: 14,
    bgcolor: colors.green,
    actions: [action("capsule_new", { maxMinutes, label: "Capsule" })],
    keywords: ["capsule", "new", "start", String(maxMinutes)],
  });
}

function capsuleAdjustPreset(minutes) {
  const sign = minutes > 0 ? "+" : "";
  return makePreset({
    name: `Capsule ${sign}${minutes}m used`,
    text: `CAPS\n${sign}${minutes}m\nUSED`,
    size: 13,
    bgcolor: minutes > 0 ? colors.orange : colors.blue,
    color: minutes > 0 ? colors.black : colors.white,
    actions: [action("capsule_adjust", { minutes })],
    feedbacks: [
      feedback("capsule_low", { threshold: 45 }, { bgcolor: colors.amber, color: colors.black }),
      feedback("capsule_low", { threshold: 20 }, { bgcolor: colors.red }),
    ],
    keywords: ["capsule", "adjust", "manual", String(minutes)],
  });
}

module.exports = CraftyBridgeInstance;
