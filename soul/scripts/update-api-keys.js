/**
 * API 키 업데이트 스크립트
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function updateAPIKeys() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/soul', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ MongoDB 연결됨');

    const db = mongoose.connection.db;
    const servicesCollection = db.collection('aiservices');

    // Anthropic API 키 업데이트
    if (process.env.ANTHROPIC_API_KEY) {
      const result = await servicesCollection.updateOne(
        { serviceId: 'anthropic' },
        { $set: { apiKey: process.env.ANTHROPIC_API_KEY } }
      );
      console.log(`✅ Anthropic API 키 업데이트됨 (${result.modifiedCount}개)`);
    } else {
      console.log('⚠️  ANTHROPIC_API_KEY 환경 변수가 없습니다');
    }

    // OpenAI API 키 업데이트
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_key_here') {
      const result = await servicesCollection.updateOne(
        { serviceId: 'openai' },
        { $set: { apiKey: process.env.OPENAI_API_KEY } }
      );
      console.log(`✅ OpenAI API 키 업데이트됨 (${result.modifiedCount}개)`);
    }

    // Google API 키 업데이트
    if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your_google_key_here') {
      const result = await servicesCollection.updateOne(
        { serviceId: 'google' },
        { $set: { apiKey: process.env.GOOGLE_API_KEY } }
      );
      console.log(`✅ Google API 키 업데이트됨 (${result.modifiedCount}개)`);
    }

    // 업데이트된 서비스 확인
    console.log('\n현재 API 키 상태:');
    const services = await servicesCollection.find({}).toArray();
    services.forEach(service => {
      const hasKey = service.apiKey && service.apiKey.length > 0;
      console.log(`- ${service.name}: ${hasKey ? '✓ 설정됨' : '✗ 미설정'}`);
    });

    await mongoose.connection.close();
    console.log('\n✅ 완료');
  } catch (error) {
    console.error('❌ 오류:', error);
    process.exit(1);
  }
}

updateAPIKeys();
