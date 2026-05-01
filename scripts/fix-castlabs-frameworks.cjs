const fs = require("node:fs");
const path = require("node:path");

function ensureSymlink(target, linkPath) {
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      return;
    }
    return;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  fs.symlinkSync(target, linkPath);
}

function fixFramework(frameworkPath) {
  const frameworkName = path.basename(frameworkPath, ".framework");
  const versionsPath = path.join(frameworkPath, "Versions");
  const versionAPath = path.join(versionsPath, "A");
  const binaryPath = path.join(versionAPath, frameworkName);

  if (!fs.existsSync(binaryPath)) {
    return;
  }

  ensureSymlink("A", path.join(versionsPath, "Current"));
  ensureSymlink(path.join("Versions", "Current", frameworkName), path.join(frameworkPath, frameworkName));

  for (const child of ["Resources", "Libraries", "Helpers"]) {
    if (fs.existsSync(path.join(versionAPath, child))) {
      ensureSymlink(path.join("Versions", "Current", child), path.join(frameworkPath, child));
    }
  }
}

module.exports = async function fixCastlabsFrameworks(context) {
  const productName = context.packager.appInfo.productFilename;
  const frameworksDir = path.join(context.appOutDir, `${productName}.app`, "Contents", "Frameworks");

  if (!fs.existsSync(frameworksDir)) {
    return;
  }

  for (const entry of fs.readdirSync(frameworksDir)) {
    if (entry.endsWith(".framework")) {
      fixFramework(path.join(frameworksDir, entry));
    }
  }
};
