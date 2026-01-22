#!/usr/bin/env node
/**
 * HomeApp.json (Google Takeout) 파싱
 * → devices.json 형식으로 변환
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// HomeApp.json 경로 (인자로 받거나 기본값)
const inputPath = process.argv[2] || path.join(__dirname, "HomeApp.json");
const outputPath = path.join(__dirname, "devices.json");

function parseHomeApp(data) {
  const devices = [];
  const structures = [];

  const homeAppData = data["Home App Data"] || data;

  for (const entry of homeAppData) {
    const fullStructures = entry.full_structures || [];

    for (const struct of fullStructures) {
      const structureName = struct.structure?.name || "Unknown";
      const structureId = struct.structure?.create_time?.seconds || Date.now();

      structures.push({
        id: `structure_${structureId}`,
        name: structureName,
        address: struct.structure?.physical_location?.description || ""
      });

      // 방과 기기 파싱
      const roomsAndDevices = struct.rooms_and_devices || [];
      for (const roomData of roomsAndDevices) {
        const roomName = roomData.room?.name || "기타";
        const roomType = roomData.room?.type || "OTHER";

        const roomDevices = roomData.devices || [];
        for (const device of roomDevices) {
          const parsed = parseDevice(device, roomName, structureName);
          if (parsed) {
            devices.push(parsed);
          }
        }
      }
    }

    // 할당되지 않은 기기
    const unassigned = entry.unassigned_devices || [];
    for (const device of unassigned) {
      const roomHint = device.room_hint || "미지정";
      const parsed = parseDevice(device, roomHint, "미지정");
      if (parsed) {
        devices.push(parsed);
      }
    }
  }

  return { devices, structures };
}

function parseDevice(device, roomName, structureName) {
  const name = device.agent_device_names?.name;
  const type = device.type;

  // 이름이나 타입이 없으면 스킵
  if (!name || !type) return null;

  // SCENE, ROUTINE, PHONE은 제외 (제어 불가)
  if (type.includes("SCENE") || type.includes("ROUTINE") || type.includes("PHONE")) {
    return null;
  }

  // 고유 ID 생성
  const createTime = device.create_time?.seconds || Date.now();
  const id = `device_${createTime}_${name.replace(/[^a-zA-Z0-9가-힣]/g, "_")}`;

  // 상태 파싱
  const state = parseState(device.state_changes || []);

  // traits 정리
  const traits = (device.supported_traits || []).map(t => t.replace("action.devices.traits.", ""));

  return {
    id,
    name,
    type: type.replace("action.devices.types.", ""),
    traits,
    room: roomName,
    structure: structureName,
    online: state.online ?? true,
    state,
    manufacturer: device.device_info?.manufacturer || null,
    model: device.device_info?.model || null,
    nicknames: device.agent_device_names?.nicknames || [],
    defaultNames: device.agent_device_names?.default_names || []
  };
}

function parseState(stateChanges) {
  const state = {};

  for (const change of stateChanges) {
    const stateData = change.state || {};

    // on_off
    if (stateData.on_off !== undefined) {
      state.on = stateData.on_off.on;
    }

    // online
    if (stateData.online !== undefined) {
      state.online = stateData.online.online;
    }

    // brightness
    if (stateData.brightness !== undefined) {
      state.brightness = stateData.brightness.brightness;
    }

    // color_setting
    if (stateData.color_setting !== undefined) {
      state.color = stateData.color_setting.color;
    }

    // temperature_setting (에어컨, 온도조절기)
    if (stateData.temperature_setting !== undefined) {
      const ts = stateData.temperature_setting;
      state.thermostat = {
        mode: ts.thermostat_mode,
        setpoint: ts.thermostat_temperature_setpoint,
        ambient: ts.thermostat_temperature_ambient,
        humidity: ts.thermostat_humidity_ambient
      };
    }

    // temperature_control (센서, 보일러)
    if (stateData.temperature_control !== undefined) {
      const tc = stateData.temperature_control;
      state.temperature = {
        ambient: tc.temperature_ambient_celsius,
        setpoint: tc.temperature_setpoint_celsius
      };
    }

    // humidity_setting
    if (stateData.humidity_setting !== undefined) {
      state.humidity = stateData.humidity_setting.humidity_ambient_percent;
    }

    // fan_speed
    if (stateData.fan_speed !== undefined) {
      state.fanSpeed = stateData.fan_speed.current_fan_speed_setting;
    }

    // start_stop (로봇청소기 등)
    if (stateData.start_stop !== undefined) {
      state.running = stateData.start_stop.is_running;
      state.paused = stateData.start_stop.is_paused;
    }

    // dock (로봇청소기)
    if (stateData.dock !== undefined) {
      state.docked = stateData.dock.is_docked;
    }

    // volume
    if (stateData.volume !== undefined) {
      state.volume = stateData.volume.current_volume;
      state.muted = stateData.volume.is_muted;
    }

    // arm_disarm (보안시스템)
    if (stateData.arm_disarm !== undefined) {
      state.armed = stateData.arm_disarm.is_armed;
    }

    // modes
    if (stateData.modes !== undefined) {
      state.modes = stateData.modes.current_mode_settings;
    }
  }

  return state;
}

// 타입별 한글 설명
const typeDescriptions = {
  LIGHT: "조명",
  OUTLET: "콘센트",
  SWITCH: "스위치",
  AC_UNIT: "에어컨",
  THERMOSTAT: "온도조절기",
  BOILER: "보일러",
  HEATER: "히터",
  FAN: "선풍기",
  AIRPURIFIER: "공기청정기",
  HUMIDIFIER: "가습기",
  VACUUM: "로봇청소기",
  WASHER: "세탁기",
  DRYER: "건조기",
  TV: "TV",
  SPEAKER: "스피커",
  CAMERA: "카메라",
  SENSOR: "센서",
  SECURITYSYSTEM: "보안시스템",
  ROUTER: "라우터",
  CONTROL_BRIDGE: "허브"
};

// 실행
try {
  console.log(`📂 입력 파일: ${inputPath}`);

  if (!fs.existsSync(inputPath)) {
    console.error("❌ HomeApp.json 파일을 찾을 수 없습니다.");
    console.log("사용법: node parse-homeapp.js [HomeApp.json 경로]");
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  const data = JSON.parse(raw);

  const result = parseHomeApp(data);

  // 통계 출력
  console.log(`\n📊 파싱 결과:`);
  console.log(`   구조물: ${result.structures.length}개`);
  result.structures.forEach(s => {
    console.log(`   - ${s.name}`);
  });

  console.log(`\n   기기: ${result.devices.length}개`);

  // 타입별 집계
  const byType = {};
  for (const d of result.devices) {
    byType[d.type] = (byType[d.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    const desc = typeDescriptions[type] || type;
    console.log(`   - ${desc} (${type}): ${count}개`);
  }

  // 방별 집계
  const byRoom = {};
  for (const d of result.devices) {
    byRoom[d.room] = (byRoom[d.room] || 0) + 1;
  }
  console.log(`\n   방별:`);
  for (const [room, count] of Object.entries(byRoom).sort((a, b) => b[1] - a[1])) {
    console.log(`   - ${room}: ${count}개`);
  }

  // 저장
  fs.writeFileSync(outputPath, JSON.stringify(result.devices, null, 2));
  console.log(`\n✅ 저장됨: ${outputPath}`);

  // 구조물 정보도 저장
  const structuresPath = path.join(__dirname, "structures.json");
  fs.writeFileSync(structuresPath, JSON.stringify(result.structures, null, 2));
  console.log(`✅ 저장됨: ${structuresPath}`);

} catch (e) {
  console.error("❌ 파싱 실패:", e.message);
  process.exit(1);
}
