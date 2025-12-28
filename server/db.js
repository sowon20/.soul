import fs from "fs";
import path from "path";

function getIndexPath(rootDir) {
  return path.join(rootDir, "index", "entries.ndjson");
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }
}

function toDateParts(tsMs) {
  const d = new Date(tsMs);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return { yyyy, mm, dd };
}

export function initDb(rootDir) {
  const indexPath = getIndexPath(rootDir);
  ensureFile(indexPath);
  return { rootDir, indexPath };
}

export function insertUtterance(db, row) {
  const tsMs = row.ts_ms || Date.now();
  const { yyyy, mm, dd } = toDateParts(tsMs);
  const dayDir = path.join(db.rootDir, yyyy, mm, dd);
  fs.mkdirSync(dayDir, { recursive: true });

  const dayLog = path.join(dayDir, "utterances.ndjson");
  ensureFile(dayLog);

  const line = JSON.stringify({ ...row, ts_ms: tsMs });
  fs.appendFileSync(dayLog, `${line}\n`);
  fs.appendFileSync(db.indexPath, `${line}\n`);
}

export function listRecent(db, limit = 20) {
  if (!fs.existsSync(db.indexPath)) return [];
  const data = fs.readFileSync(db.indexPath, "utf8").trim();
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
