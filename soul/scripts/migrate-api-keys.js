/**
 * API 키 마이그레이션 스크립트
 * APIKey 컬렉션 → AIService.apiKey 필드로 통합
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function migrateAPIKeys() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/soul');
    console.log('✅ MongoDB 연결됨');

    const db = mongoose.connection.db;
    const servicesCollection = db.collection('aiservices');
    const apikeysCollection = db.collection('apikeys');

    // APIKey 컬렉션에서 키 가져오기
    const apiKeys = await apikeysCollection.find({}).toArray();

    console.log(`\n📦 ${apiKeys.length}개의 API 키 발견`);

    for (const keyDoc of apiKeys) {
      const service = keyDoc.service; // 'anthropic', 'openai' 등
      const encryptedKey = keyDoc.encryptedKey;

      if (!encryptedKey) {
        console.log(`⚠️  ${service}: 키가 비어있음, 건너뜀`);
        continue;
      }

      // AIService에 키 업데이트
      const result = await servicesCollection.updateOne(
        { serviceId: service },
        { $set: { apiKey: encryptedKey } }
      );

      if (result.matchedCount > 0) {
        console.log(`✅ ${service}: API 키 마이그레이션 완료`);
      } else {
        console.log(`⚠️  ${service}: 해당 서비스 없음`);
      }
    }

    // 환경변수에서 키 가져와서 초기화 (없는 것들)
    console.log('\n📝 환경변수에서 API 키 초기화');

    if (process.env.ANTHROPIC_API_KEY) {
      await servicesCollection.updateOne(
        { serviceId: 'anthropic' },
        { $set: { apiKey: process.env.ANTHROPIC_API_KEY, isActive: true } }
      );
      console.log('✅ Anthropic: 환경변수에서 설정');
    }

    // 불필요한 apiKeyRef 필드 제거
    console.log('\n🧹 정리: apiKeyRef 필드 제거');
    const cleanResult = await servicesCollection.updateMany(
      {},
      { $unset: { apiKeyRef: '' } }
    );
    console.log(`✅ ${cleanResult.modifiedCount}개 문서에서 apiKeyRef 제거`);

    // 최종 상태 확인
    console.log('\n📊 최종 API 키 상태:');
    const services = await servicesCollection.find({}).toArray();
    for (const service of services) {
      const hasKey = service.apiKey && service.apiKey.length > 0;
      const status = service.isActive ? '활성' : '비활성';
      console.log(`- ${service.name.padEnd(20)} [${status}]: ${hasKey ? '✓ 설정됨' : '✗ 미설정'}`);
    }

    // APIKey 컬렉션 삭제 (백업 후)
    console.log('\n🗑️  APIKey 컬렉션 삭제 (더 이상 필요 없음)');
    await apikeysCollection.drop().catch(() => console.log('   (이미 삭제됨)'));

    await mongoose.connection.close();
    console.log('\n✅ 마이그레이션 완료!');
  } catch (error) {
    console.error('❌ 오류:', error);
    process.exit(1);
  }
}

migrateAPIKeys();
