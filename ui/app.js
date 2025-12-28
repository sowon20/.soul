const rootPathEl = document.querySelector("#root-path");
const tokenEnabledEl = document.querySelector("#token-enabled");
const storeListEl = document.querySelector("#store-list");
const storeFormEl = document.querySelector("#store-form");
const storeNameEl = document.querySelector("#store-name");
const storeFolderEl = document.querySelector("#store-folder");
const storeDescEl = document.querySelector("#store-desc");
const tabButtons = document.querySelectorAll(".tab");
const tabEntriesEl = document.querySelector("#tab-entries");
const tabMemoryEl = document.querySelector("#tab-memory");
const tabFilesEl = document.querySelector("#tab-files");

let adminToken = localStorage.getItem("admin_token") || "";
if (!adminToken) {
  adminToken = prompt("관리 토큰이 있으면 입력하세요 (없으면 엔터):") || "";
  if (adminToken) localStorage.setItem("admin_token", adminToken);
}

const apiHeaders = () =>
  adminToken ? { "X-Admin-Token": adminToken } : {};

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...apiHeaders(),
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `request failed: ${res.status}`);
  }
  return res.json();
}

async function loadSettings() {
  const data = await fetchJson("/api/settings");
  rootPathEl.value = data.soul_root;
  tokenEnabledEl.value = data.admin_token_enabled ? "ON" : "OFF";
}

function renderStores(stores) {
  storeListEl.innerHTML = "";
  stores.forEach((store) => {
    const item = document.createElement("div");
    item.className = "list-item";

    const name = document.createElement("input");
    name.value = store.name;

    const folder = document.createElement("input");
    folder.value = store.folder || "";

    const desc = document.createElement("input");
    desc.value = store.description || "";

    const save = document.createElement("button");
    save.textContent = "저장";
    save.addEventListener("click", async () => {
      await fetchJson(`/api/stores/${store.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.value,
          folder: folder.value,
          description: desc.value,
        }),
      });
      await loadStores();
    });

    const del = document.createElement("button");
    del.textContent = "삭제";
    del.className = "danger";
    del.addEventListener("click", async () => {
      if (!confirm("삭제할까요?")) return;
      await fetchJson(`/api/stores/${store.id}`, { method: "DELETE" });
      await loadStores();
    });

    item.appendChild(name);
    item.appendChild(folder);
    item.appendChild(desc);
    item.appendChild(save);
    item.appendChild(del);
    storeListEl.appendChild(item);
  });
}

async function loadStores() {
  const data = await fetchJson("/api/stores");
  renderStores(data.stores || []);
}

function renderEntries(items) {
  tabEntriesEl.innerHTML = items
    .map(
      (item) =>
        `<div class="log-item"><strong>${item.store_name}</strong> ${
          item.category || ""
        }<div>${item.text}</div><small>${new Date(
          item.ts_ms
        ).toLocaleString()}</small></div>`
    )
    .join("");
}

function renderMemory(items) {
  tabMemoryEl.innerHTML = items
    .map(
      (item) =>
        `<div class="log-item"><strong>요약</strong><div>${item.summary}</div><small>${new Date(
          item.ts_ms
        ).toLocaleString()}</small></div>`
    )
    .join("");
}

function renderFiles(items) {
  tabFilesEl.innerHTML = items
    .map(
      (item) =>
        `<div class="log-item"><strong>${item.text}</strong><div>${
          item.file_meta?.mime_type || ""
        }</div><small>${new Date(item.ts_ms).toLocaleString()}</small></div>`
    )
    .join("");
}

async function loadDataViews() {
  const entries = await fetchJson("/api/entries?limit=30");
  renderEntries(entries.items || []);
  const memory = await fetchJson("/api/memory?limit=10");
  renderMemory(memory.items || []);
  const files = await fetchJson("/api/files?limit=20");
  renderFiles(files.items || []);
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.remove("active");
    });
    const target = document.querySelector(`#tab-${btn.dataset.tab}`);
    if (target) target.classList.add("active");
  });
});

storeFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = storeNameEl.value.trim();
  const folder = storeFolderEl.value.trim();
  if (!name) return;
  if (!folder) return;
  const description = storeDescEl.value.trim();
  await fetchJson("/api/stores", {
    method: "POST",
    body: JSON.stringify({ name, folder, description }),
  });
  storeNameEl.value = "";
  storeFolderEl.value = "";
  storeDescEl.value = "";
  await loadStores();
});

loadSettings()
  .then(loadStores)
  .then(loadDataViews)
  .catch((error) => {
    alert(error.message);
  });
