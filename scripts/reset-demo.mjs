import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

const projectRoot = process.cwd();
const configured = process.env.AUS_D1_STATE_DIRECTORY ?? ".wrangler/state";
const stateDirectory = isAbsolute(configured)
  ? configured
  : join(projectRoot, configured);

if (!existsSync(stateDirectory)) {
  console.log(`No existing demo state at ${stateDirectory}; nothing to back up.`);
  process.exit(0);
}

const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const backupDirectory = `${stateDirectory}-backup-${timestamp}`;
mkdirSync(dirname(stateDirectory), { recursive: true });
renameSync(stateDirectory, backupDirectory);
console.log(`Previous demo database moved to ${backupDirectory}`);
