# Crafty Companion WinBridge

Local Windows bridge and Bitfocus Companion module for Storz & Bickel Crafty/Crafty+ over Bluetooth LE.

## What It Does

- Reads live BLE data from the device.
- Exposes status to Bitfocus Companion.
- Provides Stream Deck XL presets.
- Controls heater on/off and target temperature.
- Tracks battery, temperature, BLE signal, usage time, firmware and serial.
- Adds a capsule/session tracker for estimating remaining useful content.
- Supports selecting a preferred BLE device by id or matching by name pattern.

## Architecture

```text
Crafty+ BLE device
  -> Node.js Windows bridge on http://127.0.0.1:4587
  -> Companion module crafty-bridge
  -> Companion presets/buttons
  -> Stream Deck XL
```

## Quick Start

For deployment to another Windows PC, distribute
`crafty-bridge-windows-0.1.17.zip`. After extraction, running `INSTALL.cmd`
installs the bridge and automatic startup without
administrator rights. The Companion module `.tgz` is included in the same ZIP.

For development from this source folder:

1. Install Node.js 22 LTS or newer.
2. Install Bluetooth support and make sure Windows can see the Crafty device.
3. Install project dependencies:

```powershell
cd "C:\Users\ondra\Documents\crafty iphone"
npm install
```

4. Start the bridge:

```powershell
npm start
```

5. Open Companion and install the module package:

```text
companion-module-crafty-bridge-0.1.17-official-rc.tgz
```

6. Add a `Crafty Bridge` connection in Companion.

Default bridge URL:

```text
http://127.0.0.1:4587
```

Keep the bridge bound to `127.0.0.1` unless remote access is explicitly
required and protected by a firewall. Browser requests are rejected by
default. Trusted browser origins can be enabled as a comma-separated list:

```powershell
$env:CRAFTY_ALLOWED_ORIGINS="http://127.0.0.1:8000,https://control.example"
npm start
```

The bridge accepts JSON request bodies up to 64 KiB. Automated tests use
temporary state and configuration paths, so `npm test` does not modify the
local device configuration or capsule state.

## Important Commands

```powershell
npm start
npm run stop
npm test
```

## Companion Features

Actions:

- Refresh status
- Connect / disconnect
- Heater on / off
- Stop
- Set preset temperature
- Set target temperature
- Adjust target temperature
- Set boost temperature
- Capsule new / pause / resume / reset / adjust / set remaining
- BLE scan / stop scan / select known device / forget known devices
- Bridge shutdown

Variables:

- Connection and device identity
- Battery percent/state/bar/display
- Current, target and boost temperature
- Heat progress and delta
- Device state and heat state
- BLE RSSI and signal quality
- Usage time
- Firmware, serial, model, manufacturer
- Capsule remaining/used/state/bar/display
- Preferred BLE device id, name pattern, seen/known devices
- Bridge URL, version, process control status and last error

Feedbacks:

- Connected / disconnected
- Heater on
- Charging
- Target reached
- Heating up
- Battery low / above / between
- BLE signal weak / quality is
- Temperature above / below
- Heat state is
- Capsule active / low / state is
- Bridge online / offline

## Capsule Tracker

The capsule tracker is an estimate, not a chemical sensor.

When you press `NEW CAPSULE`, the bridge starts tracking useful time. The estimate is consumed faster when:

- device temperature is higher,
- heater/device is active,
- the setpoint is reached.

You can correct it manually with capsule adjustment buttons.

State is stored in:

```text
crafty-session-state.json
```

## Documentation

- [Install Guide](INSTALL.md)
- [Companion Guide](COMPANION_USER_GUIDE.md)
- [API Reference](API_REFERENCE.md)
- [Official Plugin Roadmap](OFFICIAL_PLUGIN_ROADMAP.md)
- [Changelog](CHANGELOG.md)
