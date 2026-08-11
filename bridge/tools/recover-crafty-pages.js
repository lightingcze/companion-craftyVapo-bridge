const fs = require("node:fs");
const path = require("node:path");

const [currentPath, backupPath, outputPath] = process.argv.slice(2);
if (!currentPath || !backupPath || !outputPath) {
  throw new Error("Usage: node recover-crafty-pages.js <current> <backup> <output>");
}

const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const blockedActions = new Set(["bridge_start", "bridge_stop", "bridge_restart"]);

function findCraftyInstance(config) {
  const matches = Object.entries(config.instances || {}).filter(
    ([, instance]) => instance.moduleId === "crafty-bridge",
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one Crafty Bridge instance, found ${matches.length}`);
  }
  return matches[0];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function remapConnection(value, oldConnectionId, newConnectionId) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item) => remapConnection(item, oldConnectionId, newConnectionId));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "connectionId" && child === oldConnectionId) {
      value[key] = newConnectionId;
    } else {
      remapConnection(child, oldConnectionId, newConnectionId);
    }
  }
}

function removeBlockedActions(value) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index--) {
      const item = value[index];
      if (item?.type === "action" && blockedActions.has(item.definitionId)) {
        value.splice(index, 1);
      } else {
        removeBlockedActions(item);
      }
    }
    return;
  }
  Object.values(value).forEach(removeBlockedActions);
}

function entityCounts(value) {
  const result = { actions: 0, feedbacks: 0 };
  function walk(item) {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (item.type === "action") result.actions++;
    if (item.type === "feedback") result.feedbacks++;
    Object.values(item).forEach(walk);
  }
  walk(value);
  return result;
}

const [oldConnectionId] = findCraftyInstance(backup);
const [newConnectionId, newInstance] = findCraftyInstance(current);
newInstance.label = "crafty-bridge";

let restoredControls = 0;
for (const pageNumber of ["10", "11"]) {
  const oldPage = backup.pages?.[pageNumber];
  const currentPage = current.pages?.[pageNumber];
  if (!oldPage || !currentPage || oldPage.name !== currentPage.name) {
    throw new Error(`Page ${pageNumber} is missing or has an unexpected name`);
  }

  for (const [rowNumber, oldRow] of Object.entries(oldPage.controls || {})) {
    currentPage.controls[rowNumber] ||= {};
    for (const [columnNumber, oldControlValue] of Object.entries(oldRow || {})) {
      const oldControl = clone(oldControlValue);
      remapConnection(oldControl, oldConnectionId, newConnectionId);
      removeBlockedActions(oldControl);
      const currentControl = currentPage.controls[rowNumber][columnNumber];

      if (!currentControl) {
        currentPage.controls[rowNumber][columnNumber] = oldControl;
        restoredControls++;
        continue;
      }

      const oldStepCounts = entityCounts(oldControl.steps);
      const currentStepCounts = entityCounts(currentControl.steps);
      if (oldStepCounts.actions > 0 && currentStepCounts.actions === 0) {
        currentControl.steps = oldControl.steps;
        restoredControls++;
      }

      const oldFeedbackCounts = entityCounts(oldControl.feedbacks);
      const currentFeedbackCounts = entityCounts(currentControl.feedbacks);
      if (oldFeedbackCounts.feedbacks > 0 && currentFeedbackCounts.feedbacks === 0) {
        currentControl.feedbacks = oldControl.feedbacks;
        restoredControls++;
      }

      const oldLocalVariableCounts = entityCounts(oldControl.localVariables);
      const currentLocalVariableCounts = entityCounts(currentControl.localVariables);
      if (
        oldLocalVariableCounts.feedbacks > 0 &&
        currentLocalVariableCounts.feedbacks === 0
      ) {
        currentControl.localVariables = oldControl.localVariables;
        restoredControls++;
      }
    }
  }
}

const serialized = `${JSON.stringify(current, null, "\t")}\n`;
if (serialized.includes(oldConnectionId)) {
  throw new Error("Recovered configuration still references the removed Crafty connection");
}
for (const actionId of blockedActions) {
  if (serialized.includes(`"definitionId": "${actionId}"`)) {
    throw new Error(`Recovered configuration contains unsupported action ${actionId}`);
  }
}

fs.writeFileSync(outputPath, serialized);
const totals = entityCounts(current);
console.log(JSON.stringify({
  output: path.resolve(outputPath),
  restoredControls,
  actions: totals.actions,
  feedbacks: totals.feedbacks,
  connectionId: newConnectionId,
  connectionLabel: newInstance.label,
}, null, 2));
