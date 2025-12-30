const express = require('express');
const fs = require('fs');

const router = express.Router();

const ENV_PATH = '/app/.env';
const ADMIN_PASS = process.env.ADMIN_UI_PASSWORD || '';

const KEYS = ['OPENAI_API_KEY', 'XAI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY'];

function maskValue(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (trimmed.length <= 8) return '********';
  return trimmed.slice(0, 4) + '****' + trimmed.slice(-4);
}

function readEnvFile() {
  try {
    return fs.readFileSync(ENV_PATH, 'utf8');
  } catch (_err) {
    return null;
  }
}

function parseEnv(text) {
  const lines = String(text || '').split('\n');
  const out = {};
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    out[key] = val;
  }
  return out;
}

function requireAdmin(req, res) {
  if (!ADMIN_PASS) {
    res.status(401).json({ ok: false, error: 'admin password not set' });
    return false;
  }
  const headerPass = req.headers['x-admin-password'];
  const bodyPass = req.body?.password;
  if (headerPass !== ADMIN_PASS && bodyPass !== ADMIN_PASS) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

router.get('/admin', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Admin Env</title>
  <style>
    :root {
      --bg: #0f1115;
      --card: #171a21;
      --muted: #8b93a7;
      --text: #e6e9f2;
      --accent: #6ea8fe;
      --ok: #2ecc71;
      --bad: #ff6b6b;
      --border: #2a2f3a;
    }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: var(--bg); color: var(--text); }
    .wrap { max-width: 720px; margin: 32px auto; padding: 0 16px; }
    h1 { font-size: 22px; margin: 0 0 12px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; box-shadow: 0 6px 24px rgba(0,0,0,0.25); }
    label { display:block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
    input[type="password"], input[type="text"] { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: #0c0f14; color: var(--text); }
    .row { margin-bottom: 16px; }
    .key-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }
    .status { font-size: 12px; color: var(--muted); }
    .pill { display:inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; }
    .pill.ok { background: rgba(46,204,113,0.2); color: var(--ok); }
    .pill.bad { background: rgba(255,107,107,0.2); color: var(--bad); }
    .actions { display:flex; gap: 8px; margin-top: 10px; }
    button { background: var(--accent); color: #0b0f1a; border: 0; padding: 10px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    button.secondary { background: #27304a; color: #cfd6ea; }
    .hint { color: var(--muted); font-size: 12px; margin-top: 6px; }
    .msg { margin-top: 12px; white-space: pre-wrap; font-size: 12px; color: var(--muted); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Env Manager</h1>
    <div class="card">
      <div class="row">
        <label>관리 비밀번호</label>
        <input id="pw" type="password" placeholder="ADMIN_UI_PASSWORD" />
        <div class="hint">비밀번호 입력 후 상태 조회/저장 가능</div>
      </div>

      <div class="row" id="statusWrap"></div>

      <div class="row">
        <label>OPENAI_API_KEY</label>
        <div class="key-row">
          <input id="OPENAI_API_KEY" type="text" placeholder="새 키 입력 (비워두면 유지)" />
          <label><input id="CLEAR_OPENAI_API_KEY" type="checkbox" /> Clear</label>
        </div>
      </div>
      <div class="row">
        <label>XAI_API_KEY</label>
        <div class="key-row">
          <input id="XAI_API_KEY" type="text" placeholder="새 키 입력 (비워두면 유지)" />
          <label><input id="CLEAR_XAI_API_KEY" type="checkbox" /> Clear</label>
        </div>
      </div>
      <div class="row">
        <label>GOOGLE_API_KEY</label>
        <div class="key-row">
          <input id="GOOGLE_API_KEY" type="text" placeholder="새 키 입력 (비워두면 유지)" />
          <label><input id="CLEAR_GOOGLE_API_KEY" type="checkbox" /> Clear</label>
        </div>
      </div>
      <div class="row">
        <label>ANTHROPIC_API_KEY</label>
        <div class="key-row">
          <input id="ANTHROPIC_API_KEY" type="text" placeholder="새 키 입력 (비워두면 유지)" />
          <label><input id="CLEAR_ANTHROPIC_API_KEY" type="checkbox" /> Clear</label>
        </div>
      </div>

      <div class="actions">
        <button onclick="loadStatus()" class="secondary">상태 조회</button>
        <button onclick="save()">저장</button>
        <button onclick="restart()" class="secondary">재시작</button>
      </div>
      <div class="msg" id="msg"></div>
    </div>
  </div>

<script>
  const KEYS = ['OPENAI_API_KEY','XAI_API_KEY','GOOGLE_API_KEY','ANTHROPIC_API_KEY'];

  function setMsg(text) {
    document.getElementById('msg').textContent = text || '';
  }

  async function loadStatus() {
    setMsg('');
    const pw = document.getElementById('pw').value;
    const res = await fetch('/admin/env', { headers: { 'x-admin-password': pw } });
    const data = await res.json();
    if (!data.ok) {
      setMsg(JSON.stringify(data, null, 2));
      return;
    }
    const wrap = document.getElementById('statusWrap');
    wrap.innerHTML = KEYS.map(function (k) {
      const v = data.values[k] || '';
      const ok = v.length > 0;
      const pill = ok ? 'ok' : 'bad';
      const label = ok ? 'SET' : 'EMPTY';
      return '<div class="status">' + k + ' : <span class="pill ' + pill + '">' + label + '</span> ' + (ok ? v : '') + '</div>';
    }).join('');
  }

  async function save() {
    setMsg('');
    const payload = {
      password: document.getElementById('pw').value,
      values: {
        OPENAI_API_KEY: document.getElementById('OPENAI_API_KEY').value,
        XAI_API_KEY: document.getElementById('XAI_API_KEY').value,
        GOOGLE_API_KEY: document.getElementById('GOOGLE_API_KEY').value,
        ANTHROPIC_API_KEY: document.getElementById('ANTHROPIC_API_KEY').value,
      },
      clears: {
        OPENAI_API_KEY: document.getElementById('CLEAR_OPENAI_API_KEY').checked,
        XAI_API_KEY: document.getElementById('CLEAR_XAI_API_KEY').checked,
        GOOGLE_API_KEY: document.getElementById('CLEAR_GOOGLE_API_KEY').checked,
        ANTHROPIC_API_KEY: document.getElementById('CLEAR_ANTHROPIC_API_KEY').checked,
      }
    };
    const res = await fetch('/admin/env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setMsg(JSON.stringify(data, null, 2));
    if (data.ok) await loadStatus();
  }

  async function restart() {
    setMsg('');
    const pw = document.getElementById('pw').value;
    const res = await fetch('/admin/restart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json();
    setMsg(JSON.stringify(data, null, 2));
  }

  loadStatus();
</script>
</body>
</html>
  `);
});

router.get('/admin/env', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const text = readEnvFile();
  if (text == null) {
    return res.status(500).json({ ok: false, error: 'env not found' });
  }
  const parsed = parseEnv(text);
  const values = {};
  for (const key of KEYS) {
    values[key] = maskValue(parsed[key] || '');
  }
  res.json({ ok: true, values });
});

router.post('/admin/env', express.json(), (req, res) => {
  if (!requireAdmin(req, res)) return;
  const values = req.body?.values || {};
  const clears = req.body?.clears || {};
  let env = readEnvFile();
  if (env == null) {
    return res.status(500).json({ ok: false, error: 'env not found' });
  }

  const setVar = (name, value, shouldClear) => {
    const line = `${name}=${value || ''}`;
    const re = new RegExp(`^${name}=.*$`, 'm');
    const hasValue = value != null && String(value).trim() !== '';
    if (!hasValue && !shouldClear) return;
    if (re.test(env)) {
      env = env.replace(re, line);
    } else {
      env += (env.endsWith('\n') ? '' : '\n') + line + '\n';
    }
  };

  setVar('OPENAI_API_KEY', values.OPENAI_API_KEY, clears.OPENAI_API_KEY);
  setVar('XAI_API_KEY', values.XAI_API_KEY, clears.XAI_API_KEY);
  setVar('GOOGLE_API_KEY', values.GOOGLE_API_KEY, clears.GOOGLE_API_KEY);
  setVar('ANTHROPIC_API_KEY', values.ANTHROPIC_API_KEY, clears.ANTHROPIC_API_KEY);

  fs.writeFileSync(ENV_PATH, env);
  res.json({ ok: true, note: 'saved. restart required.' });
});

router.post('/admin/restart', express.json(), (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, note: 'restarting...' });
  setTimeout(() => process.exit(0), 500);
});

module.exports = router;
