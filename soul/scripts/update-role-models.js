/**
 * 모든 역할의 모델을 최신 Claude Sonnet 4.5로 업데이트
 */

const mongoose = require('mongoose');

async function updateRoleModels() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/soul', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ MongoDB 연결됨');

    const db = mongoose.connection.db;
    const rolesCollection = db.collection('roles');

    // 모든 역할의 모델 업데이트
    const result = await rolesCollection.updateMany(
      {},
      {
        $set: {
          preferredModel: 'claude-sonnet-4-5-20250929',
          fallbackModel: 'claude-haiku-4-5-20251001'
        }
      }
    );

    console.log(`✅ ${result.modifiedCount}개 역할의 모델이 업데이트되었습니다`);

    // 업데이트된 역할 목록 확인
    const updatedRoles = await rolesCollection.find({}).toArray();
    console.log('\n업데이트된 역할 목록:');
    updatedRoles.forEach(role => {
      console.log(`- ${role.name}: ${role.preferredModel} (fallback: ${role.fallbackModel})`);
    });

    await mongoose.connection.close();
    console.log('\n✅ 완료');
  } catch (error) {
    console.error('❌ 오류:', error);
    process.exit(1);
  }
}

updateRoleModels();
