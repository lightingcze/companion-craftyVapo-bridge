# Sources And Capabilities

This project now combines three useful source lines:

## 1. J-Cat/crafty-control

Source: [github.com/J-Cat/crafty-control](https://github.com/J-Cat/crafty-control)

What it confirms:
- Crafty can be controlled from a browser using Web Bluetooth.
- The device is identified as `Storz&Bickel` in the UI flow.
- The project was used to help identify Crafty service and characteristic UUIDs.

What we use from it:
- Historical context for the Crafty GATT profile.
- Confidence that the device family exposes standard BLE characteristics and a proprietary service.

## 2. lorek123/snb-ble

Source: [github.com/lorek123/snb-ble](https://github.com/lorek123/snb-ble)

What it confirms:
- There is a dedicated Python BLE library for `Volcano Hybrid`, `Venty`, and `Crafty/Crafty+`.
- The library exposes `scan`, `connect_device`, `update_state`,
  `set_target_temperature`, and `turn_heater_on`.
- The README explicitly shows support for reading current temperature and target temperature.

What we use from it:
- Functional naming for our bridge endpoints.
- Evidence that temperature control and heater control are supported for Crafty/Crafty+.
- A compatibility target for later parity testing.

## 3. Chuffnugget/volcano_integration

Source: [github.com/Chuffnugget/volcano_integration](https://github.com/Chuffnugget/volcano_integration)

What it confirms:
- Storz & Bickel integration patterns for heat, pump, LED brightness, and status monitoring.
- A Home Assistant service model with connect, disconnect, set temperature, and device settings.

What we use from it:
- Naming style for automation-friendly services.
- A model for how Companion could map controls to device actions.
- The idea that heater control and monitoring can be split cleanly.

## Current bridge status

The Windows bridge now:
- connects to the Crafty+ BLE peripheral
- reads current temperature
- reads battery percent
- captures a full GATT profile snapshot
- exposes device info such as model, manufacturer, serial, and firmware when available
- offers Companion-friendly HTTP endpoints for future write actions

## Important note

The bridge currently exposes some request endpoints as desired-state or placeholder actions.
That is intentional until we confirm the exact write semantics for every characteristic.
