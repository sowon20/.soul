/**
 * DDNS 서비스 - 외부 접속용 동적 DNS 자동 갱신
 *
 * 지원 프로바이더: DuckDNS, FreeDNS (afraid.org), No-IP
 * 서버 시작 시 + 주기적(30분)으로 IP 갱신
 */

let _interval = null;
const UPDATE_INTERVAL = 30 * 60 * 1000; // 30분

/**
 * DDNS 설정 로드 (DB config 테이블)
 */
async function getConfig() {
  try {
    const db = require('../db');
    if (!db.db) return null;
    const row = db.db.prepare('SELECT value FROM system_configs WHERE config_key = ?').get('ddns');
    if (!row) return null;
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

/**
 * DDNS 설정 저장
 */
async function saveConfig(config) {
  const db = require('../db');
  if (!db.db) db.init();
  const value = JSON.stringify(config);
  db.db.prepare(`
    INSERT INTO system_configs (config_key, value) VALUES ('ddns', ?)
    ON CONFLICT(config_key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).run(value, value);
}

/**
 * 공인 IP 가져오기
 */
async function getPublicIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const data = await res.json();
    return data.ip;
  } catch {
    try {
      const res = await fetch('https://checkip.amazonaws.com');
      const text = await res.text();
      return text.trim();
    } catch {
      return null;
    }
  }
}

/**
 * DuckDNS 업데이트
 */
async function updateDuckDNS(config) {
  const { subdomain, token } = config;
  if (!subdomain || !token) throw new Error('DuckDNS: subdomain과 token 필요');

  const url = `https://www.duckdns.org/update?domains=${encodeURIComponent(subdomain)}&token=${encodeURIComponent(token)}&verbose=true`;
  const res = await fetch(url);
  const text = await res.text();

  if (!text.startsWith('OK')) {
    throw new Error(`DuckDNS 업데이트 실패: ${text}`);
  }

  const lines = text.split('\n');
  return {
    success: true,
    ip: lines[1] || null,
    changed: lines[3] === 'UPDATED',
    domain: `${subdomain}.duckdns.org`
  };
}

/**
 * FreeDNS (afraid.org) 업데이트
 */
async function updateFreeDNS(config) {
  const { updateToken, domain } = config;
  if (!updateToken) throw new Error('FreeDNS: update token 필요');

  const url = `https://freedns.afraid.org/dynamic/update.php?${encodeURIComponent(updateToken)}`;
  const res = await fetch(url);
  const text = await res.text();

  // "Updated host to IP" 또는 "ERROR: Address has not changed."
  const isError = text.startsWith('ERROR:') && !text.includes('has not changed');

  if (isError) {
    throw new Error(`FreeDNS 업데이트 실패: ${text}`);
  }

  return {
    success: true,
    ip: text.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] || null,
    changed: !text.includes('has not changed'),
    domain: domain || 'freedns'
  };
}

/**
 * No-IP 업데이트
 */
async function updateNoIP(config) {
  const { hostname, username, password } = config;
  if (!hostname || !username || !password) {
    throw new Error('No-IP: hostname, username, password 필요');
  }

  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `https://dynupdate.no-ip.com/nic/update?hostname=${encodeURIComponent(hostname)}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'User-Agent': 'SoulAI/1.0 ddns-updater'
    }
  });
  const text = (await res.text()).trim();

  if (text.startsWith('good') || text.startsWith('nochg')) {
    return {
      success: true,
      ip: text.split(' ')[1] || null,
      changed: text.startsWith('good'),
      domain: hostname
    };
  }

  throw new Error(`No-IP 업데이트 실패: ${text}`);
}

/**
 * DDNS 업데이트 실행 (프로바이더 자동 감지)
 */
async function update(config) {
  if (!config || !config.provider || !config.enabled) return null;

  switch (config.provider) {
    case 'duckdns':
      return await updateDuckDNS(config);
    case 'freedns':
      return await updateFreeDNS(config);
    case 'noip':
      return await updateNoIP(config);
    default:
      throw new Error(`지원하지 않는 DDNS 프로바이더: ${config.provider}`);
  }
}

/**
 * DDNS 자동 갱신 시작 (서버 부팅 시 호출)
 */
async function startAutoUpdate() {
  stop();

  const config = await getConfig();
  if (!config || !config.enabled) {
    console.log('[DDNS] 비활성 상태');
    return;
  }

  // 즉시 1회 업데이트
  try {
    const result = await update(config);
    if (result) {
      console.log(`[DDNS] ${result.domain} → ${result.ip} (${result.changed ? '갱신됨' : '변경없음'})`);
    }
  } catch (err) {
    console.warn('[DDNS] 초기 업데이트 실패:', err.message);
  }

  // 주기적 갱신
  _interval = setInterval(async () => {
    try {
      const cfg = await getConfig();
      if (!cfg || !cfg.enabled) { stop(); return; }
      const result = await update(cfg);
      if (result?.changed) {
        console.log(`[DDNS] ${result.domain} → ${result.ip} (갱신됨)`);
      }
    } catch (err) {
      console.warn('[DDNS] 주기 업데이트 실패:', err.message);
    }
  }, UPDATE_INTERVAL);

  console.log(`[DDNS] 자동 갱신 시작 (${config.provider}, 30분 주기)`);
}

/**
 * 자동 갱신 중지
 */
function stop() {
  if (_interval) {
    clearInterval(_interval);
    _interval = null;
  }
}

module.exports = {
  getConfig,
  saveConfig,
  getPublicIP,
  update,
  startAutoUpdate,
  stop
};
