# Crafty Bridge

This module connects Bitfocus Companion to Storz & Bickel Crafty devices through
the Crafty Bridge HTTP service.

Bridge URL default:

```text
http://127.0.0.1:4587
```

Run the bridge service separately before enabling this Companion connection.
For official Companion compatibility, this module does not start, stop, or
restart local processes from inside Companion.

## Connection Setup

- `Crafty bridge URL`: HTTP URL of the running bridge service.
- `Poll interval`: status refresh interval in milliseconds.
- `Device selection mode`: choose known device, manual BLE ID, or automatic matching.
- `Known/seen BLE device`: dropdown populated from bridge scan results.
- `Device name pattern`: regex used for automatic BLE discovery.
- `Scan BLE devices after save/load`: refresh discovered devices when the connection loads.
- `Connect after applying device selection`: apply the chosen device and connect automatically.

## Useful Button Text Examples

```text
$(crafty-bridge:status_short)
```

```text
$(crafty-bridge:temperature_display)
```

```text
$(crafty-bridge:battery_display)
```

```text
$(crafty-bridge:ble_short)
```

```text
$(crafty-bridge:capsule_display)
```

```text
Bridge $(crafty-bridge:bridge_process_status) v$(crafty-bridge:bridge_version)
```

## Presets

The Presets tab includes ready-made buttons for:

- dashboard status
- temperature display and temperature presets
- heater, stop, boost, connect, and disconnect
- BLE scan and known-device selection
- capsule/session tracking
- battery, BLE signal, and bridge health display

## Version 0.1.17

- Fixed offline Windows installer upgrades while the bridge is running.
- Fixed the missing Bridge shutdown preset definition.
- Companion-safe module packaging with no local shell/process spawning.
- Cleaner official-plugin metadata and help text.
- BLE pairing controls stay in Edit Connection and presets.
- Existing dynamic temperature, battery, BLE, and capsule feedbacks are preserved.
