/**
 * reembed.js - 다이제스트 파일의 summary/memories를 벡터 임베딩으로 저장
 *
 * 사용법: node scripts/reembed.js [다이제스트파일경로]
 * 예: node scripts/reembed.js /Users/sowon/.soul/digests/2026-02-04.json
 */

const fs = require('fs');
const path = require('path');

process.chdir(path.join(__dirname, '..'));

async function reembed(filePath) {
  console.log(`\n=== 임베딩 시작: ${filePath} ===\n`);

  const raw = fs.readFileSync(filePath, 'utf-8');
  let digests = JSON.parse(raw);

  // 배열이 아니면 배열로 감싸기
  if (!Array.isArray(digests)) digests = [digests];
  console.log(`다이제스트 ${digests.length}개`);

  const vectorStore = require('../soul/utils/vector-store');
  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < digests.length; i++) {
    const d = digests[i];
    const extraTags = [
      ...(d.keywords || []).slice(0, 50),
      ...(d.entities || []).slice(0, 50)
    ];

    // 1. 요약 임베딩
    if (d.summary && d.summary.length >= 10) {
      const enriched = extraTags.length > 0
        ? `${d.summary}\n[키워드: ${extraTags.slice(0, 30).join(', ')}]`
        : d.summary;

      try {
        await vectorStore.addMessage({
          id: `digest_summary_${i}_${Date.now()}`,
          content: enriched,
          role: 'system',
          sessionId: 'embeddings',
          timestamp: d.timestamp || new Date().toISOString(),
          tags: ['digest', 'summary', ...extraTags.slice(0, 20)]
        });
        embedded++;
        process.stdout.write(`\r임베딩 진행: ${embedded} (다이제스트 ${i + 1}/${digests.length})`);
      } catch (e) {
        failed++;
        console.warn(`\n[!] 요약 임베딩 실패: ${e.message}`);
      }

      // rate limit 방지
      await new Promise(r => setTimeout(r, 200));
    }

    // 2. 메모리 각각 임베딩
    for (const mem of (d.memories || [])) {
      const memText = typeof mem === 'string' ? mem : (mem.text || '');
      if (!memText || memText.length < 10) continue;

      try {
        await vectorStore.addMessage({
          id: `digest_mem_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          content: memText,
          role: 'system',
          sessionId: 'embeddings',
          timestamp: d.timestamp || new Date().toISOString(),
          tags: ['digest', 'memory', ...extraTags.slice(0, 20)]
        });
        embedded++;
        process.stdout.write(`\r임베딩 진행: ${embedded} (다이제스트 ${i + 1}/${digests.length})`);
      } catch (e) {
        failed++;
        console.warn(`\n[!] 메모리 임베딩 실패: ${e.message}`);
      }

      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\n\n=== 완료 ===`);
  console.log(`성공: ${embedded}개, 실패: ${failed}개`);
  process.exit(0);
}

const filePath = process.argv[2] || '/Users/sowon/.soul/digests/2026-02-04.json';
if (!fs.existsSync(filePath)) {
  console.error(`파일 없음: ${filePath}`);
  process.exit(1);
}

reembed(filePath).catch(err => {
  console.error('에러:', err);
  process.exit(1);
});
