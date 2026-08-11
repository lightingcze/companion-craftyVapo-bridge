# Crafty Bridge Companion Module

Bitfocus Companion module for Storz & Bickel Crafty devices through a local
Crafty Bridge HTTP service.

The module is intentionally a Companion-safe HTTP client. It does not spawn
local shell commands or manage background processes from inside Companion.
Run the Crafty Bridge service separately, then point this module at it.

This repository also includes the Windows bridge source and installer under
[`bridge/`](bridge/README.md). Runtime configuration, logs, backups, and local
release archives are intentionally kept outside the public source tree.

## Requirements

- Bitfocus Companion v5 or newer.
- A running Crafty Bridge service reachable over HTTP.
- A BLE-capable Windows PC for the bridge service.
- A supported Storz & Bickel Crafty or Crafty+ device.

Default bridge URL:

```text
http://127.0.0.1:4587
```

## Main Features

- Live device connection state.
- Current and target temperature display.
- Heater, stop, boost, boost-temperature, and temperature preset actions.
- Battery percent, battery state, and dynamic battery feedback.
- BLE RSSI and signal-quality display.
- Device info: firmware, BLE firmware, serial number, manufacturer, model.
- BLE scan, known-device selection, manual preferred BLE ID, and name matching.
- Capsule/session tracking with remaining-percent estimation.
- Ready-made presets for Stream Deck XL layouts.
- Dynamic feedbacks for connection, heat state, battery, BLE signal, and capsule state.

## Companion Setup

1. Install or load this module in Companion.
2. Add a new `Crafty Bridge` connection.
3. Set `Crafty bridge URL` to the bridge service URL.
4. Optional: enable `Scan BLE devices after save/load` to populate the known-device dropdown.
5. Optional: choose a `Known/seen BLE device` or enter a manual `Preferred BLE device ID`.
6. Optional: enable `Connect after applying device selection`.
7. Drag presets from the Presets tab to your Stream Deck layout.

## Useful Variables

- `$(crafty-bridge:status_short)`
- `$(crafty-bridge:status_line)`
- `$(crafty-bridge:temperature_display)`
- `$(crafty-bridge:temperature_short)`
- `$(crafty-bridge:battery_display)`
- `$(crafty-bridge:battery_short)`
- `$(crafty-bridge:ble_short)`
- `$(crafty-bridge:capsule_display)`
- `$(crafty-bridge:selected_device_short)`
- `$(crafty-bridge:bridge_process_status)`
- `$(crafty-bridge:bridge_last_error)`

## Official Release Notes

This module package is prepared as an official-plugin candidate. Before opening
a Bitfocus Companion module submission, replace the placeholder `repository`
and `bugs` URLs in `companion/manifest.json` with the final public GitHub
repository and issue tracker.

Use `PUBLISHING.md` and `npm run repo:set -- <owner>/<repo>` for the final
repository URL step.

## Version 0.1.17

- Removed Companion-side local process control for official sandbox compatibility.
- Removed hardcoded development machine paths from connection settings.
- Kept bridge control through HTTP API actions only.
- Fixed the Bridge shutdown preset definition used by the preset structure.
- Fixed Windows installer upgrades when the bridge is already running.
- Updated metadata and documentation toward official distribution.
- Preserved presets, BLE pairing, capsule tracking, dynamic status display, and feedbacks.
