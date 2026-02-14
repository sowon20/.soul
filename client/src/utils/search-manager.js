/**
 * Search Manager
 * 메모리 및 대화 통합 검색 관리
 */

export class SearchManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.searchInput = null;
    this.resultsContainer = null;
    this.debounceTimer = null;
    this.debounceDelay = 300;
    this.isSearching = false;
    this.lastSearchResults = [];
    this.currentQuery = null; // 현재 검색어
  }

  /**
   * 검색 매니저 초기화
   */
  init() {
    this.searchInput = document.querySelector('.search-input');

    if (!this.searchInput) {
      console.warn('검색 입력창을 찾을 수 없습니다.');
      return;
    }

    // 검색 결과 드롭다운 생성
    this.createResultsDropdown();

    // 이벤트 리스너 등록
    this.setupEventListeners();

    console.log('✅ SearchManager 초기화 완료');
  }

  /**
   * 검색 결과 드롭다운 컨테이너 생성
   */
  createResultsDropdown() {
    const searchBox = this.searchInput.closest('.search-box');
    if (!searchBox) return;

    // 기존 드롭다운이 있으면 제거
    const existing = searchBox.querySelector('.search-results-dropdown');
    if (existing) existing.remove();

    // 드롭다운 생성
    this.resultsContainer = document.createElement('div');
    this.resultsContainer.className = 'search-results-dropdown';
    this.resultsContainer.style.display = 'none';

    searchBox.appendChild(this.resultsContainer);
  }

  /**
   * 이벤트 리스너 설정
   */
  setupEventListeners() {
    // 입력 이벤트 (디바운스)
    this.searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();

      clearTimeout(this.debounceTimer);

      if (!query) {
        this.hideResults();
        return;
      }

      this.debounceTimer = setTimeout(() => {
        this.search(query);
      }, this.debounceDelay);
    });

    // Enter 키로 즉시 검색
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = this.searchInput.value.trim();
        if (query) {
          clearTimeout(this.debounceTimer);
          this.search(query);
        }
      } else if (e.key === 'Escape') {
        this.hideResults();
        this.searchInput.blur();
      }
    });

    // 포커스 잃으면 드롭다운 숨김 (딜레이로 클릭 허용)
    this.searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        this.hideResults();
      }, 200);
    });

    // 포커스 시 기존 결과 표시
    this.searchInput.addEventListener('focus', () => {
      const query = this.searchInput.value.trim();
      if (query && this.resultsContainer.children.length > 0) {
        this.showResults();
      }
    });
  }

  /**
   * 검색 실행
   */
  async search(query) {
    if (this.isSearching || !query) return;

    this.isSearching = true;
    this.currentQuery = query; // 검색어 저장
    this.showLoading();

    try {
      // Smart Search API 호출
      const response = await this.apiClient.smartSearch(query, {
        limit: 50,
        includeMemory: true
      });

      if (response && response.results) {
        this.renderResults(response.results, query);
      } else {
        this.renderNoResults(query);
      }
    } catch (error) {
      console.error('검색 실패:', error);
      this.renderError(error.message);
    } finally {
      this.isSearching = false;
    }
  }

  /**
   * 로딩 상태 표시
   */
  showLoading() {
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
      <div class="search-loading">
        <div class="search-loading-spinner"></div>
        <span>검색 중...</span>
      </div>
    `;
    this.showResults();
  }

  /**
   * 검색 결과 렌더링
   */
  renderResults(results, query) {
    if (!this.resultsContainer) return;

    if (!results || results.length === 0) {
      this.renderNoResults(query);
      return;
    }

    // 결과 저장 (클릭 시 사용)
    this.lastSearchResults = results;

    const html = results.map(result => this.renderResultItem(result, query)).join('');

    this.resultsContainer.innerHTML = `
      <div class="search-results-header">
        <span class="search-results-count">${results.length}개의 결과</span>
      </div>
      <div class="search-results-list">
        ${html}
      </div>
    `;

    // 결과 항목 클릭 이벤트
    this.resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const type = item.dataset.type;
        this.handleResultClick(id, type);
      });
    });

    this.showResults();
  }

  /**
   * 개별 검색 결과 항목 렌더링
   */
  renderResultItem(result, query) {
    // 타입 정보
    const type = result.type || 'memory';
    const typeLabel = result.typeLabel || '메모리';
    const typeClass = type;
    
    // 날짜
    const date = result.date ? this.formatDate(result.date) : '';
    
    // User + Assistant 메시지 분리 표시
    const lines = (result.preview || '').split('\n');
    const userLine = lines.find(l => l.startsWith('[user]')) || lines[0] || '';
    const assistantLine = lines.find(l => l.startsWith('[assistant]')) || lines[1] || '';

    const userText = userLine.replace(/^\[user\]\s*/, '').trim();
    const assistantText = assistantLine.replace(/^\[assistant\]\s*/, '').trim();

    // 검색어가 포함된 메시지를 제목으로
    const queryLower = query.toLowerCase();
    const userHasQuery = userText.toLowerCase().includes(queryLower);
    const assistantHasQuery = assistantText.toLowerCase().includes(queryLower);

    let title, highlightedPreview;
    
    // 프로필에서 이름 가져오기
    const userName = window.soulApp?.profile?.profile?.name || window.soulApp?.profile?.name || 'You';
    const aiName = window.soulApp?.aiName || 'Soul';
    console.log('🏷️ userName:', userName, 'aiName:', aiName);

    if (assistantHasQuery) {
      // 검색어가 assistant에 있으면 그걸 제목으로
      title = `<span class="role-badge role-assistant">${aiName}</span> ${this.highlightText(this.truncateText(assistantText, 70), query)}`;
      highlightedPreview = userText ? `<span class="user-preview"><span class="role-badge role-user">${userName}</span> ${this.highlightText(this.truncateText(userText, 80), query)}</span>` : '';
    } else {
      // 검색어가 user에 있거나 둘 다 없으면 기존처럼
      title = `<span class="role-badge role-user">${userName}</span> ${this.highlightText(this.truncateText(userText, 70), query)}`;
      highlightedPreview = assistantText
        ? `<span class="assistant-preview"><span class="role-badge role-assistant">${aiName}</span> ${this.highlightText(this.truncateText(assistantText, 80), query)}</span>`
        : '';
    }
    
    // 태그
    const tags = result.tags || [];
    
    // 역할 표시 (대화인 경우)
    const roleLabel = result.source?.role === 'user' ? '👤' : result.source?.role === 'assistant' ? '🤖' : '';

    return `
      <div class="search-result-item" data-id="${result.id}" data-type="${type}">
        <div class="search-result-header">
          <span class="search-result-type ${typeClass}">${roleLabel} ${typeLabel}</span>
          <span class="search-result-date">${date}</span>
        </div>
        <div class="search-result-title">👤 ${title}</div>
        ${highlightedPreview ? `<div class="search-result-preview">${highlightedPreview}</div>` : ''}
        ${tags.length > 0 ? `
          <div class="search-result-tags">
            ${tags.slice(0, 3).map(tag => `<span class="search-tag">${tag}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * 검색어 주변 컨텍스트 추출
   */
  getContextAroundQuery(text, query, maxLength = 150) {
    if (!text || !query) return this.truncateText(text, maxLength);
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) {
      // 검색어 못 찾으면 앞부분 반환
      return this.truncateText(text, maxLength);
    }
    
    // 검색어 주변 컨텍스트 추출
    const contextStart = Math.max(0, index - 50);
    const contextEnd = Math.min(text.length, index + query.length + 100);
    
    let context = text.substring(contextStart, contextEnd);
    
    // 앞뒤 ... 추가
    if (contextStart > 0) context = '...' + context;
    if (contextEnd < text.length) context = context + '...';
    
    return context;
  }

  /**
   * 검색어 하이라이트
   */
  highlightText(text, query) {
    if (!query || !text) return text;

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  /**
   * 텍스트 자르기
   */
  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * 날짜 포맷
   */
  formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now - date;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      if (days === 0) return '오늘';
      if (days === 1) return '어제';
      if (days < 7) return `${days}일 전`;

      return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * 결과 없음 표시
   */
  renderNoResults(query) {
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
      <div class="search-no-results">
        <svg class="search-no-results-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <p>"${query}"에 대한 검색 결과가 없습니다.</p>
      </div>
    `;
    this.showResults();
  }

  /**
   * 에러 표시
   */
  renderError(message) {
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
      <div class="search-error">
        <svg class="search-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>검색 중 오류가 발생했습니다.</p>
        <span class="search-error-detail">${message}</span>
      </div>
    `;
    this.showResults();
  }

  /**
   * 결과 클릭 처리
   */
  async handleResultClick(id, type) {
    console.log(`검색 결과 클릭: ${type} - ${id}`);

    // 클릭한 결과 데이터 찾기
    const clickedItem = this.resultsContainer.querySelector(`[data-id="${id}"]`);
    const resultData = this.lastSearchResults?.find(r => r.id === id);

    this.hideResults();
    this.searchInput.value = '';

    if (type === 'message' && resultData) {
      // 대화 메시지로 이동
      this.scrollToMessage(resultData);
    } else if (resultData) {
      // 다른 타입(메모리, 아카이브 등)은 Canvas에 표시
      this.showMemoryInCanvas(resultData);
    }
  }

  /**
   * 해당 메시지로 스크롤 이동
   */
  async scrollToMessage(messageData) {
    console.log('scrollToMessage 호출:', messageData.id);
    
    const messagesArea = document.getElementById('messagesArea');
    if (!messagesArea) return;

    // 이미 DOM에 있는지 확인
    let messageEl = messagesArea.querySelector(`[data-message-id="${messageData.id}"]`);
    console.log('DOM에서 찾음:', !!messageEl);
    
    if (!messageEl) {
      // DOM에 없으면 해당 시점 메시지 로드 필요
      const chatManager = window.soulApp?.chatManager;
      console.log('chatManager:', !!chatManager);
      
      if (chatManager) {
        // 해당 메시지 주변 로드
        await chatManager.loadMessagesAround(messageData.id, messageData.date);
        
        // 다시 찾기
        messageEl = messagesArea.querySelector(`[data-message-id="${messageData.id}"]`);
        console.log('로드 후 DOM에서 찾음:', !!messageEl);
      }
    }

    if (messageEl) {
      // 스크롤 이동 (chatContainer가 스크롤 담당)
      const scrollContainer = messagesArea.parentElement;
      const messageTop = messageEl.offsetTop;
      const containerHeight = scrollContainer.clientHeight;
      
      scrollContainer.scrollTo({
        top: messageTop - containerHeight / 2,
        behavior: 'smooth'
      });
      
      // 하이라이트 효과
      messageEl.classList.add('search-highlight-message');
      setTimeout(() => {
        messageEl.classList.remove('search-highlight-message');
      }, 2000);
    } else {
      console.log('메시지 못 찾음, Canvas로 표시');
      // 못 찾으면 Canvas에 표시
      this.showMemoryInCanvas(messageData);
    }
  }

  /**
   * 검색 결과를 Canvas 패널에 탭으로 표시
   */
  showMemoryInCanvas(memory) {
    const soulApp = window.soulApp;
    if (!soulApp) {
      console.error('❌ window.soulApp 없음');
      return;
    }

    console.log('✅ 검색 결과 표시:', memory);
    console.log('📝 _rawMessages:', memory._rawMessages);
    console.log('📝 _rawMessages length:', memory._rawMessages?.length);
    console.log('📝 _rawMessages[0]:', JSON.stringify(memory._rawMessages?.[0], null, 2));
    console.log('📝 summary:', memory.summary);
    console.log('📝 topics:', memory.topics);
    console.log('📝 tags:', memory.tags);

    // 검색 탭 열기 (url=null → 일반 HTML 컨테이너)
    const existingContainer = document.getElementById('canvas-iframe-search');
    const isAlreadyOpen = !!existingContainer;
    console.log(`🔍 검색 탭 이미 열림: ${isAlreadyOpen}`);
    
    soulApp.openCanvasPanel('search', null, '검색');

    // DOM 업데이트 대기 후 컨테이너 찾기 (이미 열려있으면 짧게, 새로 열면 길게)
    setTimeout(() => {
      const container = document.getElementById('canvas-iframe-search');
      console.log('📦 컨테이너:', container);
      console.log('📦 display:', window.getComputedStyle(container).display);
      console.log('📦 height:', container?.offsetHeight);

      if (!container) {
        console.error('❌ 검색 탭 컨테이너 없음');
        return;
      }

      // 강제로 보이게
      container.style.display = 'block';
      container.style.zIndex = '999';
      console.log('🔧 display 강제 적용');

      // 모든 컨테이너 상태 확인
      console.log('🔍 모든 캔버스 컨테이너:');
      document.querySelectorAll('.canvas-iframe, .canvas-content-container').forEach(el => {
        console.log(`  ${el.id}: active=${el.classList.contains('active')}, display=${window.getComputedStyle(el).display}`);
      });

      const topics = memory.topics || [];
      const tags = memory.tags || [];

    // 컨텐츠 작성
    container.innerHTML = `
      <div class="memory-detail">
        <div class="memory-detail-meta">
          <span class="memory-detail-date">${this.formatDate(memory.date)}</span>
          ${tags.length > 0 ? `
            <div class="memory-detail-tags">
              ${tags.map(tag => `<span class="memory-tag">${tag}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        ${memory.category ? `
          <div style="margin-bottom: 12px;">
            <span style="font-size: 11px; color: rgba(255,255,255,0.5);">카테고리:</span>
            <span style="font-size: 13px; color: #a5b4fc;">${memory.category}</span>
          </div>
        ` : ''}
        ${topics.length > 0 ? `
          <div class="memory-detail-content">
            <h4 style="font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 8px;">주제</h4>
            <ul style="margin: 0; padding-left: 20px; color: #e8e8e8;">
              ${topics.map(topic => `<li style="margin-bottom: 4px;">${topic}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        ${memory.importance ? `
          <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
            <span style="font-size: 11px; color: rgba(255,255,255,0.5);">중요도:</span>
            <span style="font-size: 13px; color: #fcd34d;">${'★'.repeat(memory.importance)}${'☆'.repeat(5 - memory.importance)}</span>
          </div>
        ` : ''}
        ${memory._rawMessages ? `
          <div class="memory-conversation" style="margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1); position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <h4 style="font-size: 13px; color: rgba(255,255,255,0.6); margin: 0;">대화 내용</h4>
            </div>
            ${this.currentQuery ? `
              <div class="search-nav-buttons" style="position: sticky; top: 0; z-index: 100; background: var(--bg-primary); padding: 8px 12px; margin: -8px -12px 12px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; gap: 8px; align-items: center; justify-content: flex-end; backdrop-filter: blur(10px);">
                <span id="search-match-count" style="font-size: 11px; color: rgba(255,255,255,0.5);"></span>
                <button id="search-prev-btn" style="padding: 6px 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; cursor: pointer; font-size: 14px; transition: all 0.2s;">↑</button>
                <button id="search-next-btn" style="padding: 6px 10px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #fff; cursor: pointer; font-size: 14px; transition: all 0.2s;">↓</button>
              </div>
            ` : ''}
            ${(() => {
              const query = this.currentQuery;
              const highlightFn = this.highlightText.bind(this);
              return memory._rawMessages.map((msg, idx) => {
                const content = msg.content || msg.text || '';
                const hasKeyword = query && content.toLowerCase().includes(query.toLowerCase());
                const highlightedContent = hasKeyword ? highlightFn(content, query) : content;
                return `
                <div class="conversation-message" id="msg-${idx}" style="margin-bottom: 16px; padding: 12px; background: ${msg.role === 'user' ? 'rgba(100,100,255,0.1)' : 'rgba(150,200,255,0.1)'}; border-radius: 8px; border-left: 3px solid ${msg.role === 'user' ? '#6366f1' : '#60a5fa'};">
                  <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-bottom: 6px;">
                    ${msg.role === 'user' ? '👤 You' : '🤖 Soul'} · ${new Date(msg.timestamp).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'})}
                  </div>
                  <div style="font-size: 13px; line-height: 1.6; color: #e8e8e8; white-space: pre-wrap;">${highlightedContent}</div>
                </div>
              `;
              }).join('');
            })()}
          </div>
        ` : memory.summary ? `
          <div class="memory-summary" style="margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);">
            <h4 style="font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 12px;">내용</h4>
            <div style="font-size: 13px; line-height: 1.6; color: #e8e8e8; white-space: pre-wrap;">${memory.summary}</div>
          </div>
        ` : ''}
      </div>
    `;

      console.log('✅ 컨텐츠 렌더링 완료');
      console.log('🔍 currentQuery:', this.currentQuery);
      console.log('📊 HTML length:', container.innerHTML.length);
      console.log('⏱️ 탭 이미 열려있었음:', isAlreadyOpen);

      // 검색어가 포함된 메시지 인덱스 찾기
      if (this.currentQuery && memory._rawMessages) {
        const matchIndices = memory._rawMessages
          .map((msg, idx) => {
            const content = msg.content || msg.text || '';
            return content.toLowerCase().includes(this.currentQuery.toLowerCase()) ? idx : -1;
          })
          .filter(idx => idx !== -1);

        const state = { currentMatchIndex: 0 }; // 객체로 감싸서 참조 유지

        // 매칭 개수 표시
        const countEl = document.getElementById('search-match-count');
        if (countEl && matchIndices.length > 0) {
          countEl.textContent = `${state.currentMatchIndex + 1}/${matchIndices.length}`;
        }

        // 첫 번째 매칭으로 스크롤
        const scrollToMatch = (index) => {
          if (matchIndices.length === 0) {
            console.warn('⚠️ scrollToMatch: 매칭 없음');
            return;
          }
          
          // 현재 하이라이트 제거
          document.querySelectorAll('.conversation-message').forEach(el => {
            el.style.boxShadow = '';
          });

          const msgIdx = matchIndices[index];
          const targetMsg = document.getElementById(`msg-${msgIdx}`);
          console.log(`📍 스크롤 시도: msg-${msgIdx}, 찾음: ${!!targetMsg}`);
          
          if (targetMsg) {
            targetMsg.style.boxShadow = '0 0 0 2px #fbbf24, 0 0 20px rgba(251, 191, 36, 0.3)';
            targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            console.log(`✅ 스크롤 완료: ${index + 1}/${matchIndices.length}`);
            
            // 카운트 업데이트
            if (countEl) {
              countEl.textContent = `${index + 1}/${matchIndices.length}`;
            }
          } else {
            console.error(`❌ msg-${msgIdx} 요소를 찾을 수 없음`);
          }
        };

        // 네비게이션 버튼 이벤트
        setTimeout(() => {
          const prevBtn = document.getElementById('search-prev-btn');
          const nextBtn = document.getElementById('search-next-btn');

          if (prevBtn) {
            prevBtn.onmouseover = () => prevBtn.style.background = 'rgba(255,255,255,0.2)';
            prevBtn.onmouseout = () => prevBtn.style.background = 'rgba(255,255,255,0.1)';
            prevBtn.onclick = () => {
              state.currentMatchIndex = (state.currentMatchIndex - 1 + matchIndices.length) % matchIndices.length;
              scrollToMatch(state.currentMatchIndex);
            };
          }

          if (nextBtn) {
            nextBtn.onmouseover = () => nextBtn.style.background = 'rgba(255,255,255,0.2)';
            nextBtn.onmouseout = () => nextBtn.style.background = 'rgba(255,255,255,0.1)';
            nextBtn.onclick = () => {
              state.currentMatchIndex = (state.currentMatchIndex + 1) % matchIndices.length;
              scrollToMatch(state.currentMatchIndex);
            };
          }

          // 첫 매칭으로 이동 (탭이 이미 열려있으면 즉시, 새로 열면 길게 대기)
          if (matchIndices.length > 0) {
            console.log(`🎯 첫 매칭으로 이동 시도: ${matchIndices.length}개 매칭`);
            scrollToMatch(0);
          } else {
            console.warn('⚠️ 매칭된 메시지 없음');
          }
        }, isAlreadyOpen ? 100 : 400);
      }
    }, 100);
  }

  /**
   * 결과 드롭다운 표시
   */
  showResults() {
    if (this.resultsContainer) {
      this.resultsContainer.style.display = 'block';
    }
  }

  /**
   * 결과 드롭다운 숨기기
   */
  hideResults() {
    if (this.resultsContainer) {
      this.resultsContainer.style.display = 'none';
    }
  }
}
