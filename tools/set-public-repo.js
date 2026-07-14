const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "companion", "manifest.json");
const input = process.argv[2];

function usage() {
  console.error("Usage:");
  console.error("  npm run repo:set -- <github-owner>/<repo-name>");
  console.error("  npm run repo:set -- https://github.com/<github-owner>/<repo-name>");
  process.exit(1);
}

function normalizeRepositoryUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) usage();

  if (/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+$/i.test(raw)) {
    return raw;
  }

  if (/^[^/\s]+\/[^/\s]+$/.test(raw)) {
    return `https://github.com/${raw}`;
  }

  usage();
}

const repository = normalizeRepositoryUrl(input);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

manifest.repository = repository;
manifest.bugs = `${repository}/issues`;

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Updated manifest repository: ${manifest.repository}`);
console.log(`Updated manifest bugs: ${manifest.bugs}`);
console.log("Next: npm run release:audit:strict");
