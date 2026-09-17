import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const requiredFiles = [
  "LICENSE.md",
  "NOTICE.md",
  "THIRD_PARTY_NOTICES.md",
  "CONTRIBUTING.md",
  "PROVENANCE.md",
  "AUTHORS.md",
  "EVALUATOR_AUTHORIZATION_TEMPLATE.md",
  "REPOSITORY_HARDENING.md",
  "build/sites-vite-plugin.LICENSE",
  "vendor/shadcn-tailwind-4.13.0.LICENSE.md",
];

for (const file of requiredFiles) {
  assert.doesNotThrow(() => readFileSync(file), `Required licensing file is missing: ${file}`);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(packageJson.private, true, "package.json must remain private:true");
assert.equal(
  packageJson.license,
  "SEE LICENSE IN LICENSE.md",
  "package.json must point to the evaluation-only license",
);

const license = readFileSync("LICENSE.md", "utf8");
const notice = readFileSync("NOTICE.md", "utf8");
const thirdParty = readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
for (const phrase of [
  "Austin Evaluation-Only License 1.0",
  "AUS-HOMEWORK-MADMAX3366-2026-09",
  "Public availability does not make this Artifact open source",
]) {
  assert.ok(license.includes(phrase), `LICENSE.md is missing required phrase: ${phrase}`);
}
assert.ok(notice.includes("Not Open Source"), "NOTICE.md must remain prominent");
assert.ok(thirdParty.includes("shadcn"), "shadcn attribution is missing");
assert.ok(thirdParty.includes("OpenAI Sites"), "OpenAI Sites attribution is missing");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

assert.equal(
  sha256("build/sites-vite-plugin.LICENSE"),
  "7de1e115d165f176e68f962acdb809b5ab8d8ae78d3981e0701392b2ac50c713",
  "OpenAI Sites MIT license text changed or was removed",
);
assert.equal(
  sha256("vendor/shadcn-tailwind-4.13.0.LICENSE.md"),
  "1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f",
  "shadcn MIT license text changed or was removed",
);

console.log("License policy PASS: proprietary notice and third-party carve-outs are intact");
