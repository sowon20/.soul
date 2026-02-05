/**
 * TTS Route - Cartesia TTS 프록시
 * API 키를 백엔드에서 관리하여 클라이언트 노출 방지
 *
 * POST /api/tts/speak       - 텍스트 → 오디오 (PCM → WAV 변환)
 * POST /api/tts/config       - TTS 설정 저장/조회
 * GET  /api/tts/voices       - 사용 가능한 음성 목록
 */

const express = require('express');
const router = express.Router();
const APIKey = require('../models/APIKey');
const configManager = require('../utils/config');

const CARTESIA_API_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_VERSION = '2025-04-16';

// 기본 TTS 설정
const DEFAULT_TTS_CONFIG = {
  provider: 'cartesia',      // cartesia | modal | local
  voiceId: '6599ee28-8263-4b0b-b950-743921b06c10',  // 소울이 클론 음성
  modelId: 'sonic-3',
  language: 'ko',
  speed: 'normal',
  sampleRate: 24000,
  emotion: ['positivity'],
};

/**
 * PCM raw 데이터에 WAV 헤더 추가
 * Cartesia는 raw PCM을 반환하므로 브라우저 재생을 위해 WAV 헤더 필요
 */
function addWavHeader(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);               // sub-chunk size
  header.writeUInt16LE(1, 20);                // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // byte rate
  header.writeUInt16LE(numChannels * bitsPerSample / 8, 32);              // block align
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * POST /api/tts/speak - 텍스트 → WAV 오디오
 */
router.post('/speak', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text required' });
    }

    // TTS 설정 로드
    const config = await configManager.getConfigValue('tts', DEFAULT_TTS_CONFIG);

    // Cartesia API 키 조회
    const apiKey = await APIKey.getKey('cartesia');
    if (!apiKey) {
      return res.status(400).json({ error: 'Cartesia API key not configured' });
    }

    // Cartesia API 호출
    const response = await fetch(CARTESIA_API_URL, {
      method: 'POST',
      headers: {
        'Cartesia-Version': CARTESIA_VERSION,
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: config.modelId || DEFAULT_TTS_CONFIG.modelId,
        transcript: text.trim(),
        voice: {
          mode: 'id',
          id: config.voiceId || DEFAULT_TTS_CONFIG.voiceId,
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: config.sampleRate || DEFAULT_TTS_CONFIG.sampleRate,
        },
        language: config.language || DEFAULT_TTS_CONFIG.language,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[TTS] Cartesia error:', response.status, errText);
      return res.status(response.status).json({ error: `Cartesia: ${errText}` });
    }

    // raw PCM → WAV 변환
    const pcmBuffer = Buffer.from(await response.arrayBuffer());
    const wavBuffer = addWavHeader(pcmBuffer, config.sampleRate || 24000);

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': wavBuffer.length,
    });
    res.send(wavBuffer);

  } catch (error) {
    console.error('[TTS] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tts/config - TTS 설정 조회
 */
router.get('/config', async (req, res) => {
  try {
    const config = await configManager.getConfigValue('tts', DEFAULT_TTS_CONFIG);
    const hasKey = !!(await APIKey.getKey('cartesia'));
    res.json({ ...config, hasApiKey: hasKey });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tts/config - TTS 설정 저장
 */
router.post('/config', async (req, res) => {
  try {
    const { apiKey, ...settings } = req.body;

    // API 키가 포함되어 있으면 암호화 저장
    if (apiKey) {
      await APIKey.saveKey('cartesia', apiKey);
    }

    // 나머지 설정 저장
    if (Object.keys(settings).length > 0) {
      const current = await configManager.getConfigValue('tts', DEFAULT_TTS_CONFIG);
      await configManager.setConfigValue('tts', { ...current, ...settings }, 'TTS configuration');
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
