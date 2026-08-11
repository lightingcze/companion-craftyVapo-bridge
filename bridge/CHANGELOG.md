# Changelog

## 0.1.17

- Fixed Windows upgrades failing when the running bridge locked `binding.node`.
- Installer now stops and waits for the existing Crafty Bridge before replacing files.
- Added a path-scoped fallback for a stale installed bridge process.

## 0.1.16

- Fixed `npm run stop` on PowerShell where `$pid` collided with the built-in `$PID` constant.
- Added the missing `bridge_shutdown` preset referenced by the Companion preset structure.
- Rebuilt the offline Windows installer and Companion module release artifacts.

## 0.1.15

- Added Companion-safe official release packaging.
- Added the offline Windows bridge installer with portable Node.js and autostart.

## 0.1.14

- Added compact Stream Deck display variables: status, temperature, battery, BLE and selected device.
- Improved disconnected-state display so missing battery/temperature no longer appears as 0% critical.
- Shortened dashboard preset text for Stream Deck XL readability.

## 0.1.13

- Improved Edit Connection device selection behavior.
- Known/seen device dropdown now wins over automatic mode when a device is selected.
- Delays automatic connect until after setup scan completes.

## 0.1.12

- Added cached preferred BLE peripheral connect path.
- Added BLE discovery/connect diagnostic fields.
- Improved reliability after bridge restart when the device is already in the seen-device list.

## 0.1.11

- Added Edit Connection device selection mode: known/seen, manual id, or automatic.
- Added optional BLE scan after connection save/load.
- Added optional connect after applying selected device.
- Added `device_selection_mode` Companion variable.

## 0.1.10

- Added Companion connection settings for local bridge start/stop/restart control.
- Added optional bridge autostart when the Companion connection loads.
- Added known/seen BLE device dropdown in Companion connection settings.
- Added bridge health and bridge last-error presets.
- Added bridge URL, version and last-error Companion variables.
- Added bridge online/offline feedbacks.
- Added timed BLE scanning and stop scan command.
- Added bridge shutdown command.
- Added persistent known BLE device list.
- Added Companion dropdown for selecting known devices.
- Added known/seen device presets and bridge operation presets.

## 0.1.9

- Added preferred BLE device selection.
- Added device name pattern configuration.
- Added scan/devices/config endpoints.
- Added Companion connection fields for pairing another device.
- Added pairing/setup presets.
- Added custom editable target and boost presets.

## 0.1.7

- Added capsule/session tracker.
- Added capsule actions: new, pause, resume, reset, adjust, set remaining.
- Added capsule variables and presets.
- Added generic dynamic feedbacks for temperature, battery, BLE signal, heat state and capsule state.
- Expanded documentation.

## 0.1.6

- Added richer dynamic display variables for temperature, battery and device state.
- Improved status presets.

## 0.1.5

- Added draggable Companion presets.

## 0.1.4

- Added additional variables, feedbacks and temperature actions.

## 0.1.3

- Added real BLE read/control support for Crafty.

## 0.1.0

- Initial bridge and Companion module prototype.
