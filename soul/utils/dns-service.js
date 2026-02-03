/**
 * 네트워크 서비스 - mDNS로 soul.local 자동 검색
 *
 * 전기만 꽂으면 같은 네트워크에서 soul.local:5041 으로 접속 가능
 * (iPhone, Mac, Windows 10+, Android 12+ 모두 설정 없이 동작)
 */

const os = require('os');

let _bonjour = null;
let _published = null;

const HOSTNAME = 'soul';

/**
 * 서버의 로컬 IP 주소 가져오기
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * mDNS 광고 시작
 */
function startFromConfig() {
  stop();

  const port = parseInt(process.env.PORT) || 5041;

  try {
    const { Bonjour } = require('bonjour-service');
    _bonjour = new Bonjour();
    _published = _bonjour.publish({
      name: HOSTNAME,
      type: 'http',
      port,
      host: `${HOSTNAME}.local`,
      txt: { path: '/', service: 'soul-ai' }
    });

    const localIP = getLocalIP();
    console.log(`[Network] mDNS: http://${HOSTNAME}.local:${port}`);
    console.log(`[Network] IP:   http://${localIP}:${port}`);
  } catch (err) {
    console.warn('[Network] mDNS failed:', err.message);
    console.log(`[Network] IP:   http://${getLocalIP()}:${port}`);
  }
}

/**
 * mDNS 중지
 */
function stop() {
  try {
    if (_published) { _published.stop?.(); _published = null; }
    if (_bonjour) { _bonjour.destroy(); _bonjour = null; }
  } catch { /* ignore */ }
}

module.exports = { startFromConfig, stop, getLocalIP };
