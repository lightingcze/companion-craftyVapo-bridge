const fs = require("node:fs");
const path = require("node:path");

const moduleRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(moduleRoot, "..");
const packageJson = require(path.join(moduleRoot, "package.json"));

const repoInput = process.argv[2] || "";
const outputDir = path.join(workspaceRoot, `public-repo-staging-${packageJson.version}`);

const directories = [".github", "companion", "src", "tools"];
const files = [
  ".gitignore",
  "build-config.cjs",
  "FINAL_SUBMISSION_AUDIT.md",
  "LICENSE",
  "OFFICIAL_RELEASE_CHECKLIST.md",
  "package-lock.json",
  "package.json",
  "PUBLISHING.md",
  "README.md",
  "SUBMISSION_STATUS.md",
];

function normalizeRepositoryUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";

  if (/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/i.test(raw)) {
    return raw;
  }

  if (/^[^/\s]+\/[^/\s]+$/.test(raw)) {
    return `https://github.com/${raw}`;
  }

  throw new Error(`Invalid GitHub repository value: ${value}`);
}

function copyDirectory(name) {
  fs.cpSync(path.join(moduleRoot, name), path.join(outputDir, name), {
    recursive: true,
    force: true,
  });
}

function copyFile(name) {
  fs.copyFileSync(path.join(moduleRoot, name), path.join(outputDir, name));
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

for (const directory of directories) {
  copyDirectory(directory);
}

for (const file of files) {
  copyFile(file);
}

const repository = normalizeRepositoryUrl(repoInput);
if (repository) {
  const manifestPath = path.join(outputDir, "companion", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.repository = repository;
  manifest.bugs = `${repository}/issues`;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const nextSteps = `# Public Repository Staging

Version: ${packageJson.version}

This folder is a clean source tree for the public Companion module repository.

## Repository URL

${repository ? repository : "Not set yet. Run npm run repo:set -- <owner>/<repo> after copying this source."}

## Suggested First Commands

\`\`\`powershell
npm ci
npm run lint
npm run release:audit
${repository ? "npm run release:audit:strict" : "npm run repo:set -- <github-owner>/companion-module-crafty-bridge"}
npm run package
\`\`\`

## Do Not Commit

- node_modules
- .npm-cache
- pkg
- release-inspect-*
- *.tgz
- *.zip
`;

fs.writeFileSync(path.join(outputDir, "PUBLIC_REPO_STAGING.md"), nextSteps);

console.log(`Created ${outputDir}`);
if (repository) {
  console.log(`Set repository URL: ${repository}`);
} else {
  console.log("Repository URL left as manifest placeholder.");
}
