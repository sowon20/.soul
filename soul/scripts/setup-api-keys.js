/**
 * API 키 설정 스크립트
 * APIKey 모델을 통해 암호화된 API 키 저장
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function setupAPIKeys() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/soul');

    console.log('✅ MongoDB 연결됨');

    const APIKey = require('../models/APIKey');

    // Anthropic API 키 저장
    if (process.env.ANTHROPIC_API_KEY) {
      await APIKey.saveKey('anthropic', process.env.ANTHROPIC_API_KEY);
      console.log('✅ Anthropic API 키 저장됨');
    } else {
      console.log('⚠️  ANTHROPIC_API_KEY 환경 변수가 없습니다');
    }

    // OpenAI API 키 저장
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here') {
      await APIKey.saveKey('openai', process.env.OPENAI_API_KEY);
      console.log('✅ OpenAI API 키 저장됨');
    }

    // Google API 키 저장
    if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your_google_key_here') {
      await APIKey.saveKey('google', process.env.GOOGLE_API_KEY);
      console.log('✅ Google API 키 저장됨');
    }

    // 저장된 키 확인
    console.log('\n현재 저장된 API 키:');
    const services = ['anthropic', 'openai', 'google', 'xai'];
    for (const service of services) {
      const key = await APIKey.getKey(service);
      console.log(`- ${service}: ${key ? '✓ 설정됨' : '✗ 미설정'}`);
    }

    await mongoose.connection.close();
    console.log('\n✅ 완료');
  } catch (error) {
    console.error('❌ 오류:', error);
    process.exit(1);
  }
}

setupAPIKeys();
