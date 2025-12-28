import fs from "fs";
import path from "path";

function getLogPath(rootDir) {
  return path.join(rootDir, "data", "utterances.ndjson");
}

export function initDb(rootDir) {
  const logPath = getLogPath(rootDir);
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "");
  }
  return { logPath };
}

export function insertUtterance(db, row) {
  const line = JSON.stringify(row);
  fs.appendFileSync(db.logPath, `${line}\n`);
}

export function listRecent(db, limit = 20) {
  if (!fs.existsSync(db.logPath)) return [];
  const data = fs.readFileSync(db.logPath, "utf8").trim();
  if (!data) return [];
  const lines = data.split("\n").slice(-limit);
  return lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
