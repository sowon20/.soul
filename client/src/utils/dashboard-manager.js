/**
 * 대시보드 관리자
 * 통계 및 활동 데이터를 가져와서 표시
 */

class DashboardManager {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      await this.loadStats();
      this.setupEventListeners();
      this.initialized = true;
      console.log('✅ Dashboard initialized');
    } catch (error) {
      console.error('❌ Dashboard initialization failed:', error);
    }
  }

  async loadStats() {
    try {
      // 토큰 상태 가져오기
      const tokenStatus = await fetch('/api/chat/token-status').then(r => r.json()).catch(() => null);

      // 메모리 통계 가져오기
      const memoryStats = await fetch('/api/chat/memory-stats').then(r => r.json()).catch(() => null);

      // 라우팅 통계 가져오기
      const routingStats = await fetch('/api/chat/routing-stats').then(r => r.json()).catch(() => null);

      // 통계 업데이트
      this.updateStat('stat-conversations', memoryStats?.sessionCount || 0, '개');
      this.updateStat('stat-messages', memoryStats?.messageCount || 0, '개');
      this.updateStat('stat-tokens', this.formatNumber(tokenStatus?.currentTokens || 0), '');

    } catch (error) {
      console.error('Failed to load stats:', error);
      // 실패 시 기본값 유지
      this.updateStat('stat-conversations', 0, '개');
      this.updateStat('stat-messages', 0, '개');
      this.updateStat('stat-tokens', 0, '');
    }
  }

  setupEventListeners() {
    // 자동 새로고침 (30초마다)
    setInterval(() => {
      this.loadStats();
    }, 30000);
  }

  updateStat(elementId, value, suffix = '') {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = `${value}${suffix}`;
    }
  }

  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }
}

// 전역 인스턴스 생성
const dashboardManager = new DashboardManager();

// 페이지 로드 시 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    dashboardManager.init();
  });
} else {
  dashboardManager.init();
}

export default dashboardManager;
