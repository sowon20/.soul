import fs from "fs";
import path from "path";

const DEFAULT_CONFIG = {
  stores: [
    {
      id: "default",
      name: "default",
      description: "기본 저장소",
      folder: "default",
    },
  ],
  integrations: [
    { id: "google-home", name: "Google Home", enabled: false },
    {
      id: "tuya",
      name: "Tuya",
      enabled: false,
      settings: { endpoint: "https://openapi.tuyaus.com" },
    },
  ],
};

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function initStorage(rootDir) {
  ensureDir(rootDir);
  ensureDir(path.join(rootDir, "data"));
  ensureDir(path.join(rootDir, "media"));
  ensureDir(path.join(rootDir, "index"));
  ensureDir(path.join(rootDir, "config"));
  ensureDir(path.join(rootDir, "credentials"));
}

export function getConfigPath(rootDir) {
  return path.join(rootDir, "config", "config.json");
}

export function loadConfig(rootDir) {
  const configPath = getConfigPath(rootDir);
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.integrations) parsed.integrations = DEFAULT_CONFIG.integrations;
  if (!parsed.integrations.find((i) => i.id === "tuya")) {
    parsed.integrations.push(DEFAULT_CONFIG.integrations.find((i) => i.id === "tuya"));
  }
  return parsed;
}

export function saveConfig(rootDir, config) {
  const configPath = getConfigPath(rootDir);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function findStoreByName(config, name) {
  return config.stores.find((store) => store.name === name);
}

export function findStoreById(config, id) {
  return config.stores.find((store) => store.id === id);
}
