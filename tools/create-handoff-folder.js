const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const moduleRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(moduleRoot, "..");
const packageJson = require(path.join(moduleRoot, "package.json"));

const manifestPath = path.join(workspaceRoot, "RELEASE_MANIFEST.json");
const sumsPath = path.join(workspaceRoot, "SHA256SUMS.txt");
const handoffDir = path.join(workspaceRoot, `release-handoff-${packageJson.version}`);

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assertFileMatches(artifact) {
  const filePath = path.join(workspaceRoot, artifact.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing artifact: ${artifact.file}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.size !== artifact.bytes) {
    throw new Error(`Size mismatch for ${artifact.file}: ${stat.size} !== ${artifact.bytes}`);
  }

  const actualHash = sha256(filePath);
  if (actualHash !== artifact.sha256) {
    throw new Error(`SHA256 mismatch for ${artifact.file}: ${actualHash} !== ${artifact.sha256}`);
  }
}

function copyRootFile(fileName) {
  fs.copyFileSync(path.join(workspaceRoot, fileName), path.join(handoffDir, fileName));
}

if (!fs.existsSync(manifestPath)) {
  throw new Error("Run npm run release:manifest first.");
}

if (!fs.existsSync(sumsPath)) {
  throw new Error("Run npm run release:manifest first.");
}

const releaseManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
for (const artifact of releaseManifest.artifacts || []) {
  assertFileMatches(artifact);
}

fs.rmSync(handoffDir, { recursive: true, force: true });
fs.mkdirSync(handoffDir, { recursive: true });

for (const artifact of releaseManifest.artifacts || []) {
  copyRootFile(artifact.file);
}
copyRootFile("RELEASE_MANIFEST.json");
copyRootFile("SHA256SUMS.txt");

const readme = `# Crafty Bridge Companion Module Handoff

Version: ${packageJson.version}

This folder contains the verified release-candidate handoff bundle.

## Files

- \`companion-module-crafty-bridge-${packageJson.version}-official-rc.tgz\`: import into Bitfocus Companion for local testing.
- \`companion-module-crafty-bridge-${packageJson.version}-source.zip\`: use as the initial public GitHub repository source.
- \`RELEASE_MANIFEST.json\`: machine-readable release metadata and hashes.
- \`SHA256SUMS.txt\`: compact SHA256 checksum list.

## Final Public Submission Step

Create the public GitHub repository, unpack the source zip into it, then run:

\`\`\`powershell
npm ci
npm run repo:set -- <github-owner>/companion-module-crafty-bridge
npm run lint
npm run release:audit:strict
npm run package
\`\`\`

The strict audit should pass only after the real repository URL is set.
`;

fs.writeFileSync(path.join(handoffDir, "HANDOFF_README.md"), readme);

console.log(`Created ${handoffDir}`);
