/**
 * 과거 대화 전체를 벡터 임베딩하는 일회성 스크립트
 *
 * 사용법: node soul/scripts/embed-all-conversations.js
 */

const path = require('path');
const fs = require('fs');

async function embedAllConversations() {
  console.log('[EmbedAll] 시작...\n');

  try {
    // 1. 설정 로드
    const configManager = require('../utils/config');
    const memoryConfig = await configManager.getMemoryConfig();

    if (!memoryConfig?.storagePath) {
      console.error('[EmbedAll] storagePath 미설정. 설정 > 저장소에서 경로를 설정하세요.');
      return;
    }

    const storagePath = memoryConfig.storagePath.replace(/^~/, require('os').homedir());
    const conversationsDir = path.join(storagePath, 'conversations');

    if (!fs.existsSync(conversationsDir)) {
      console.error(`[EmbedAll] 대화 디렉토리 없음: ${conversationsDir}`);
      return;
    }

    // 2. 모든 날짜 파일 찾기
    const allFiles = [];
    const monthDirs = fs.readdirSync(conversationsDir)
      .filter(name => /^\d{4}-\d{2}$/.test(name))
      .sort();

    for (const monthDir of monthDirs) {
      const monthPath = path.join(conversationsDir, monthDir);
      const dayFiles = fs.readdirSync(monthPath)
        .filter(name => name.endsWith('.json') && !name.startsWith('._'))
        .sort();

      for (const dayFile of dayFiles) {
        allFiles.push({
          path: path.join(monthPath, dayFile),
          name: dayFile.replace('.json', '')
        });
      }
    }

    console.log(`[EmbedAll] 발견: ${allFiles.length}개 파일\n`);

    if (allFiles.length === 0) {
      console.log('[EmbedAll] 임베딩할 파일 없음');
      return;
    }

    // 3. 벡터 스토어 로드
    const vectorStore = require('../utils/vector-store');

    // 4. 각 파일 처리
    let totalEmbedded = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      console.log(`[${i + 1}/${allFiles.length}] ${file.name} 처리 중...`);

      try {
        const result = await vectorStore.ingestDayConversation(file.path, {
          batchDelay: 500,
          maxChunkChars: 1500
        });

        totalEmbedded += result.embedded;
        totalSkipped += result.skipped;
        totalErrors += result.errors;

        console.log(`  ✓ embedded: ${result.embedded}, skipped: ${result.skipped}, errors: ${result.errors}`);
      } catch (err) {
        console.error(`  ✗ 실패: ${err.message}`);
        totalErrors++;
      }

      // API 레이트 리밋 방지 (파일 사이 1초 대기)
      if (i < allFiles.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log('\n[EmbedAll] 완료!');
    console.log(`  총 임베딩: ${totalEmbedded}개`);
    console.log(`  스킵: ${totalSkipped}개 (이미 임베딩됨)`);
    console.log(`  에러: ${totalErrors}개`);

  } catch (error) {
    console.error('[EmbedAll] 치명적 오류:', error);
    process.exit(1);
  }
}

// 실행
if (require.main === module) {
  embedAllConversations()
    .then(() => {
      console.log('\n✅ 모든 작업 완료');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ 실패:', err);
      process.exit(1);
    });
}

module.exports = { embedAllConversations };
