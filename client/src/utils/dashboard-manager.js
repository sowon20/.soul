/**
 * 대시보드 관리자
 * AI 라우팅 통계를 가져와서 표시
 */

class DashboardManager {
  constructor() {
    this.initialized = false;
    this.currentPeriod = 'today';
    this.customStartDate = null;
    this.customEndDate = null;
  }

  async init() {
    if (this.initialized) return;

    try {
      this.setupPeriodTabs();
      this.setupDateRange();
      await this.loadRoutingStats();
      this.initialized = true;
      console.log('Dashboard initialized');
    } catch (error) {
      console.error('Dashboard initialization failed:', error);
    }
  }

  setupPeriodTabs() {
    const tabs = document.querySelectorAll('.stats-period-tab');
    const dateRangeEl = document.getElementById('statsDateRange');

    tabs.forEach(tab => {
      tab.addEventListener('click', async (e) => {
        // 활성 탭 변경
        tabs.forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');

        const period = e.target.dataset.period;
        this.currentPeriod = period;

        // 커스텀 기간 UI 토글
        if (dateRangeEl) {
          dateRangeEl.style.display = period === 'custom' ? 'flex' : 'none';
        }

        // 커스텀이 아니면 바로 로드
        if (period !== 'custom') {
          await this.loadRoutingStats();
        }
      });
    });
  }

  setupDateRange() {
    const startInput = document.getElementById('statsStartDate');
    const endInput = document.getElementById('statsEndDate');
    const applyBtn = document.getElementById('statsDateApply');

    if (!startInput || !endInput || !applyBtn) return;

    // 기본값: 오늘 ~ 오늘
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    startInput.value = weekAgo;
    endInput.value = today;

    applyBtn.addEventListener('click', async () => {
      this.customStartDate = startInput.value;
      this.customEndDate = endInput.value;
      await this.loadRoutingStats();
    });
  }

  async loadRoutingStats() {
    try {
      let url = `/api/chat/routing-stats?period=${this.currentPeriod}`;

      // 커스텀 기간인 경우 날짜 추가
      if (this.currentPeriod === 'custom' && this.customStartDate && this.customEndDate) {
        url += `&startDate=${this.customStartDate}&endDate=${this.customEndDate}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (data.success && data.stats) {
        const stats = data.stats;

        // 총 요청
        this.updateStat('stat-requests', this.formatNumber(stats.totalRequests || 0));

        // 분포
        this.updateStat('stat-light', stats.distribution?.light || '0%');
        this.updateStat('stat-medium', stats.distribution?.medium || '0%');
        this.updateStat('stat-heavy', stats.distribution?.heavy || '0%');

        // 비용
        const cost = stats.totalCost || 0;
        this.updateStat('stat-cost', '$' + cost.toFixed(4));

        // 평균 응답 시간
        const latency = stats.averageLatency;
        this.updateStat('stat-latency', latency ? latency.toFixed(0) + 'ms' : '-');

        // 모델별 사용량
        this.renderModelUsage(stats.modelUsage || []);
      }
    } catch (error) {
      console.error('Failed to load routing stats:', error);
      this.setDefaultStats();
    }
  }

  renderModelUsage(modelUsage) {
    const container = document.getElementById('model-usage-list');
    if (!container) return;

    if (modelUsage.length === 0) {
      container.innerHTML = '<div class="no-data">아직 사용 기록이 없습니다</div>';
      return;
    }

    // 상위 5개만 표시
    const topModels = modelUsage.slice(0, 5);

    container.innerHTML = topModels.map(model => {
      const displayName = this.getModelDisplayName(model.modelId);
      const percentage = parseFloat(model.percentage) || 0;

      return `
        <div class="model-usage-item">
          <div class="model-usage-header">
            <span class="model-name">${displayName}</span>
            <span class="model-percentage">${model.percentage}</span>
          </div>
          <div class="model-usage-bar">
            <div class="model-usage-fill" style="width: ${percentage}%"></div>
          </div>
          <div class="model-usage-details">
            <span>${model.count}회</span>
            <span>${model.avgLatency ? model.avgLatency.toFixed(0) + 'ms' : '-'}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  getModelDisplayName(modelId) {
    if (!modelId) return 'Unknown';

    // 모델 이름 간소화
    const id = modelId.toLowerCase();

    if (id.includes('claude')) {
      if (id.includes('opus')) return 'Claude Opus';
      if (id.includes('sonnet')) return 'Claude Sonnet';
      if (id.includes('haiku')) return 'Claude Haiku';
      return 'Claude';
    }

    if (id.includes('gpt')) {
      if (id.includes('4o')) return 'GPT-4o';
      if (id.includes('4')) return 'GPT-4';
      if (id.includes('3.5')) return 'GPT-3.5';
      return 'GPT';
    }

    if (id.includes('gemini')) {
      if (id.includes('ultra')) return 'Gemini Ultra';
      if (id.includes('pro')) return 'Gemini Pro';
      if (id.includes('flash')) return 'Gemini Flash';
      return 'Gemini';
    }

    if (id.includes('grok')) {
      if (id.includes('mini')) return 'Grok Mini';
      return 'Grok';
    }

    // 기본: 첫 20자
    return modelId.length > 20 ? modelId.substring(0, 20) + '...' : modelId;
  }

  setDefaultStats() {
    this.updateStat('stat-requests', '0');
    this.updateStat('stat-light', '0%');
    this.updateStat('stat-medium', '0%');
    this.updateStat('stat-heavy', '0%');
    this.updateStat('stat-cost', '$0.00');
    this.updateStat('stat-latency', '-');

    const container = document.getElementById('model-usage-list');
    if (container) {
      container.innerHTML = '<div class="no-data">아직 사용 기록이 없습니다</div>';
    }
  }

  updateStat(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value;
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

  // 통계 새로고침
  async refresh() {
    await this.loadRoutingStats();
  }

  // 기간 변경
  async setPeriod(period) {
    this.currentPeriod = period;
    await this.loadRoutingStats();
  }
}

// 전역 인스턴스 생성
const dashboardManager = new DashboardManager();

export default dashboardManager;
