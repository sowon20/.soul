/**
 * redigest.js - 기존 대화 파일을 새 다이제스트 프롬프트로 재처리
 *
 * 사용법: node scripts/redigest.js [대화파일경로]
 * 예: node scripts/redigest.js /Users/sowon/.soul/conversations/2025-11/2025-11-26.json
 */

const fs = require('fs');
const path = require('path');

// 프로젝트 루트 기준으로 require 경로 설정
process.chdir(path.join(__dirname, '..'));

async function redigest(filePath) {
  console.log(`\n=== 재다이제스트 시작: ${filePath} ===\n`);

  // 1. 대화 파일 읽기 (JSON 또는 JSONL 지원)
  const raw = fs.readFileSync(filePath, 'utf-8');
  let messages;

  if (filePath.endsWith('.jsonl')) {
    // JSONL: 한 줄씩 파싱, text→content 변환
    messages = raw.trim().split('\n').map(line => {
      const obj = JSON.parse(line);
      return {
        role: obj.role,
        content: obj.text || obj.content || '',
        timestamp: obj.timestamp
      };
    });
  } else {
    // JSON 배열
    const parsed = JSON.parse(raw);
    messages = parsed.map(m => ({
      role: m.role,
      content: m.text || m.content || '',
      timestamp: m.timestamp
    }));
  }
  console.log(`총 메시지: ${messages.length}개`);

  // 2. SessionDigest 인스턴스 생성
  const { SessionDigest } = require('../soul/utils/session-digest');
  const digest = new SessionDigest();

  // 3. lastDigestIndex를 0으로 (처음부터 다시)
  digest.lastDigestIndex = 0;
  digest.previousSummary = '';

  // 4. 대화 파일 이름에서 세션ID 추출
  const fileName = path.basename(filePath, '.json');
  const sessionId = `redigest-${fileName}`;

  console.log(`세션ID: ${sessionId}`);
  console.log(`처리 시작...\n`);

  // 5. 실행
  const startTime = Date.now();
  const result = await digest.runDigest(messages, sessionId);

  if (result) {
    console.log(`\n=== 완료 ===`);
    console.log(`요약 길이: ${result.summary?.length || 0}자`);
    console.log(`메모리: ${result.memories?.length || 0}개`);
    console.log(`키워드: ${result.keywords?.length || 0}개 → ${(result.keywords || []).join(', ')}`);
    console.log(`엔티티: ${result.entities?.length || 0}개 → ${(result.entities || []).join(', ')}`);
    console.log(`액션: ${result.actions?.length || 0}개`);
    console.log(`청크: ${result.chunks}개`);
    console.log(`소요시간: ${((Date.now() - startTime) / 1000).toFixed(1)}초`);
  } else {
    console.log('\n❌ 다이제스트 실패');
  }

  process.exit(0);
}

// 실행
const filePath = process.argv[2];
if (!filePath) {
  console.error('사용법: node scripts/redigest.js <대화파일경로>');
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`파일 없음: ${filePath}`);
  process.exit(1);
}

redigest(filePath).catch(err => {
  console.error('에러:', err);
  process.exit(1);
});
