/**
 * google-home-tool.js
 * MCP Tool: Google Home 스마트홈 기기 제어
 */

const fs = require('fs');
const path = require('path');

// 경로
const DEVICES_PATH = path.join(__dirname, '../google-home/devices.json');
const TOKEN_PATH = path.join(__dirname, '../google-home/assistant-token.json');

/**
 * 토큰 로드
 */
function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
}

/**
 * 토큰 저장
 */
function saveToken(tokenData) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokenData, null, 2));
}

/**
 * access_token 갱신
 */
async function refreshAccessToken() {
  const tokenData = loadToken();
  if (!tokenData?.refresh_token) {
    throw new Error('refresh_token이 없습니다. 재인증이 필요합니다.');
  }

  const params = new URLSearchParams({
    client_id: tokenData.client_id,
    client_secret: tokenData.client_secret,
    refresh_token: tokenData.refresh_token,
    grant_type: 'refresh_token'
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const result = await response.json();

  if (result.access_token) {
    tokenData.access_token = result.access_token;
    saveToken(tokenData);
    console.log('[Google Home] 토큰 갱신 완료');
    return result.access_token;
  }

  throw new Error(`토큰 갱신 실패: ${JSON.stringify(result)}`);
}

// 기기 타입 한글 설명
const typeDescriptions = {
  'OUTLET': '콘센트',
  'SWITCH': '스위치',
  'LIGHT': '조명',
  'AC_UNIT': '에어컨',
  'TV': 'TV',
  'FAN': '선풍기',
  'SPEAKER': '스피커',
  'THERMOSTAT': '온도조절기',
  'CAMERA': '카메라',
  'LOCK': '도어락',
  'VACUUM': '청소기'
};

/**
 * 기기 데이터 로드
 */
function loadDevices() {
  try {
    if (fs.existsSync(DEVICES_PATH)) {
      return JSON.parse(fs.readFileSync(DEVICES_PATH, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to load devices:', error);
  }
  return [];
}

/**
 * 기기 검색 헬퍼
 */
function findDevices(devices, query) {
  const q = query.toLowerCase();
  return devices.filter(d => {
    if (d.name?.toLowerCase().includes(q)) return true;
    if (d.nicknames?.some(n => n.toLowerCase().includes(q))) return true;
    if (d.room?.toLowerCase().includes(q)) return true;
    if (d.type?.toLowerCase().includes(q)) return true;
    const typeDesc = typeDescriptions[d.type];
    if (typeDesc?.includes(q)) return true;
    if (q.includes('켜진') || q.includes('on')) return d.state?.on === true;
    if (q.includes('꺼진') || q.includes('off')) return d.state?.on === false;
    return false;
  });
}

/**
 * 기기 정보 포맷팅
 */
function formatDeviceInfo(device) {
  const typeDesc = typeDescriptions[device.type] || device.type;
  let info = `${device.name} (${typeDesc})`;
  info += `\n  위치: ${device.structure} > ${device.room}`;

  if (device.state) {
    if (device.state.on !== undefined) {
      info += `\n  전원: ${device.state.on ? '켜짐' : '꺼짐'}`;
    }
    if (device.state.brightness !== undefined) {
      info += `\n  밝기: ${device.state.brightness}%`;
    }
    if (device.state.temperatureSetpointCelsius !== undefined) {
      info += `\n  온도설정: ${device.state.temperatureSetpointCelsius}°C`;
    }
    if (device.state.currentFanSpeedPercent !== undefined) {
      info += `\n  팬속도: ${device.state.currentFanSpeedPercent}%`;
    }
  }

  return info;
}

/**
 * 스마트홈 기기 목록 조회
 */
async function listSmartDevices({ room = null, type = null, structure = null }) {
  const devices = loadDevices();

  if (devices.length === 0) {
    return {
      success: false,
      error: 'devices.json을 찾을 수 없습니다. HomeApp.json을 먼저 파싱해주세요.'
    };
  }

  let filtered = devices;

  if (room) {
    filtered = filtered.filter(d => d.room?.toLowerCase().includes(room.toLowerCase()));
  }
  if (type) {
    filtered = filtered.filter(d => d.type?.toLowerCase().includes(type.toLowerCase()));
  }
  if (structure) {
    filtered = filtered.filter(d => d.structure?.toLowerCase().includes(structure.toLowerCase()));
  }

  // 방별로 그룹화
  const byRoom = {};
  for (const device of filtered) {
    const roomName = device.room || '미지정';
    if (!byRoom[roomName]) byRoom[roomName] = [];
    byRoom[roomName].push({
      name: device.name,
      type: typeDescriptions[device.type] || device.type,
      state: device.state?.on !== undefined ? (device.state.on ? '켜짐' : '꺼짐') : '알 수 없음'
    });
  }

  return {
    success: true,
    총_기기수: filtered.length,
    방별_기기: byRoom
  };
}

/**
 * 특정 기기 상태 조회
 */
async function getDeviceState({ deviceName }) {
  const devices = loadDevices();
  const found = findDevices(devices, deviceName);

  if (found.length === 0) {
    return {
      success: false,
      error: `'${deviceName}' 기기를 찾을 수 없습니다.`
    };
  }

  if (found.length === 1) {
    return {
      success: true,
      기기정보: formatDeviceInfo(found[0])
    };
  }

  return {
    success: true,
    검색결과: `${found.length}개 기기 발견`,
    기기목록: found.map(d => formatDeviceInfo(d))
  };
}

/**
 * 기기 자연어 검색
 */
async function searchDevices({ query }) {
  const devices = loadDevices();
  const found = findDevices(devices, query);

  if (found.length === 0) {
    return {
      success: false,
      message: `'${query}'에 해당하는 기기가 없습니다.`
    };
  }

  return {
    success: true,
    검색어: query,
    결과수: found.length,
    기기목록: found.map(d => ({
      이름: d.name,
      타입: typeDescriptions[d.type] || d.type,
      위치: `${d.structure} > ${d.room}`,
      상태: d.state?.on !== undefined ? (d.state.on ? '켜짐' : '꺼짐') : '알 수 없음'
    }))
  };
}

/**
 * 방별 기기 요약
 */
async function getRoomsSummary() {
  const devices = loadDevices();

  if (devices.length === 0) {
    return {
      success: false,
      error: 'devices.json을 찾을 수 없습니다.'
    };
  }

  const byRoom = {};
  for (const device of devices) {
    const room = device.room || '미지정';
    if (!byRoom[room]) {
      byRoom[room] = { 기기수: 0, 켜진기기: 0, 기기목록: [] };
    }
    byRoom[room].기기수++;
    if (device.state?.on === true) byRoom[room].켜진기기++;
    byRoom[room].기기목록.push(`${device.name} (${typeDescriptions[device.type] || device.type})`);
  }

  return {
    success: true,
    총_기기수: devices.length,
    방별_요약: byRoom
  };
}

/**
 * Python bridge를 통한 Google Assistant 호출
 */
const { spawn } = require('child_process');
const BRIDGE_PATH = path.join(__dirname, '../google-home/assistant_bridge.py');

function callPythonBridge(args) {
  return new Promise((resolve, reject) => {
    // Python 실행 경로
    const pythonPaths = ['python3', 'python'];

    function tryPython(index) {
      if (index >= pythonPaths.length) {
        return reject(new Error('Python을 찾을 수 없습니다.'));
      }

      const pythonPath = pythonPaths[index];
      const proc = spawn(pythonPath, [BRIDGE_PATH, ...args], {
        env: { ...process.env, PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION: 'python' }
      });
      let stdout = '';
      let stderr = '';
      let hadError = false;

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('error', (err) => {
        console.log(`[Python Bridge] ${pythonPath} error:`, err.message);
        hadError = true;
        tryPython(index + 1);
      });
      proc.on('close', (code) => {
        // error 이벤트로 이미 다음 Python 시도 중이면 무시
        if (hadError) return;

        if (code !== 0) {
          // gRPC 없으면 다음 Python 시도
          if (stderr.includes('grpc') || stderr.includes('No module')) {
            return tryPython(index + 1);
          }
          return reject(new Error(stderr || `Python 종료 코드: ${code}`));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          resolve({ success: true, response: stdout.trim() });
        }
      });
    }

    tryPython(0);
  });
}

/**
 * 기기 제어 (Google Assistant 명령)
 * - Python bridge (gRPC) 사용
 * - 토큰 만료시 자동 갱신
 */
async function controlSmartDevice({ command }) {
  try {
    const tokenData = loadToken();

    if (!tokenData) {
      return {
        success: false,
        error: 'Google Assistant 토큰이 설정되지 않았습니다.',
        hint: 'assistant-token.json 파일을 설정해주세요.'
      };
    }

    // Python bridge 호출
    console.log(`[Google Home] 명령 전송: "${command}"`);
    const result = await callPythonBridge(['query', command]);

    if (result.success) {
      return {
        success: true,
        message: `명령 전송 완료: "${command}"`,
        response: result.response,
        note: '기기 상태는 devices.json과 동기화되지 않을 수 있습니다.'
      };
    }

    return {
      success: false,
      error: result.error || 'Python bridge 오류',
      hint: result.error?.includes('grpc')
        ? 'pip install grpcio google-assistant-grpc 를 실행하세요.'
        : undefined
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      hint: error.message.includes('Python')
        ? 'Python3와 grpcio 패키지가 필요합니다.'
        : undefined
    };
  }
}

// MCP 도구 정의 (Claude API tools 형식)
const tools = [
  {
    name: 'list_smart_devices',
    description: '집에 있는 모든 스마트홈 기기 목록을 조회합니다. 방별, 타입별로 정리된 기기 정보를 반환합니다.',
    input_schema: {
      type: 'object',
      properties: {
        room: { type: 'string', description: "특정 방만 조회 (예: '거실', '침실')" },
        type: { type: 'string', description: "특정 타입만 조회 (예: 'LIGHT', 'AC_UNIT', 'OUTLET')" },
        structure: { type: 'string', description: "특정 구조물만 조회 (예: '달곰이네', '망데쟁 카페')" }
      }
    }
  },
  {
    name: 'get_device_state',
    description: '특정 기기의 현재 상태를 조회합니다. 전원 상태, 밝기, 온도 등 상세 정보를 반환합니다.',
    input_schema: {
      type: 'object',
      properties: {
        deviceName: { type: 'string', description: "기기 이름 (예: '거실 조명', '에어컨')" }
      },
      required: ['deviceName']
    }
  },
  {
    name: 'search_devices',
    description: "기기를 자연어로 검색합니다. 이름, 별명, 방, 타입 등으로 검색 가능합니다. '켜진 기기', '꺼진 기기' 같은 상태 검색도 지원합니다.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: "검색어 (예: '조명', '에어컨', '거실', '켜진 기기')" }
      },
      required: ['query']
    }
  },
  {
    name: 'get_rooms_summary',
    description: '방별 기기 요약 정보를 조회합니다. 각 방에 어떤 기기가 있고, 몇 개가 켜져있는지 확인할 수 있습니다.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'control_smart_device',
    description: "Google Assistant를 통해 스마트홈 기기를 제어합니다. 자연어 명령으로 기기를 켜고/끄거나 설정을 변경할 수 있습니다.",
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: "제어 명령 (예: '거실 조명 켜줘', '에어컨 온도 24도로 설정해줘', '모든 조명 꺼줘')" }
      },
      required: ['command']
    }
  }
];

// 도구 실행 함수
async function executeTool(toolName, input) {
  switch (toolName) {
    case 'list_smart_devices':
      return await listSmartDevices(input);
    case 'get_device_state':
      return await getDeviceState(input);
    case 'search_devices':
      return await searchDevices(input);
    case 'get_rooms_summary':
      return await getRoomsSummary();
    case 'control_smart_device':
      return await controlSmartDevice(input);
    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

module.exports = {
  name: 'google-home',
  description: 'Google Home 스마트홈 기기 조회 및 제어',
  tools,
  executeTool,
  // 개별 함수도 export
  listSmartDevices,
  getDeviceState,
  searchDevices,
  getRoomsSummary,
  controlSmartDevice,
  refreshAccessToken
};
