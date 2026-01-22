/**
 * Profile Settings Component
 * 프로필 설정 UI 컴포넌트
 */

export class ProfileSettings {
  constructor() {
    this.profile = null;
  }

  /**
   * 컴포넌트 렌더링
   */
  async render(container, apiClient) {
    try {
      // 프로필 데이터 로드
      const response = await apiClient.get('/profile/p?userId=sowon');
      this.profile = response.profile;

      // UI 렌더링
      container.innerHTML = `
        <div class="profile-settings-panel">
          <!-- 기본 정보 -->
          <section class="settings-section">
            <h3 class="settings-section-title">기본 정보</h3>
            <div class="settings-fields">
              ${this.renderBasicInfoFields()}
            </div>
          </section>

          <!-- 추가 정보 -->
          <section class="settings-section">
            <div class="settings-section-header">
              <h3 class="settings-section-title">추가 정보</h3>
              <button class="settings-btn settings-btn-add" id="addFieldBtn">
                <span>+</span>
                <span>필드 추가</span>
              </button>
            </div>
            <div class="settings-fields" id="customFieldsContainer">
              ${this.renderCustomFields()}
            </div>
          </section>
        </div>

        <!-- 저장 상태 표시 -->
        <div class="settings-save-status" id="saveStatus"></div>
      `;

      // 이벤트 리스너 등록
      this.attachEventListeners(container, apiClient);
    } catch (error) {
      console.error('Failed to load profile:', error);
      container.innerHTML = `
        <div class="settings-error">
          <p>프로필을 불러오는 중 오류가 발생했습니다.</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * 기본 정보 필드 렌더링
   */
  renderBasicInfoFields() {
    const basicFields = [
      { key: 'name', label: '이름', type: 'text', placeholder: '이름을 입력하세요' },
      { key: 'nickname', label: '닉네임', type: 'text', placeholder: '닉네임을 입력하세요' },
      { key: 'email', label: '이메일', type: 'email', placeholder: 'email@example.com' },
      { key: 'phone', label: '전화번호', type: 'tel', placeholder: '010-0000-0000' },
      { key: 'birthDate', label: '생년월일', type: 'date', placeholder: '' },
      { key: 'gender', label: '성별', type: 'select', options: ['남성', '여성', '기타'] },
      { key: 'idNumber', label: '주민번호', type: 'text', placeholder: '000000-0000000', sensitive: true },
      { key: 'country', label: '국가', type: 'text', placeholder: '대한민국' },
      { key: 'address', label: '주소', type: 'text', placeholder: '주소를 입력하세요' },
      { key: 'timezone', label: '타임존', type: 'select', options: ['Asia/Seoul', 'UTC', 'America/New_York', 'Europe/London'] },
      { key: 'language', label: '언어', type: 'select', options: ['ko', 'en', 'ja', 'zh'] }
    ];

    return basicFields.map(field => {
      const basicInfo = this.profile.basicInfo[field.key] || {};
      const value = basicInfo.value || '';
      const visibility = basicInfo.visibility || { visibleToSoul: true, autoIncludeInContext: true };

      let inputHtml = '';
      if (field.type === 'select') {
        const options = field.options.map(opt =>
          `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`
        ).join('');
        inputHtml = `
          <select class="settings-input" data-basic-field="${field.key}">
            <option value="">선택 안함</option>
            ${options}
          </select>
        `;
      } else if (field.type === 'date') {
        const dateValue = value ? new Date(value).toISOString().split('T')[0] : '';
        inputHtml = `
          <input type="${field.type}"
                 class="settings-input"
                 value="${dateValue}"
                 data-basic-field="${field.key}"
                 placeholder="${field.placeholder}">
        `;
      } else {
        inputHtml = `
          <input type="${field.type}"
                 class="settings-input"
                 value="${value}"
                 data-basic-field="${field.key}"
                 placeholder="${field.placeholder}">
        `;
      }

      return `
        <div class="settings-field">
          <div class="settings-field-header">
            <label>${field.label}</label>
            <div class="settings-field-toggles">
              <label class="toggle-label" title="소울에게 공개">
                <input type="checkbox"
                       class="toggle-checkbox"
                       data-basic-field="${field.key}"
                       data-visibility="visibleToSoul"
                       ${visibility.visibleToSoul ? 'checked' : ''}>
                <span class="toggle-icon">${visibility.visibleToSoul ? '👁️' : '🔒'}</span>
              </label>
              <label class="toggle-label" title="자동 포함">
                <input type="checkbox"
                       class="toggle-checkbox"
                       data-basic-field="${field.key}"
                       data-visibility="autoIncludeInContext"
                       ${visibility.autoIncludeInContext ? 'checked' : ''}>
                <span class="toggle-icon">${visibility.autoIncludeInContext ? '🔄' : '⏸️'}</span>
              </label>
            </div>
          </div>
          ${inputHtml}
          ${field.sensitive ? '<small class="settings-field-hint">⚠️ 민감 정보</small>' : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * 커스텀 필드 렌더링
   */
  renderCustomFields() {
    if (!this.profile.customFields || this.profile.customFields.length === 0) {
      return '<p class="settings-empty">추가 필드가 없습니다. "필드 추가" 버튼을 눌러 정보를 추가하세요.</p>';
    }

    const sortedFields = [...this.profile.customFields].sort((a, b) => a.order - b.order);

    return sortedFields.map(field => `
      <div class="settings-custom-field" draggable="true" data-field-id="${field.id}">
        <span class="settings-field-drag-handle">⋮⋮</span>
        <div class="settings-field-content">
          <div class="settings-field-header">
            <input type="text"
                   class="settings-field-label"
                   value="${field.label}"
                   data-field-id="${field.id}"
                   data-prop="label"
                   placeholder="필드 이름">
            <button class="settings-field-delete" data-field-id="${field.id}">×</button>
          </div>
          <div class="settings-field-value">
            ${this.renderCustomFieldInput(field)}
          </div>
          <div class="settings-field-meta">
            <select class="settings-field-type" data-field-id="${field.id}" data-prop="type">
              <option value="text" ${field.type === 'text' ? 'selected' : ''}>텍스트</option>
              <option value="number" ${field.type === 'number' ? 'selected' : ''}>숫자</option>
              <option value="date" ${field.type === 'date' ? 'selected' : ''}>날짜</option>
              <option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>긴 텍스트</option>
            </select>
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * 커스텀 필드 입력 요소 렌더링
   */
  renderCustomFieldInput(field) {
    const value = field.value || '';

    switch (field.type) {
      case 'textarea':
        return `<textarea class="settings-field-input" data-field-id="${field.id}" data-prop="value" placeholder="내용을 입력하세요">${value}</textarea>`;
      case 'number':
        return `<input type="number" class="settings-field-input" value="${value}" data-field-id="${field.id}" data-prop="value" placeholder="숫자를 입력하세요">`;
      case 'date':
        const dateValue = value ? new Date(value).toISOString().split('T')[0] : '';
        return `<input type="date" class="settings-field-input" value="${dateValue}" data-field-id="${field.id}" data-prop="value">`;
      default:
        return `<input type="text" class="settings-field-input" value="${value}" data-field-id="${field.id}" data-prop="value" placeholder="내용을 입력하세요">`;
    }
  }

  /**
   * 이벤트 리스너 등록
   */
  attachEventListeners(container, apiClient) {
    // 기본 정보 값 변경 자동 저장
    container.querySelectorAll('.settings-input[data-basic-field]').forEach(input => {
      input.addEventListener('change', (e) => this.saveBasicInfoValue(e.target, apiClient));
    });

    // 기본 정보 토글 버튼
    container.querySelectorAll('.toggle-checkbox[data-basic-field]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => this.saveBasicInfoVisibility(e.target, apiClient));
    });

    // 필드 추가 버튼
    const addBtn = container.querySelector('#addFieldBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.addField(container, apiClient));
    }
  }

  /**
   * 기본 정보 값 저장
   */
  async saveBasicInfoValue(input, apiClient) {
    const fieldKey = input.dataset.basicField;
    const value = input.value;

    try {
      this.showSaveStatus('저장 중...', 'info');

      // 로컬 상태 업데이트
      if (!this.profile.basicInfo[fieldKey]) {
        this.profile.basicInfo[fieldKey] = {};
      }
      this.profile.basicInfo[fieldKey].value = value;

      // API 호출
      const response = await fetch(`/api/profile/p/basic/${fieldKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });

      if (!response.ok) throw new Error('저장 실패');

      this.showSaveStatus('✓ 저장됨', 'success');
      setTimeout(() => this.hideSaveStatus(), 2000);

    } catch (error) {
      console.error('기본 정보 저장 실패:', error);
      this.showSaveStatus('❌ 저장 실패', 'error');
      setTimeout(() => this.hideSaveStatus(), 3000);
    }
  }

  /**
   * 기본 정보 공개 설정 저장
   */
  async saveBasicInfoVisibility(checkbox, apiClient) {
    const fieldKey = checkbox.dataset.basicField;
    const visibilityKey = checkbox.dataset.visibility;
    const value = checkbox.checked;

    try {
      // 아이콘 업데이트
      const icon = checkbox.nextElementSibling;
      if (visibilityKey === 'visibleToSoul') {
        icon.textContent = value ? '👁️' : '🔒';
      } else if (visibilityKey === 'autoIncludeInContext') {
        icon.textContent = value ? '🔄' : '⏸️';
      }

      this.showSaveStatus('저장 중...', 'info');

      // 로컬 상태 업데이트
      if (!this.profile.basicInfo[fieldKey]) {
        this.profile.basicInfo[fieldKey] = { visibility: {} };
      }
      if (!this.profile.basicInfo[fieldKey].visibility) {
        this.profile.basicInfo[fieldKey].visibility = {};
      }
      this.profile.basicInfo[fieldKey].visibility[visibilityKey] = value;

      // API 호출
      const response = await fetch(`/api/profile/p/basic/${fieldKey}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [visibilityKey]: value })
      });

      if (!response.ok) throw new Error('저장 실패');

      this.showSaveStatus('✓ 저장됨', 'success');
      setTimeout(() => this.hideSaveStatus(), 2000);

    } catch (error) {
      console.error('기본 정보 저장 실패:', error);
      this.showSaveStatus('✗ 저장 실패', 'error');
    }
  }

  /**
   * 필드 추가
   */
  async addField(container, apiClient) {
    // TODO: 구현
    alert('커스텀 필드 추가 기능은 곧 구현됩니다.');
  }

  /**
   * 저장 상태 표시
   */
  showSaveStatus(message, type) {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `settings-save-status ${type}`;
      statusEl.style.display = 'block';
    }
  }

  /**
   * 저장 상태 숨기기
   */
  hideSaveStatus() {
    const statusEl = document.getElementById('saveStatus');
    if (statusEl) {
      statusEl.style.display = 'none';
    }
  }
}
