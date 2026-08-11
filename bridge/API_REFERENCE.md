# API Reference

Base URL:

```text
http://127.0.0.1:4587
```

## GET Endpoints

`GET /health`

Returns bridge health.

`GET /capabilities`

Returns version and available actions.

`GET /snapshot`

Returns user-facing state for Companion.

`GET /status`

Returns full internal state.

`GET /device-info`

Returns firmware, serial, model and manufacturer info when known.

`GET /events`

Returns recent bridge events.

`GET /devices`

Returns seen BLE devices and current selection.

`GET /bridge-config`

Returns selected peripheral id and name pattern.

## POST Endpoints

`POST /refresh`

Refresh BLE data.

`POST /commands/connect`

Start scanning/connect flow.

`POST /commands/scan-devices`

Starts BLE scanning.

Body:

```json
{ "durationSeconds": 15 }
```

`POST /commands/stop-scan`

Stops BLE scanning.

`POST /commands/configure-device`

Body:

```json
{
  "preferredPeripheralId": "f4b8981f1f72",
  "matchNamePattern": "crafty|storz"
}
```

`POST /commands/select-device`

Body:

```json
{ "peripheralId": "f4b8981f1f72" }
```

`POST /commands/select-known-device`

Selects a device already saved in the known devices list.

Body:

```json
{ "peripheralId": "f4b8981f1f72" }
```

`POST /commands/clear-device-selection`

Clears the exact BLE id selection and falls back to name/service matching.

`POST /commands/forget-known-devices`

Clears the saved known devices list.

`POST /commands/bridge-shutdown`

Stops BLE and exits the bridge process. Companion cannot start the bridge again unless an external launcher/service starts it.

`POST /commands/disconnect`

Disconnect BLE peripheral.

`POST /commands/heater-on`

Turn heater on.

`POST /commands/heater-off`

Turn heater off.

`POST /commands/stop`

Turn heater off.

`POST /commands/preset`

Body:

```json
{ "temperatureC": 185 }
```

`POST /commands/set-target-temperature`

Body:

```json
{ "temperatureC": 185 }
```

`POST /commands/temperature-step`

Body:

```json
{ "stepC": 5 }
```

`POST /commands/set-boost-temperature`

Body:

```json
{ "temperatureC": 10 }
```

`POST /commands/capsule-new`

Body:

```json
{ "maxMinutes": 8, "label": "Capsule" }
```

`POST /commands/capsule-pause`

Pause capsule tracker.

`POST /commands/capsule-resume`

Resume capsule tracker.

`POST /commands/capsule-reset`

Reset capsule tracker.

`POST /commands/capsule-adjust`

Body:

```json
{ "minutes": 1 }
```

Positive values add used time. Negative values give time back.

`POST /commands/capsule-set-remaining`

Body:

```json
{ "remainingPercent": 50 }
```

`POST /commands/read-characteristic`

Developer endpoint.

Body:

```json
{ "characteristicUuid": "00000011-4C45-4B43-4942-265A524F5453" }
```

`POST /commands/raw-write`

Developer endpoint.

Body:

```json
{
  "characteristicUuid": "00000021-4C45-4B43-4942-265A524F5453",
  "payloadHex": "0807"
}
```
