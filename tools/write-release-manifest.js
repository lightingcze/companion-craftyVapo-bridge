const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const moduleRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(moduleRoot, "..");
const packageJson = require(path.join(moduleRoot, "package.json"));
const companionManifest = require(path.join(moduleRoot, "companion", "manifest.json"));

const artifacts = [
  `companion-module-crafty-bridge-${packageJson.version}-official-rc.tgz`,
  `companion-module-crafty-bridge-${packageJson.version}-source.zip`,
];

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const generatedAt = new Date().toISOString();
const releaseArtifacts = artifacts.map((name) => {
  const filePath = path.join(workspaceRoot, name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing release artifact: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  return {
    file: name,
    bytes: stat.size,
    sha256: sha256(filePath),
  };
});

const releaseManifest = {
  generatedAt,
  packageName: packageJson.name,
  companionModuleId: companionManifest.id,
  version: packageJson.version,
  companionApiVersion: companionManifest.runtime?.apiVersion,
  runtime: companionManifest.runtime,
  repository: companionManifest.repository,
  bugs: companionManifest.bugs,
  artifacts: releaseArtifacts,
  notes: [
    "Runtime tgz is for local Companion import/testing.",
    "Source zip mirrors the public GitHub repository source layout.",
    "Strict audit must pass before publishing or submitting the module.",
  ],
};

const manifestPath = path.join(workspaceRoot, "RELEASE_MANIFEST.json");
const sumsPath = path.join(workspaceRoot, "SHA256SUMS.txt");

fs.writeFileSync(manifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`);
fs.writeFileSync(
  sumsPath,
  `${releaseArtifacts.map((artifact) => `${artifact.sha256}  ${artifact.file}`).join("\n")}\n`,
);

console.log(`Wrote ${manifestPath}`);
console.log(`Wrote ${sumsPath}`);
