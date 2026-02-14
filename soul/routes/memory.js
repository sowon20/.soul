/**
 * memory.js
 * 메모리 계층 API
 * - 단기/중기/장기 메모리 조회
 * - 문서 스토리지 관리
 */

const express = require('express');
const router = express.Router();
const { getMemoryManager } = require('../utils/memory-layers');

/**
 * GET /api/memory/stats
 * 메모리 전체 통계
 */
router.get('/stats', async (req, res) => {
  try {
    const manager = await getMemoryManager();
    
    const shortTermStats = {
      count: manager.shortTerm.messages.length,
      totalTokens: manager.shortTerm.totalTokens
    };
    
    const middleTermStats = {
      summaryCount: (await manager.middleTerm.getRecentWeeklySummaries(100)).length
    };
    
    const longTermStats = await manager.longTerm.getStats();
    
    const documentStats = {
      count: manager.documents.index?.documents?.length || 0,
      categories: manager.documents.getCategories()
    };
    
    res.json({
      success: true,
      stats: {
        shortTerm: shortTermStats,
        middleTerm: middleTermStats,
        longTerm: longTermStats,
        documents: documentStats
      }
    });
  } catch (error) {
    console.error('Memory stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/short-term
 * 단기 메모리 (최근 메시지)
 */
router.get('/short-term', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const manager = await getMemoryManager();
    
    const messages = manager.shortTerm.getRecent(parseInt(limit));
    
    res.json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (error) {
    console.error('Short-term memory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/weekly-summaries
 * 중기 메모리 (주간 요약)
 */
router.get('/weekly-summaries', async (req, res) => {
  try {
    const { limit = 8 } = req.query;
    const manager = await getMemoryManager();
    
    const summaries = await manager.middleTerm.getRecentWeeklySummaries(parseInt(limit));
    
    res.json({
      success: true,
      count: summaries.length,
      summaries
    });
  } catch (error) {
    console.error('Weekly summaries error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/archives
 * 장기 메모리 (아카이브) 검색
 */
router.get('/archives', async (req, res) => {
  try {
    const { query, category, tags, limit = 20 } = req.query;
    const manager = await getMemoryManager();
    
    const results = await manager.longTerm.search(query, {
      category,
      tags: tags ? tags.split(',') : undefined,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      count: results.length,
      archives: results
    });
  } catch (error) {
    console.error('Archives search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/archives/:id
 * 아카이브 상세 조회 (원본 대화)
 */
router.get('/archives/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const manager = await getMemoryManager();
    
    const archive = await manager.longTerm.getById(id);
    
    if (!archive) {
      return res.status(404).json({ success: false, error: 'Archive not found' });
    }
    
    res.json({ success: true, archive });
  } catch (error) {
    console.error('Archive detail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/memory/archives
 * 대화 아카이브
 */
router.post('/archives', async (req, res) => {
  try {
    const { conversationId, messages, metadata } = req.body;
    const manager = await getMemoryManager();
    
    const result = await manager.longTerm.archive(conversationId, messages, metadata);
    
    res.json({ success: true, archive: result });
  } catch (error) {
    console.error('Archive error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/documents
 * 문서 목록/검색
 */
router.get('/documents', async (req, res) => {
  try {
    const { query, category, tags, limit = 20 } = req.query;
    const manager = await getMemoryManager();
    
    const results = await manager.documents.search(query, {
      category,
      tags: tags ? tags.split(',') : undefined,
      limit: parseInt(limit)
    });
    
    res.json({
      success: true,
      count: results.length,
      documents: results,
      categories: manager.documents.getCategories()
    });
  } catch (error) {
    console.error('Documents search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/memory/documents
 * 문서 업로드
 */
router.post('/documents', async (req, res) => {
  try {
    const { filename, content, metadata } = req.body;
    const manager = await getMemoryManager();
    
    // base64 디코딩 (필요시)
    const fileContent = metadata?.isBase64 
      ? Buffer.from(content, 'base64')
      : content;
    
    const result = await manager.documents.save(filename, fileContent, metadata);
    
    res.json({ success: true, document: result });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/documents/:id
 * 문서 상세 조회
 */
router.get('/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const manager = await getMemoryManager();
    
    const doc = await manager.documents.read(id);
    
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }
    
    res.json({ success: true, document: doc });
  } catch (error) {
    console.error('Document detail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// Soul Memories CRUD (사용자가 직접 관리하는 소울의 기억)
// ============================================================

/**
 * GET /api/memory/soul
 * 소울 기억 목록 (검색, 카테고리 필터)
 */
router.get('/soul', async (req, res) => {
  try {
    const db = require('../db');
    const { query, category, include_hidden = 'false', limit = 50 } = req.query;

    let sql = 'SELECT * FROM soul_memories';
    const params = [];

    sql += include_hidden === 'true' ? ' WHERE 1=1' : ' WHERE is_active = 1';

    if (query) {
      sql += ' AND (content LIKE ? OR tags LIKE ?)';
      params.push(`%${query}%`, `%${query}%`);
    }
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const rows = db.db.prepare(sql).all(...params);

    const memories = rows.map(r => ({
      id: r.id,
      category: r.category,
      content: r.content,
      tags: r.tags ? JSON.parse(r.tags) : [],
      is_active: r.is_active === 1,
      source_date: r.source_date,
      created_at: r.created_at,
      updated_at: r.updated_at
    }));

    res.json({ success: true, count: memories.length, memories });
  } catch (error) {
    console.error('Soul memories list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/memory/soul/:id
 * 소울 기억 상세 (변경 이력 포함)
 */
router.get('/soul/:id', async (req, res) => {
  try {
    const db = require('../db');
    const { id } = req.params;

    const memory = db.db.prepare('SELECT * FROM soul_memories WHERE id = ?').get(id);
    if (!memory) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }

    // 변경 이력 조회
    let history = [];
    try {
      history = db.db.prepare(
        'SELECT * FROM soul_memory_history WHERE memory_id = ? ORDER BY changed_at DESC'
      ).all(id);
    } catch (e) { /* 테이블 없을 수 있음 */ }

    res.json({
      success: true,
      memory: {
        ...memory,
        tags: memory.tags ? JSON.parse(memory.tags) : [],
        is_active: memory.is_active === 1
      },
      history
    });
  } catch (error) {
    console.error('Soul memory detail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/memory/soul
 * 소울 기억 추가 (사용자가 직접)
 */
router.post('/soul', async (req, res) => {
  try {
    const db = require('../db');
    const { content, category = 'general', tags = [] } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const now = new Date().toISOString();
    const tagsJson = JSON.stringify(tags);

    const result = db.db.prepare(
      'INSERT INTO soul_memories (category, content, tags, source_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(category, content, tagsJson, now.substring(0, 10), now, now);

    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: '기억이 추가되었습니다.'
    });
  } catch (error) {
    console.error('Soul memory create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/memory/soul/:id
 * 소울 기억 수정 (사용자가 직접)
 */
router.put('/soul/:id', async (req, res) => {
  try {
    const db = require('../db');
    const { id } = req.params;
    const { content, category, tags, reason } = req.body;

    const existing = db.db.prepare('SELECT * FROM soul_memories WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }

    // 이전 내용 이력 백업
    const now = new Date().toISOString();
    try {
      db.db.prepare(
        'INSERT INTO soul_memory_history (memory_id, previous_content, reason, changed_at) VALUES (?, ?, ?, ?)'
      ).run(id, existing.content, reason || '사용자 직접 수정', now);
    } catch (e) { /* 이력 테이블 없어도 수정은 진행 */ }

    const updates = [];
    const values = [];

    if (content !== undefined) { updates.push('content = ?'); values.push(content); }
    if (category !== undefined) { updates.push('category = ?'); values.push(category); }
    if (tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(tags)); }
    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    if (updates.length > 1) {
      db.db.prepare(`UPDATE soul_memories SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    res.json({ success: true, message: '기억이 수정되었습니다.' });
  } catch (error) {
    console.error('Soul memory update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/memory/soul/:id
 * 소울 기억 삭제 (soft delete)
 */
router.delete('/soul/:id', async (req, res) => {
  try {
    const db = require('../db');
    const { id } = req.params;
    const { hard = false } = req.query;

    const existing = db.db.prepare('SELECT * FROM soul_memories WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }

    if (hard === 'true') {
      // 하드 삭제 (이력도 삭제)
      try {
        db.db.prepare('DELETE FROM soul_memory_history WHERE memory_id = ?').run(id);
      } catch (e) { /* 이력 테이블 없을 수 있음 */ }
      db.db.prepare('DELETE FROM soul_memories WHERE id = ?').run(id);
      res.json({ success: true, message: '기억이 완전히 삭제되었습니다.' });
    } else {
      // 소프트 삭제
      db.db.prepare(
        'UPDATE soul_memories SET is_active = 0, updated_at = ? WHERE id = ?'
      ).run(new Date().toISOString(), id);
      res.json({ success: true, message: '기억이 비활성화되었습니다.' });
    }
  } catch (error) {
    console.error('Soul memory delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
