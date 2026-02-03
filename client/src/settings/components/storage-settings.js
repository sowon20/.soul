/**
 * Storage Settings Component
 * 저장소 설정 - 메모리/대화와 파일 저장소 분리
 */

export class StorageSettings {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.container = null;
    this.storageConfig = {
      memory: { type: 'local', local: {}, oracle: {}, notion: {}, ftp: {} },
      file: { type: 'local', local: {}, oracle: {}, nas: {} }
    };
    this.originalConfig = null; // 원본 설정 저장
    this.availableTypes = { memory: [], file: [] };
  }

  async init(container) {
    this.container = container;
    await this.loadConfig();
    await this.loadAvailableTypes();
    this.render();
    this.bindEvents();
  }

  async loadConfig() {
    try {
      const response = await this.apiClient.get('/config/storage');
      if (response) {
        this.storageConfig = response;
        // 원본 설정 깊은 복사로 저장
        this.originalConfig = JSON.parse(JSON.stringify(response));
      }
    } catch (error) {
      console.error('Failed to load storage config:', error);
    }
  }

  async loadAvailableTypes() {
    try {
      const response = await this.apiClient.get('/config/storage/available-types');
      if (response) {
        this.availableTypes = response;
      }
    } catch (error) {
      console.error('Failed to load available types:', error);
    }
  }

  render() {
    const memoryType = this.storageConfig.memory?.type || 'local';
    const fileType = this.storageConfig.file?.type || 'local';

    this.container.innerHTML = `
      <div class="storage-settings">
        <!-- 메모리/대화 저장소 -->
        <section class="storage-section">
          <h3 class="storage-section-title">
            <span class="section-icon">🧠</span>
            메모리 & 대화 저장소
          </h3>
          <p class="storage-section-desc">대화 기록, 기억, 설정이 저장되는 위치</p>

          <div class="storage-type-selector" data-storage="memory">
            ${this.renderTypeButtons('memory', memoryType)}
          </div>

          <div class="storage-config-panels" data-storage="memory">
            ${this.renderMemoryPanels(memoryType)}
          </div>
        </section>

        <!-- 파일 저장소 -->
        <section class="storage-section">
          <h3 class="storage-section-title">
            <span class="section-icon">📁</span>
            파일 저장소
          </h3>
          <p class="storage-section-desc">첨부파일, 이미지 등이 저장되는 위치</p>

          <div class="storage-type-selector" data-storage="file">
            ${this.renderTypeButtons('file', fileType)}
          </div>

          <div class="storage-config-panels" data-storage="file">
            ${this.renderFilePanels(fileType)}
          </div>
        </section>

        <!-- 저장 버튼 -->
        <div class="storage-actions">
          <button class="settings-btn settings-btn-primary" id="saveStorageBtn">
            💾 저장
          </button>
          <span class="save-status" id="storageSaveStatus"></span>
        </div>

        <!-- 마이그레이션 모달 -->
        ${this.renderMigrationModal()}

        <!-- 폴더 브라우저 모달 -->
        ${this.renderFolderBrowserModal()}
      </div>
    `;
  }

  renderTypeButtons(storageCategory, currentType) {
    const types = this.availableTypes[storageCategory] || [];

    return `
      <div class="type-buttons">
        ${types.map(t => `
          <button class="type-btn ${currentType === t.type ? 'active' : ''} ${!t.enabled ? 'disabled' : ''}"
                  data-type="${t.type}"
                  ${!t.enabled ? 'disabled' : ''}>
            <span class="type-name">${t.name}</span>
            ${!t.enabled ? '<span class="type-badge">준비중</span>' : ''}
          </button>
        `).join('')}
      </div>
    `;
  }

  renderMemoryPanels(currentType) {
    const config = this.storageConfig.memory || {};

    return `
      <!-- 로컬 -->
      <div class="config-panel ${currentType === 'local' ? 'active' : ''}" data-type="local">
        <div class="config-field">
          <label>저장 경로</label>
          <div class="path-input-group">
            <input type="text" id="memoryLocalPath" class="config-input"
                   value="${config.local?.path || '~/.soul/data'}"
                   placeholder="~/.soul/data">
            <button class="browse-btn" data-target="memoryLocalPath">📁</button>
          </div>
        </div>
      </div>

      <!-- Oracle -->
      <div class="config-panel ${currentType === 'oracle' ? 'active' : ''}" data-type="oracle">
        <div class="config-field">
          <label>Wallet 파일</label>
          <div class="wallet-upload">
            <input type="file" id="memoryOracleWallet" accept=".zip" style="display:none">
            <button class="upload-btn" id="uploadMemoryWalletBtn">📁 Wallet.zip 업로드</button>
            <span class="wallet-status" id="memoryWalletStatus">
              ${config.oracle?.walletPath ? '✅ 설정됨' : '⚪ 미설정'}
            </span>
          </div>
        </div>
        <div class="config-grid">
          <div class="config-field">
            <label>연결 문자열</label>
            <select id="memoryOracleConnection" class="config-input">
              <option value="">-- Wallet 업로드 후 선택 --</option>
              ${config.oracle?.connectionString ?
                `<option value="${config.oracle.connectionString}" selected>${config.oracle.connectionString}</option>` : ''}
            </select>
          </div>
          <div class="config-field">
            <label>사용자</label>
            <input type="text" id="memoryOracleUser" class="config-input"
                   value="${config.oracle?.user || ''}" placeholder="ADMIN">
          </div>
          <div class="config-field">
            <label>비밀번호</label>
            <input type="password" id="memoryOraclePassword" class="config-input" placeholder="********">
          </div>
        </div>
        <div class="test-connection">
          <button class="test-btn" id="testMemoryOracleBtn">🔌 연결 테스트</button>
          <span class="test-result" id="memoryOracleTestResult"></span>
        </div>
      </div>

      <!-- Notion -->
      <div class="config-panel ${currentType === 'notion' ? 'active' : ''}" data-type="notion">
        <div class="config-field">
          <label>Integration Token</label>
          <input type="password" id="memoryNotionToken" class="config-input"
                 value="${config.notion?.token ? '********' : ''}"
                 placeholder="secret_xxxxx">
        </div>
        <div class="config-field">
          <label>Database ID</label>
          <input type="text" id="memoryNotionDbId" class="config-input"
                 value="${config.notion?.databaseId || ''}"
                 placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
        </div>
        <div class="notion-help">
          <a href="https://developers.notion.com/docs/getting-started" target="_blank">
            📖 Notion API 설정 가이드
          </a>
        </div>
        <div class="test-connection">
          <button class="test-btn" id="testMemoryNotionBtn">🔌 연결 테스트</button>
          <span class="test-result" id="memoryNotionTestResult"></span>
        </div>
      </div>

      <!-- FTP (비활성) -->
      <div class="config-panel ${currentType === 'ftp' ? 'active' : ''}" data-type="ftp">
        <div class="disabled-notice">
          <span class="notice-icon">🚧</span>
          <span>FTP 저장소는 현재 준비 중입니다.</span>
        </div>
      </div>
    `;
  }

  renderFilePanels(currentType) {
    const config = this.storageConfig.file || {};

    return `
      <!-- 로컬 -->
      <div class="config-panel ${currentType === 'local' ? 'active' : ''}" data-type="local">
        <div class="config-field">
          <label>저장 경로</label>
          <div class="path-input-group">
            <input type="text" id="fileLocalPath" class="config-input"
                   value="${config.local?.path || '~/.soul/files'}"
                   placeholder="~/.soul/files">
            <button class="browse-btn" data-target="fileLocalPath">📁</button>
          </div>
        </div>
      </div>

      <!-- Oracle Storage (비활성) -->
      <div class="config-panel ${currentType === 'oracle' ? 'active' : ''}" data-type="oracle">
        <div class="disabled-notice">
          <span class="notice-icon">🚧</span>
          <span>Oracle Object Storage는 현재 준비 중입니다.</span>
        </div>
      </div>

      <!-- NAS (비활성) -->
      <div class="config-panel ${currentType === 'nas' ? 'active' : ''}" data-type="nas">
        <div class="disabled-notice">
          <span class="notice-icon">🚧</span>
          <span>NAS/SMB 저장소는 현재 준비 중입니다.</span>
        </div>
      </div>
    `;
  }

  renderMigrationModal() {
    return `
      <div class="modal migration-modal" id="migrationModal" style="display:none">
        <div class="modal-content">
          <div class="modal-header">
            <h3>저장소 변경</h3>
            <button class="close-btn" id="closeMigrationModal">✕</button>
          </div>
          <div class="modal-body">
            <div class="migration-info" id="migrationInfo"></div>
            <p style="margin: 0.8rem 0; color: var(--text-secondary); font-size: 0.9rem;">
              기존 대화 데이터를 새 저장소로 이동합니다.
            </p>
            <div class="migration-progress" id="migrationProgress" style="display:none">
              <div style="background: var(--bg-tertiary); border-radius: 4px; height: 6px; overflow: hidden; margin: 1rem 0;">
                <div id="migrationProgressBar" style="height: 100%; background: var(--accent-primary); width: 0%; transition: width 0.3s;"></div>
              </div>
              <span id="migrationProgressText" style="font-size: 0.85rem; color: var(--text-secondary);"></span>
            </div>
          </div>
          <div class="modal-actions" id="migrationActions">
            <button class="settings-btn" id="cancelMigration">취소</button>
            <button class="settings-btn settings-btn-primary" id="confirmMigration">마이그레이션 시작</button>
          </div>
        </div>
      </div>
    `;
  }

  renderFolderBrowserModal() {
    return `
      <div class="modal folder-browser-modal" id="folderBrowserModal" style="display:none">
        <div class="modal-content miller-columns">
          <div class="modal-header">
            <h3>📁 폴더 선택</h3>
            <button class="close-btn" id="closeFolderBrowser">✕</button>
          </div>
          <div class="current-path">
            <span id="currentPathDisplay">/</span>
            <button class="select-btn" id="selectCurrentFolder">✓ 선택</button>
          </div>
          <div class="miller-columns-container" id="millerColumns"></div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // 타입 선택 버튼
    this.container.querySelectorAll('.type-btn:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleTypeSelect(e));
    });

    // 저장 버튼
    this.container.querySelector('#saveStorageBtn')?.addEventListener('click', () => this.save());

    // 폴더 찾아보기
    this.container.querySelectorAll('.browse-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.openFolderBrowser(e));
    });

    // 연결 테스트 버튼들
    this.container.querySelector('#testMemoryOracleBtn')?.addEventListener('click', () => this.testOracleConnection('memory'));
    this.container.querySelector('#testMemoryNotionBtn')?.addEventListener('click', () => this.testNotionConnection('memory'));

    // Wallet 업로드
    this.container.querySelector('#uploadMemoryWalletBtn')?.addEventListener('click', () => {
      this.container.querySelector('#memoryOracleWallet').click();
    });
    this.container.querySelector('#memoryOracleWallet')?.addEventListener('change', (e) => this.handleWalletUpload(e, 'memory'));

    // 모달 닫기
    this.container.querySelector('#closeMigrationModal')?.addEventListener('click', () => this.closeMigrationModal());
    this.container.querySelector('#cancelMigration')?.addEventListener('click', () => this.closeMigrationModal());
    this.container.querySelector('#closeFolderBrowser')?.addEventListener('click', () => this.closeFolderBrowser());

    // 마이그레이션 확인
    this.container.querySelector('#confirmMigration')?.addEventListener('click', () => this.confirmMigration());

    // 폴더 선택
    this.container.querySelector('#selectCurrentFolder')?.addEventListener('click', () => this.selectFolder());
  }

  handleTypeSelect(e) {
    const btn = e.target.closest('.type-btn');
    if (!btn || btn.disabled) return;

    const selector = btn.closest('.storage-type-selector');
    const storageCategory = selector.dataset.storage;
    const newType = btn.dataset.type;
    const currentType = this.storageConfig[storageCategory]?.type;

    // 같은 타입이면 무시
    if (newType === currentType) return;

    // 버튼 활성화 상태 변경
    selector.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 패널 표시 변경
    const panels = this.container.querySelector(`.storage-config-panels[data-storage="${storageCategory}"]`);
    panels.querySelectorAll('.config-panel').forEach(p => p.classList.remove('active'));
    panels.querySelector(`.config-panel[data-type="${newType}"]`)?.classList.add('active');

    // 설정 업데이트
    if (!this.storageConfig[storageCategory]) {
      this.storageConfig[storageCategory] = {};
    }
    this.storageConfig[storageCategory].type = newType;
  }

  async save() {
    // 현재 입력값 수집
    this.collectInputValues();

    // 타입 변경 감지
    const memoryTypeChanged = this.originalConfig?.memory?.type !== this.storageConfig.memory?.type;
    const fileTypeChanged = this.originalConfig?.file?.type !== this.storageConfig.file?.type;

    if (memoryTypeChanged || fileTypeChanged) {
      // 마이그레이션 모달 표시
      const fromMemory = this.getTypeName('memory', this.originalConfig?.memory?.type);
      const toMemory = this.getTypeName('memory', this.storageConfig.memory?.type);
      const fromFile = this.getTypeName('file', this.originalConfig?.file?.type);
      const toFile = this.getTypeName('file', this.storageConfig.file?.type);

      let changes = [];
      if (memoryTypeChanged) changes.push(`메모리/대화: ${fromMemory} → ${toMemory}`);
      if (fileTypeChanged) changes.push(`파일: ${fromFile} → ${toFile}`);

      this.showMigrationModal(changes.join('<br>'));
    } else {
      // 타입 변경 없으면 바로 저장
      await this.doSave();
    }
  }

  getTypeName(category, type) {
    const found = this.availableTypes[category]?.find(t => t.type === type);
    return found?.name || type || '로컬';
  }

  async doSave() {
    const status = this.container.querySelector('#storageSaveStatus');
    status.textContent = '저장 중...';
    status.className = 'save-status saving';

    try {
      // API 호출
      const response = await this.apiClient.put('/config/storage', this.storageConfig);

      status.textContent = '✅ 저장되었습니다';
      status.className = 'save-status success';

      // 원본 설정 업데이트
      this.originalConfig = JSON.parse(JSON.stringify(this.storageConfig));
    } catch (error) {
      console.error('Failed to save storage config:', error);
      status.textContent = '❌ 저장 실패';
      status.className = 'save-status error';
    }
  }

  collectInputValues() {
    // 메모리 저장소
    const memoryType = this.storageConfig.memory?.type || 'local';
    if (memoryType === 'local') {
      this.storageConfig.memory.local = {
        path: this.container.querySelector('#memoryLocalPath')?.value || '~/.soul/data'
      };
    } else if (memoryType === 'oracle') {
      const password = this.container.querySelector('#memoryOraclePassword')?.value;
      this.storageConfig.memory.oracle = {
        ...this.storageConfig.memory.oracle,
        connectionString: this.container.querySelector('#memoryOracleConnection')?.value || '',
        user: this.container.querySelector('#memoryOracleUser')?.value || '',
        ...(password && password !== '********' ? { password } : {})
      };
    } else if (memoryType === 'notion') {
      const token = this.container.querySelector('#memoryNotionToken')?.value;
      this.storageConfig.memory.notion = {
        ...this.storageConfig.memory.notion,
        databaseId: this.container.querySelector('#memoryNotionDbId')?.value || '',
        ...(token && token !== '********' ? { token } : {})
      };
    }

    // 파일 저장소
    const fileType = this.storageConfig.file?.type || 'local';
    if (fileType === 'local') {
      this.storageConfig.file.local = {
        path: this.container.querySelector('#fileLocalPath')?.value || '~/.soul/files'
      };
    }
  }

  async restartServer() {
    try {
      await this.apiClient.post('/config/restart');
      alert('서버가 재시작됩니다. 잠시 후 페이지를 새로고침하세요.');
    } catch (error) {
      console.error('Failed to restart server:', error);
      alert('서버 재시작 실패. 수동으로 재시작하세요.');
    }
  }

  async testOracleConnection(category) {
    const resultEl = this.container.querySelector(`#${category}OracleTestResult`);
    resultEl.textContent = '테스트 중...';
    resultEl.className = 'test-result testing';

    try {
      const response = await this.apiClient.post('/config/storage/oracle/test');
      if (response.success) {
        resultEl.textContent = '✅ 연결 성공';
        resultEl.className = 'test-result success';
      } else {
        resultEl.textContent = '❌ ' + (response.message || '연결 실패');
        resultEl.className = 'test-result error';
      }
    } catch (error) {
      resultEl.textContent = '❌ ' + error.message;
      resultEl.className = 'test-result error';
    }
  }

  async testNotionConnection(category) {
    const resultEl = this.container.querySelector(`#${category}NotionTestResult`);
    resultEl.textContent = '테스트 중...';
    resultEl.className = 'test-result testing';

    try {
      const response = await this.apiClient.post('/storage/test-notion', {
        token: this.container.querySelector(`#${category}NotionToken`)?.value,
        databaseId: this.container.querySelector(`#${category}NotionDbId`)?.value
      });
      if (response.success) {
        resultEl.textContent = '✅ 연결 성공';
        resultEl.className = 'test-result success';
      } else {
        resultEl.textContent = '❌ ' + (response.message || '연결 실패');
        resultEl.className = 'test-result error';
      }
    } catch (error) {
      resultEl.textContent = '❌ ' + error.message;
      resultEl.className = 'test-result error';
    }
  }

  async handleWalletUpload(e, category) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = this.container.querySelector(`#${category}WalletStatus`);
    statusEl.textContent = '업로드 중...';

    try {
      const formData = new FormData();
      formData.append('wallet', file);

      const response = await fetch('/api/storage/upload-oracle-wallet', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (result.success) {
        statusEl.textContent = '✅ 업로드됨';
        this.storageConfig[category].oracle.walletPath = result.walletPath;

        // TNS 목록 업데이트
        if (result.tnsNames) {
          const select = this.container.querySelector(`#${category}OracleConnection`);
          select.innerHTML = result.tnsNames.map(name =>
            `<option value="${name}">${name}</option>`
          ).join('');
        }
      } else {
        statusEl.textContent = '❌ 실패: ' + result.error;
      }
    } catch (error) {
      statusEl.textContent = '❌ 업로드 실패';
      console.error('Wallet upload failed:', error);
    }
  }

  // 폴더 브라우저
  currentBrowseTarget = null;
  currentPath = '/';

  openFolderBrowser(e) {
    const btn = e.target.closest('.browse-btn');
    this.currentBrowseTarget = btn.dataset.target;
    this.currentPath = '/';

    const modal = this.container.querySelector('#folderBrowserModal');
    modal.style.display = 'flex';

    this.loadFolderContents('/');
  }

  closeFolderBrowser() {
    this.container.querySelector('#folderBrowserModal').style.display = 'none';
  }

  async loadFolderContents(path) {
    try {
      const response = await this.apiClient.get(`/storage/browse?path=${encodeURIComponent(path)}`);
      const container = this.container.querySelector('#millerColumns');

      // 경로 표시 업데이트
      this.currentPath = path;
      this.container.querySelector('#currentPathDisplay').textContent = path;

      // 폴더 목록 렌더링
      container.innerHTML = `
        <div class="miller-column">
          ${response.items?.map(item => `
            <div class="folder-item ${item.isDirectory ? 'folder' : 'file'}"
                 data-path="${item.path}">
              <span class="item-icon">${item.isDirectory ? '📁' : '📄'}</span>
              <span class="item-name">${item.name}</span>
            </div>
          `).join('') || '<div class="empty">빈 폴더</div>'}
        </div>
      `;

      // 폴더 클릭 이벤트
      container.querySelectorAll('.folder-item.folder').forEach(item => {
        item.addEventListener('click', () => {
          this.loadFolderContents(item.dataset.path);
        });
      });
    } catch (error) {
      console.error('Failed to load folder:', error);
    }
  }

  selectFolder() {
    if (this.currentBrowseTarget) {
      const input = this.container.querySelector(`#${this.currentBrowseTarget}`);
      if (input) {
        input.value = this.currentPath;
      }
    }
    this.closeFolderBrowser();
  }

  // 마이그레이션 모달
  pendingMigration = null;

  showMigrationModal(changesHtml) {
    this.pendingMigration = true;

    const modal = this.container.querySelector('#migrationModal');
    const info = this.container.querySelector('#migrationInfo');

    info.innerHTML = `
      <div style="margin-bottom: 0.5rem; padding: 0.8rem; background: rgba(196, 149, 106, 0.15); border-radius: 8px;">
        <strong>${changesHtml}</strong>
      </div>
    `;

    // 진행률 숨기고 버튼 초기화
    const progress = this.container.querySelector('#migrationProgress');
    if (progress) progress.style.display = 'none';
    const actions = this.container.querySelector('#migrationActions');
    if (actions) actions.style.display = 'flex';

    modal.style.display = 'flex';
  }

  closeMigrationModal() {
    this.container.querySelector('#migrationModal').style.display = 'none';
    this.pendingMigration = null;
  }

  async confirmMigration() {
    if (!this.pendingMigration) return;

    const fromType = this.originalConfig?.memory?.type || 'local';
    const toType = this.storageConfig.memory?.type || 'local';

    // 버튼 비활성화 + 진행률 표시
    const confirmBtn = this.container.querySelector('#confirmMigration');
    const cancelBtn = this.container.querySelector('#cancelMigration');
    const progress = this.container.querySelector('#migrationProgress');
    const progressText = this.container.querySelector('#migrationProgressText');
    const progressBar = this.container.querySelector('#migrationProgressBar');

    confirmBtn.disabled = true;
    confirmBtn.textContent = '마이그레이션 중...';
    cancelBtn.style.display = 'none';
    progress.style.display = 'block';
    progressText.textContent = '데이터 내보내기 준비 중...';
    progressBar.style.width = '10%';

    try {
      // 1. 마이그레이션 실행
      progressText.textContent = '데이터 이동 중...';
      progressBar.style.width = '30%';

      const result = await this.apiClient.post('/storage/migrate', {
        fromType,
        toType
      });

      if (!result.success) {
        throw new Error(result.error || '마이그레이션 실패');
      }

      progressBar.style.width = '80%';
      progressText.textContent = `${result.results?.messages || 0}개 메시지 이동 완료. 설정 저장 중...`;

      // 2. 새 설정 저장
      await this.doSave();

      progressBar.style.width = '100%';
      progressText.textContent = `완료! ${result.results?.messages || 0}개 메시지, ${result.results?.files || 0}개 파일 이동됨`;

      // 3초 후 모달 닫기
      setTimeout(() => {
        this.closeMigrationModal();
      }, 2000);
    } catch (error) {
      console.error('Migration failed:', error);
      progressBar.style.width = '0%';
      progressBar.style.background = '#e74c3c';
      progressText.textContent = `실패: ${error.message}`;

      // 버튼 복원
      confirmBtn.disabled = false;
      confirmBtn.textContent = '다시 시도';
      cancelBtn.style.display = 'block';
    }
  }
}

export default StorageSettings;
