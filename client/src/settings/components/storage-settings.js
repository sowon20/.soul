/**
 * Storage Settings Component
 * 저장소 설정 - 온보딩 스텝 UI
 */

export class StorageSettings {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.container = null;
    this.storageConfig = {
      memory: { type: 'local', local: {}, oracle: {}, notion: {}, ftp: {} },
      file: { type: 'local', local: {}, oracle: {}, nas: {} }
    };
    this.originalConfig = null;
    this.availableTypes = { memory: [], file: [] };
    this.usageInfo = { memory: {}, file: {} };

    // UI 상태
    this.activeCategory = null;   // 'memory' | 'file' | null
    this.view = 'main';           // 'main' | 'select' | 'onboarding'
    this.selectedNewType = null;
    this.currentStep = 0;
    this.stepStates = [];
    this.stepData = {};
    this.migrating = false;

    // 폴더 브라우저
    this.currentBrowseTarget = null;
    this.currentPath = '/';
  }

  async init(container) {
    this.container = container;
    await this.loadConfig();
    await Promise.all([this.loadAvailableTypes(), this.loadUsage()]);
    this.render();
  }

  async loadConfig() {
    try {
      const response = await this.apiClient.get('/config/storage');
      if (response) {
        this.storageConfig = response;
        this.originalConfig = JSON.parse(JSON.stringify(response));
      }
    } catch (error) {
      console.error('Failed to load storage config:', error);
    }
  }

  async loadAvailableTypes() {
    try {
      const response = await this.apiClient.get('/config/storage/available-types');
      if (response) this.availableTypes = response;
    } catch (error) {
      console.error('Failed to load available types:', error);
    }
  }

  async loadUsage() {
    try {
      const response = await this.apiClient.get('/storage/usage');
      if (response?.success) {
        this.usageInfo = { memory: response.memory || {}, file: response.file || {} };
      }
    } catch (error) {
      console.error('Failed to load usage:', error);
    }
  }

  // ========== 렌더링 ==========

  render() {
    this.container.innerHTML = `<div class="storage-settings">${this.renderContent()}</div>`;
    this.bindEvents();
  }

  renderContent() {
    if (this.view === 'main') return this.renderMainView();
    if (this.view === 'select') return this.renderMainView(); // 메인 + 선택 레이어
    if (this.view === 'onboarding') return this.renderOnboardingView();
    return '';
  }

  renderMainView() {
    const memInfo = this.usageInfo.memory || {};
    const fileInfo = this.usageInfo.file || {};
    const memType = this.storageConfig.memory?.type || 'local';
    const fileType = this.storageConfig.file?.type || 'local';

    return `
      ${this.renderSection('memory', '메모리 저장소', '대화내용과 기억이 저장되는 위치', memType, memInfo)}
      ${this.renderSection('file', '파일 저장소', '첨부파일과 이미지가 저장되는 위치', fileType, fileInfo)}
    `;
  }

  renderSection(category, title, desc, type, info) {
    const typeName = this.getTypeName(category, type);
    const sizeStr = info.size != null ? this.formatSize(info.size) : '-';
    const pathOrInfo = info.path || info.info || '-';
    const isSelectOpen = this.view === 'select' && this.activeCategory === category;

    return `
      <div class="storage-section" data-category="${category}">
        <h3 class="storage-section-title">${title}</h3>
        <p class="storage-section-desc">${desc}</p>
        <div class="storage-current-info">
          <div class="info-row">
            <span class="info-label">타입</span>
            <span class="info-value">${typeName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${type === 'local' ? '경로' : '연결 정보'}</span>
            <span class="info-value" style="font-size:0.8rem; word-break:break-all;">${pathOrInfo}</span>
          </div>
          <div class="info-row">
            <span class="info-label">용량</span>
            <span class="info-value">${sizeStr}</span>
          </div>
        </div>
        <button class="storage-change-btn" data-action="change" data-category="${category}">저장소 변경</button>
        ${this.renderSelectLayer(category, type, isSelectOpen)}
      </div>
    `;
  }

  renderSelectLayer(category, currentType, isOpen) {
    const types = this.getAvailableTypes(category);
    return `
      <div class="storage-select-layer ${isOpen ? 'open' : ''}" data-select-category="${category}">
        <div class="select-header">
          <button class="storage-back-btn" data-action="back-select" data-category="${category}">←</button>
          <h4>저장소 선택</h4>
        </div>
        <div class="type-cards">
          ${types.map(t => {
            const isCurrent = t.type === currentType;
            const disabled = t.disabled ? 'disabled' : '';
            const cls = isCurrent ? 'current' : (t.disabled ? 'disabled' : '');
            return `
              <button class="type-card ${cls}" data-action="select-type" data-category="${category}" data-type="${t.type}" ${disabled}>
                <span class="type-card-icon">${t.icon}</span>
                <span class="type-card-name">${t.name}</span>
                <span class="type-card-desc">${t.desc}</span>
                ${isCurrent ? '<span class="type-card-badge">사용 중</span>' : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  getAvailableTypes(category) {
    if (category === 'memory') {
      return [
        { type: 'local', icon: '💻', name: '로컬', desc: '디바이스에 직접 저장' },
        { type: 'oracle', icon: '🔶', name: 'Oracle', desc: 'Autonomous DB' },
        { type: 'notion', icon: '📝', name: 'Notion', desc: 'Notion 데이터베이스' },
        { type: 'ftp', icon: '🗄️', name: 'FTP', desc: '준비 중', disabled: true }
      ];
    }
    return [
      { type: 'local', icon: '💻', name: '로컬', desc: '디바이스에 직접 저장' },
      { type: 'oracle', icon: '🔶', name: 'Oracle', desc: 'Object Storage' },
      { type: 'nas', icon: '🗄️', name: 'NAS', desc: '준비 중', disabled: true }
    ];
  }

  // ========== 온보딩 ==========

  renderOnboardingView() {
    const steps = this.getSteps();
    const typeName = this.getTypeName(this.activeCategory, this.selectedNewType);
    const categoryName = this.activeCategory === 'memory' ? '메모리 저장소' : '파일 저장소';

    return `
      <div class="storage-onboarding">
        <div class="onboarding-header">
          <button class="storage-back-btn" data-action="back-onboarding">←</button>
          <h4>${categoryName} → ${typeName}</h4>
        </div>
        <div class="onboarding-steps">
          ${steps.map((step, i) => this.renderStep(step, i, steps.length)).join('')}
        </div>
      </div>
      ${this.renderFolderBrowserModal()}
    `;
  }

  getSteps() {
    const type = this.selectedNewType;
    if (type === 'oracle') {
      return [
        { id: 'wallet', title: '월렛 업로드', desc: 'Oracle Wallet.zip 파일을 업로드하세요' },
        { id: 'credentials', title: '연결 정보', desc: '사용자와 비밀번호를 입력하세요' },
        { id: 'connect', title: '연결 & 이전', desc: '연결을 확인하고 데이터를 이전합니다' }
      ];
    }
    if (type === 'notion') {
      return [
        { id: 'token', title: '토큰 입력', desc: 'Notion Integration Token을 입력하세요' },
        { id: 'database', title: '데이터베이스 ID', desc: '대화를 저장할 데이터베이스 ID를 입력하세요' },
        { id: 'connect', title: '연결 & 이전', desc: '연결을 확인하고 데이터를 이전합니다' }
      ];
    }
    // local
    return [
      { id: 'path', title: '폴더 선택', desc: '데이터를 저장할 폴더를 선택하세요' },
      { id: 'connect', title: '확인 & 이전', desc: '경로를 확인하고 데이터를 이전합니다' }
    ];
  }

  renderStep(step, index, total) {
    const state = this.stepStates[index] || 'pending';
    const isLast = index === total - 1;

    return `
      <div class="ob-step ${state}" data-step="${index}">
        <div class="step-indicator">
          <div class="step-icon ${state}">
            ${this.renderStepIcon(state, index)}
          </div>
          ${!isLast ? `<div class="step-line ${state}"></div>` : ''}
        </div>
        <div class="step-body">
          <div class="step-title">${step.title}</div>
          <div class="step-desc">${step.desc}</div>
          ${state === 'active' ? this.renderStepForm(step, index) : ''}
          ${state === 'error' ? `<div class="step-error-msg">${this.stepData._error || '오류 발생'}</div>` : ''}
          ${state === 'completed' && step.id === 'connect' ? `<div class="step-success-msg">${this.stepData._successMsg || '완료!'}</div>` : ''}
        </div>
      </div>
    `;
  }

  renderStepIcon(state, index) {
    if (state === 'completed') return '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    if (state === 'active') return `<div class="step-spinner" style="display:none"></div><span>${index + 1}</span>`;
    if (state === 'error') return '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    return `<span>${index + 1}</span>`;
  }

  renderStepForm(step, index) {
    const type = this.selectedNewType;

    if (step.id === 'wallet') {
      return `
        <div class="step-form">
          <div class="wallet-upload">
            <label class="upload-btn">
              📦 Wallet.zip 선택
              <input type="file" accept=".zip" id="walletFile" style="display:none">
            </label>
            <span class="wallet-status" id="walletStatus">${this.stepData.walletUploaded ? '✅ 업로드됨' : ''}</span>
          </div>
        </div>
      `;
    }

    if (step.id === 'credentials') {
      const tnsNames = this.stepData.tnsNames || [];
      const saved = this.storageConfig[this.activeCategory]?.oracle || {};
      return `
        <div class="step-form">
          <div class="config-field">
            <label>연결 문자열</label>
            <select class="config-input" id="obConnectionString">
              ${tnsNames.map(n => `<option value="${n}" ${n === saved.connectionString ? 'selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="config-field">
            <label>사용자</label>
            <input class="config-input" id="obUser" value="${saved.user || 'ADMIN'}" placeholder="ADMIN">
          </div>
          <div class="config-field">
            <label>비밀번호</label>
            <input class="config-input" type="password" id="obPassword" placeholder="비밀번호">
          </div>
          <button class="step-next-btn" data-action="next-step">다음</button>
        </div>
      `;
    }

    if (step.id === 'token') {
      const saved = this.storageConfig[this.activeCategory]?.notion || {};
      return `
        <div class="step-form">
          <div class="config-field">
            <label>Integration Token</label>
            <input class="config-input" type="password" id="obNotionToken" placeholder="secret_..." value="${saved.token && saved.token !== '********' ? saved.token : ''}">
          </div>
          <div style="font-size:0.75rem; color:rgba(0,0,0,0.4); margin-top:-0.25rem;">
            <a href="https://www.notion.so/my-integrations" target="_blank" style="color:rgba(139,92,67,0.8);">Notion Integration 생성하기 →</a>
          </div>
          <button class="step-next-btn" data-action="next-step">다음</button>
        </div>
      `;
    }

    if (step.id === 'database') {
      const saved = this.storageConfig[this.activeCategory]?.notion || {};
      return `
        <div class="step-form">
          <div class="config-field">
            <label>데이터베이스 ID</label>
            <input class="config-input" id="obNotionDbId" placeholder="xxxxxxxx-xxxx-..." value="${saved.databaseId || ''}">
          </div>
          <button class="step-next-btn" data-action="next-step">다음</button>
        </div>
      `;
    }

    if (step.id === 'path') {
      const saved = this.storageConfig[this.activeCategory]?.local || {};
      const defaultPath = this.activeCategory === 'memory' ? '~/.soul/data' : '~/.soul/files';
      return `
        <div class="step-form">
          <div class="config-field">
            <label>저장 경로</label>
            <div class="path-input-group">
              <input class="config-input" id="obLocalPath" value="${saved.path || defaultPath}">
              <button class="browse-btn" data-target="obLocalPath">찾기</button>
            </div>
          </div>
          <button class="step-next-btn" data-action="next-step">다음</button>
        </div>
      `;
    }

    if (step.id === 'connect') {
      return `
        <div class="step-form">
          <div class="migration-warning">
            <strong>저장소를 옮깁니다.</strong><br>
            메모리 용량에 따라 다소 시간이 걸릴 수 있습니다.<br>
            이 창을 닫지 마세요. 기존 데이터는 보존됩니다.
          </div>
          <button class="step-action-btn" data-action="connect-migrate" ${this.migrating ? 'disabled' : ''}>
            ${this.migrating ? '<div class="step-spinner"></div> 이전 중...' : '🔗 연결 테스트 & 데이터 이전'}
          </button>
          <div class="migration-inline-progress" id="migrationProgress" style="display:none">
            <div class="progress-bar-track"><div class="progress-bar-fill" id="progressFill"></div></div>
            <div class="progress-text" id="progressText"></div>
          </div>
        </div>
      `;
    }

    return '';
  }

  // ========== 이벤트 ==========

  bindEvents() {
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const category = btn.dataset.category;

      if (action === 'change') this.handleOpenSelect(category);
      else if (action === 'back-select') this.handleCloseSelect(category);
      else if (action === 'select-type') this.handleTypeSelect(category, btn.dataset.type);
      else if (action === 'back-onboarding') this.handleBackFromOnboarding();
      else if (action === 'next-step') this.handleNextStep();
      else if (action === 'connect-migrate') this.handleConnectAndMigrate();
      else if (action === 'close-browser') this.closeFolderBrowser();
      else if (action === 'select-folder') this.selectFolder();
    });

    // 파일 업로드 (이벤트 위임)
    this.container.addEventListener('change', (e) => {
      if (e.target.id === 'walletFile') this.handleWalletUpload(e);
    });

    // 폴더 브라우저 (이벤트 위임)
    this.container.addEventListener('click', (e) => {
      const browseBtn = e.target.closest('.browse-btn');
      if (browseBtn) this.openFolderBrowser(browseBtn.dataset.target);
    });
  }

  handleOpenSelect(category) {
    this.activeCategory = category;
    this.view = 'select';
    // 슬라이드 애니메이션: 재렌더 후 open 클래스
    this.render();
    requestAnimationFrame(() => {
      const layer = this.container.querySelector(`[data-select-category="${category}"]`);
      if (layer) layer.classList.add('open');
    });
  }

  handleCloseSelect(category) {
    const layer = this.container.querySelector(`[data-select-category="${category}"]`);
    if (layer) layer.classList.remove('open');
    setTimeout(() => {
      this.view = 'main';
      this.activeCategory = null;
      this.render();
    }, 300);
  }

  handleTypeSelect(category, type) {
    const currentType = this.storageConfig[category]?.type || 'local';
    if (type === currentType) return;

    this.activeCategory = category;
    this.selectedNewType = type;
    this.view = 'onboarding';
    const steps = this.getSteps();
    this.stepStates = steps.map((_, i) => i === 0 ? 'active' : 'pending');
    this.currentStep = 0;
    this.stepData = {};
    this.migrating = false;
    this.render();
  }

  handleBackFromOnboarding() {
    if (this.migrating) return; // 마이그레이션 중 뒤로가기 금지
    this.view = 'select';
    this.selectedNewType = null;
    this.stepData = {};
    this.render();
    requestAnimationFrame(() => {
      const layer = this.container.querySelector(`[data-select-category="${this.activeCategory}"]`);
      if (layer) layer.classList.add('open');
    });
  }

  // ========== 스텝 진행 ==========

  handleNextStep() {
    const steps = this.getSteps();
    const step = steps[this.currentStep];

    // 유효성 검사 + 데이터 수집
    if (!this.validateAndCollect(step)) return;

    // 완료 처리
    this.stepStates[this.currentStep] = 'completed';
    this.currentStep++;
    if (this.currentStep < steps.length) {
      this.stepStates[this.currentStep] = 'active';
    }
    this.render();
  }

  validateAndCollect(step) {
    if (step.id === 'credentials') {
      const conn = this.container.querySelector('#obConnectionString')?.value;
      const user = this.container.querySelector('#obUser')?.value?.trim();
      const pw = this.container.querySelector('#obPassword')?.value;
      if (!user || !pw) { alert('사용자와 비밀번호를 입력하세요.'); return false; }
      this.stepData.connectionString = conn;
      this.stepData.user = user;
      this.stepData.password = pw;
      return true;
    }
    if (step.id === 'token') {
      const token = this.container.querySelector('#obNotionToken')?.value?.trim();
      if (!token) { alert('토큰을 입력하세요.'); return false; }
      this.stepData.token = token;
      return true;
    }
    if (step.id === 'database') {
      const dbId = this.container.querySelector('#obNotionDbId')?.value?.trim();
      if (!dbId) { alert('데이터베이스 ID를 입력하세요.'); return false; }
      this.stepData.databaseId = dbId;
      return true;
    }
    if (step.id === 'path') {
      const path = this.container.querySelector('#obLocalPath')?.value?.trim();
      if (!path) { alert('경로를 입력하세요.'); return false; }
      this.stepData.path = path;
      return true;
    }
    return true;
  }

  // ========== 연결 & 이전 ==========

  async handleConnectAndMigrate() {
    if (this.migrating) return;
    this.migrating = true;
    this.stepData._error = null;

    // 버튼 상태 업데이트
    const actionBtn = this.container.querySelector('[data-action="connect-migrate"]');
    if (actionBtn) {
      actionBtn.disabled = true;
      actionBtn.innerHTML = '<div class="step-spinner"></div> 연결 테스트 중...';
    }

    // 스피너 표시
    const spinner = this.container.querySelector('.ob-step.active .step-icon span');
    const spinnerEl = this.container.querySelector('.ob-step.active .step-icon .step-spinner');
    if (spinner) spinner.style.display = 'none';
    if (spinnerEl) spinnerEl.style.display = 'block';

    try {
      // 1. 연결 테스트
      const testResult = await this.testConnection();
      if (!testResult.success) {
        throw new Error(testResult.error || '연결 실패');
      }

      // 2. 새 설정 먼저 저장 (타입 + 연결 정보)
      if (actionBtn) actionBtn.innerHTML = '<div class="step-spinner"></div> 설정 저장 중...';
      this.applyNewConfig();
      await this.doSave();

      // 3. 마이그레이션
      const fromType = this.originalConfig?.[this.activeCategory]?.type || 'local';
      const toType = this.selectedNewType;

      if (fromType !== toType) {
        if (actionBtn) actionBtn.innerHTML = '<div class="step-spinner"></div> 데이터 이전 중...';
        this.showProgress(10, '데이터 내보내기 준비 중...');

        const migResult = await this.apiClient.post('/storage/migrate', { fromType, toType });

        if (!migResult.success) {
          throw new Error(migResult.error || '마이그레이션 실패');
        }

        this.showProgress(100, `완료! ${migResult.results?.messages || 0}개 메시지, ${migResult.results?.files || 0}개 파일 이동됨`);
        this.stepData._successMsg = `✅ ${migResult.results?.messages || 0}개 메시지, ${migResult.results?.files || 0}개 파일 이전 완료`;
      } else {
        this.stepData._successMsg = '✅ 설정 저장 완료';
      }

      // 4. 성공
      this.stepStates[this.currentStep] = 'completed';
      this.originalConfig = JSON.parse(JSON.stringify(this.storageConfig));
      this.migrating = false;
      this.render();

      // 2초 후 메인으로
      setTimeout(async () => {
        this.view = 'main';
        this.activeCategory = null;
        this.selectedNewType = null;
        await this.loadUsage();
        this.render();
      }, 2500);

    } catch (error) {
      console.error('Connect & migrate failed:', error);

      // 실패 시 설정 복원
      try {
        this.storageConfig = JSON.parse(JSON.stringify(this.originalConfig));
        await this.doSave();
      } catch (e) {
        console.error('Rollback failed:', e);
      }

      this.stepStates[this.currentStep] = 'error';
      this.stepData._error = error.message;
      this.migrating = false;
      this.render();
    }
  }

  async testConnection() {
    const type = this.selectedNewType;
    try {
      if (type === 'oracle') {
        return await this.apiClient.post('/storage/oracle/test', {
          user: this.stepData.user,
          password: this.stepData.password,
          connectionString: this.stepData.connectionString
        });
      }
      if (type === 'notion') {
        return await this.apiClient.post('/storage/notion/test', {
          token: this.stepData.token,
          databaseId: this.stepData.databaseId
        });
      }
      // local - 경로 존재 확인
      const checkResult = await this.apiClient.get(`/storage/browse/check?path=${encodeURIComponent(this.stepData.path)}`);
      if (!checkResult?.valid) {
        return { success: false, error: checkResult?.error || '경로를 찾을 수 없습니다' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  applyNewConfig() {
    const cat = this.activeCategory;
    const type = this.selectedNewType;
    this.storageConfig[cat].type = type;

    if (type === 'oracle') {
      this.storageConfig[cat].oracle = {
        ...this.storageConfig[cat].oracle,
        user: this.stepData.user,
        password: this.stepData.password,
        connectionString: this.stepData.connectionString,
        walletPath: this.stepData.walletPath || this.storageConfig[cat].oracle?.walletPath
      };
    } else if (type === 'notion') {
      this.storageConfig[cat].notion = {
        ...this.storageConfig[cat].notion,
        token: this.stepData.token,
        databaseId: this.stepData.databaseId
      };
    } else if (type === 'local') {
      this.storageConfig[cat].local = {
        path: this.stepData.path
      };
    }
  }

  showProgress(pct, text) {
    const progressEl = this.container.querySelector('#migrationProgress');
    const fillEl = this.container.querySelector('#progressFill');
    const textEl = this.container.querySelector('#progressText');
    if (progressEl) progressEl.style.display = 'block';
    if (fillEl) fillEl.style.width = pct + '%';
    if (textEl) textEl.textContent = text;
  }

  // ========== 유틸 ==========

  async doSave() {
    await this.apiClient.put('/config/storage', this.storageConfig);
  }

  getTypeName(category, type) {
    const found = this.availableTypes[category]?.find(t => t.type === type);
    return found?.name || type || '로컬';
  }

  formatSize(bytes) {
    if (bytes == null) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  // ========== 월렛 업로드 ==========

  async handleWalletUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = this.container.querySelector('#walletStatus');
    if (statusEl) statusEl.textContent = '업로드 중...';

    try {
      const formData = new FormData();
      formData.append('wallet', file);

      const response = await fetch('/api/storage/upload-oracle-wallet', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result.success) {
        if (statusEl) statusEl.textContent = '✅ 업로드됨';
        this.stepData.walletPath = result.walletPath;
        this.stepData.walletUploaded = true;
        if (result.tnsNames) {
          this.stepData.tnsNames = result.tnsNames;
        }

        // 자동 다음 스텝
        this.stepStates[this.currentStep] = 'completed';
        this.currentStep++;
        this.stepStates[this.currentStep] = 'active';
        this.render();
      } else {
        if (statusEl) statusEl.textContent = '❌ ' + (result.error || '업로드 실패');
      }
    } catch (error) {
      if (statusEl) statusEl.textContent = '❌ 업로드 실패';
      console.error('Wallet upload failed:', error);
    }
  }

  // ========== 폴더 브라우저 ==========

  openFolderBrowser(target) {
    this.currentBrowseTarget = target;
    this.currentPath = '/';
    const modal = this.container.querySelector('#folderBrowserModal');
    if (modal) {
      modal.style.display = 'flex';
      this.loadFolderContents('/');
    }
  }

  closeFolderBrowser() {
    const modal = this.container.querySelector('#folderBrowserModal');
    if (modal) modal.style.display = 'none';
  }

  async loadFolderContents(folderPath) {
    try {
      const response = await this.apiClient.get(`/storage/browse?path=${encodeURIComponent(folderPath)}`);
      const container = this.container.querySelector('#millerColumns');
      this.currentPath = folderPath;

      const pathDisplay = this.container.querySelector('#currentPathDisplay');
      if (pathDisplay) pathDisplay.textContent = folderPath;

      if (container) {
        container.innerHTML = `
          <div class="miller-column">
            ${response.items?.map(item => `
              <div class="folder-item ${item.isDirectory ? 'folder' : 'file'}" data-path="${item.path}">
                <span class="item-icon">${item.isDirectory ? '📁' : '📄'}</span>
                <span class="item-name">${item.name}</span>
              </div>
            `).join('') || '<div class="empty">빈 폴더</div>'}
          </div>
        `;

        container.querySelectorAll('.folder-item.folder').forEach(item => {
          item.addEventListener('click', () => this.loadFolderContents(item.dataset.path));
        });
      }
    } catch (error) {
      console.error('Failed to load folder:', error);
    }
  }

  selectFolder() {
    if (this.currentBrowseTarget) {
      const input = this.container.querySelector(`#${this.currentBrowseTarget}`);
      if (input) input.value = this.currentPath;
    }
    this.closeFolderBrowser();
  }

  renderFolderBrowserModal() {
    return `
      <div class="modal folder-browser-modal" id="folderBrowserModal" style="display:none">
        <div class="modal-content">
          <div class="modal-header">
            <h3>폴더 선택</h3>
            <button class="close-btn" data-action="close-browser">×</button>
          </div>
          <div class="modal-body">
            <div class="current-path">
              <span id="currentPathDisplay">/</span>
              <button class="select-btn" data-action="select-folder">선택</button>
            </div>
            <div class="miller-columns-container" id="millerColumns"></div>
          </div>
        </div>
      </div>
    `;
  }
}

export default StorageSettings;
