#!/usr/bin/env node
/**
 * import-digest.js
 * 아카이브된 과거 대화를 세션 다이제스트로 처리하는 임포트 스크립트
 *
 * 용도: burned_room 등 JSONL로 임포트한 과거 대화를
 *       다이제스트 파이프라인에 통과시켜 요약 + 메모리 추출
 *
 * 사용: node scripts/import-digest.js [날짜]
 * 예시: node scripts/import-digest.js 2025-11-26
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// 프로젝트 루트 설정
const PROJECT_ROOT = path.join(__dirname, '..');
process.env.SOUL_DATA_DIR = process.env.SOUL_DATA_DIR || path.join(os.homedir(), '.soul');

// DB 초기화 필요
const { init: initDatabase } = require(path.join(PROJECT_ROOT, 'soul/db/sqlite'));
const { SessionDigest } = require(path.join(PROJECT_ROOT, 'soul/utils/session-digest'));

async function main() {
  const targetDate = process.argv[2] || '2025-11-26';
  const basePath = process.env.SOUL_DATA_DIR;

  // 대화 파일 찾기
  const [year, month] = targetDate.split('-');
  const convPath = path.join(basePath, 'conversations', `${year}-${month}`, `${targetDate}.json`);

  if (!fs.existsSync(convPath)) {
    console.error(`❌ 대화 파일 없음: ${convPath}`);
    process.exit(1);
  }

  console.log(`📂 대화 로드: ${convPath}`);
  const messages = JSON.parse(fs.readFileSync(convPath, 'utf8'));
  console.log(`   메시지 수: ${messages.length}`);
  console.log(`   첫 메시지: ${messages[0]?.content?.substring(0, 60)}...`);
  console.log(`   마지막: ${messages[messages.length - 1]?.content?.substring(0, 60)}...`);

  // DB 초기화
  console.log('\n🔧 DB 초기화...');
  await initDatabase();

  // 다이제스트 인스턴스 생성 (싱글톤이 아닌 새 인스턴스)
  const digest = new SessionDigest();

  // 배치 처리: 20개씩 묶어서 다이제스트 실행
  const BATCH_SIZE = 20;
  const results = [];
  let totalMemories = 0;
  let totalActions = 0;

  console.log(`\n🚀 다이제스트 시작 (${Math.ceil(messages.length / BATCH_SIZE)} 배치, 각 ${BATCH_SIZE}개)\n`);

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batchEnd = Math.min(i + BATCH_SIZE, messages.length);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(messages.length / BATCH_SIZE);

    // 누적 메시지 (처음부터 현재까지) — shouldDigest가 lastDigestIndex 기반이므로
    const accMessages = messages.slice(0, batchEnd);

    // 트리거 확인
    if (!digest.shouldDigest(accMessages)) {
      console.log(`  [${batchNum}/${totalBatches}] Skip (트리거 미달)`);
      continue;
    }

    console.log(`  [${batchNum}/${totalBatches}] 처리 중... (msg ${i}-${batchEnd - 1})`);

    const result = await digest.runDigest(accMessages, `import-${targetDate}`);

    if (result) {
      results.push(result);
      totalMemories += (result.memories || []).length;
      totalActions += (result.actions || []).length;

      console.log(`    ✅ 요약: ${result.summary.substring(0, 80)}...`);
      console.log(`    📝 메모리: ${(result.memories || []).length}개, 액션: ${(result.actions || []).length}개`);
      console.log(`    ⏱  ${result.processingTime}ms\n`);
    }
  }

  // 결과 요약
  console.log('═'.repeat(60));
  console.log(`✅ 임포트 다이제스트 완료`);
  console.log(`   대화: ${messages.length}개 메시지`);
  console.log(`   다이제스트: ${results.length}개 생성`);
  console.log(`   메모리: ${totalMemories}개 추출`);
  console.log(`   액션: ${totalActions}개`);
  console.log(`   최종 요약: ${digest.previousSummary?.substring(0, 200)}...`);
  console.log('═'.repeat(60));

  // 다이제스트 파일 확인
  const digestDir = path.join(basePath, 'digests');
  if (fs.existsSync(digestDir)) {
    const files = fs.readdirSync(digestDir).sort();
    console.log(`\n📁 다이제스트 파일: ${digestDir}`);
    for (const f of files) {
      const stat = fs.statSync(path.join(digestDir, f));
      console.log(`   ${f} (${(stat.size / 1024).toFixed(1)} KB)`);
    }
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
