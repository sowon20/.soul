/**
 * Panel Manager
 * 오른쪽 패널 관리
 */

import { ProfileManager } from '../../utils/profile-manager.js';

export class PanelManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this.currentPanel = null;
    this.panelTitle = document.getElementById('panelTitle');
    this.panelContent = document.getElementById('panelContent');

    // Panel configuration
    this.panels = {
      search: {
        title: '통합 검색',
        render: () => this.renderSearchPanel(),
      },
      files: {
        title: '파일 매니저',
        render: () => this.renderFilesPanel(),
      },
      memory: {
        title: '메모리 탐색',
        render: () => this.renderMemoryPanel(),
      },
      mcp: {
        title: 'MCP 관리',
        render: () => this.renderMCPPanel(),
      },
      archive: {
        title: '대화 아카이브',
        render: () => this.renderArchivePanel(),
      },
      notifications: {
        title: '알림',
        render: () => this.renderNotificationsPanel(),
      },
      settings: {
        title: '설정',
        render: () => this.renderSettingsPanel(),
      },
      context: {
        title: '컨텍스트',
        render: () => this.renderContextPanel(),
      },
      todo: {
        title: 'TODO',
        render: () => this.renderTodoPanel(),
      },
      terminal: {
        title: '터미널',
        render: () => this.renderTerminalPanel(),
      },
      profile: {
        title: '프로필',
        render: () => this.renderProfilePanel(),
      },
    };
  }

  /**
   * 패널 열기
   * @param {string} panelType
   */
  async openPanel(panelType) {
    const panel = this.panels[panelType];
    if (!panel) {
      console.warn(`알 수 없는 패널: ${panelType}`);
      return;
    }

    this.currentPanel = panelType;
    this.panelTitle.textContent = panel.title;
    this.panelContent.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';

    try {
      // Render panel content
      await panel.render();

      // Call backend API (ignore errors - frontend works independently)
      try {
        await this.apiClient.openPanel(panelType);
      } catch (apiError) {
        console.warn(`백엔드 패널 API 실패 (무시):`, apiError.message);
      }
    } catch (error) {
      console.error(`패널 렌더링 실패 [${panelType}]:`, error);
      this.panelContent.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--destructive);">
          <p>패널을 로드하는 중 오류가 발생했습니다.</p>
          <p style="font-size: var(--font-size-sm); margin-top: 0.5rem;">${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * 패널 닫기
   */
  async closePanel() {
    if (this.currentPanel) {
      try {
        await this.apiClient.closePanel(this.currentPanel);
      } catch (apiError) {
        console.warn(`백엔드 패널 닫기 API 실패 (무시):`, apiError.message);
      }
      this.currentPanel = null;
    }
    this.panelContent.innerHTML = '';
  }

  /* ===================================
     Panel Renderers
     =================================== */

  async renderSearchPanel() {
    this.panelContent.innerHTML = `
      <div class="search-panel">
        <input
          type="text"
          id="searchInput"
          placeholder="검색어를 입력하세요..."
          style="width: 100%; padding: 0.75rem; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; background: rgba(255, 255, 255, 0.08); color: #ffffff; font-size: 0.9375rem; margin-bottom: 1rem;"
        >
        <div id="searchResults" style="margin-top: 1rem;">
          <p style="opacity: 0.7; text-align: center;">
            검색어를 입력하세요
          </p>
        </div>
      </div>
    `;

    // Add search functionality
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');

    searchInput.addEventListener('input', async (e) => {
      const query = e.target.value.trim();
      if (!query) {
        searchResults.innerHTML = '<p style="opacity: 0.7; text-align: center;">검색어를 입력하세요</p>';
        return;
      }

      searchResults.innerHTML = '<div class="spinner"></div>';

      try {
        const results = await this.apiClient.smartSearch(query);
        if (results.length === 0) {
          searchResults.innerHTML = '<p style="opacity: 0.7;">검색 결과가 없습니다.</p>';
        } else {
          searchResults.innerHTML = results
            .map(
              (r) => `
            <div style="padding: 1rem; background: rgba(255, 255, 255, 0.08); border-radius: 8px; margin-bottom: 0.75rem;">
              <h4 style="margin-bottom: 0.5rem; color: #ffffff;">${r.title || r.id}</h4>
              <p style="font-size: 0.875rem; opacity: 0.8;">
                ${r.summary || ''}
              </p>
            </div>
          `
            )
            .join('');
        }
      } catch (error) {
        searchResults.innerHTML = `<p style="color: #ff6b6b;">검색 실패: ${error.message}</p>`;
      }
    });
  }

  async renderFilesPanel() {
    this.panelContent.innerHTML = `
      <div class="files-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          파일 매니저 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderMemoryPanel() {
    this.panelContent.innerHTML = `
      <div class="memory-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          메모리 탐색 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderMCPPanel() {
    this.panelContent.innerHTML = `
      <div class="mcp-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          MCP 관리 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderArchivePanel() {
    this.panelContent.innerHTML = `
      <div class="archive-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          대화 아카이브 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderNotificationsPanel() {
    try {
      const notifications = await this.apiClient.getNotifications();

      if (notifications.length === 0) {
        this.panelContent.innerHTML = `
          <p style="opacity: 0.7; text-align: center; padding: 2rem;">
            알림이 없습니다.
          </p>
        `;
        return;
      }

      this.panelContent.innerHTML = notifications
        .map(
          (n) => `
        <div style="padding: 1rem; background: ${n.read ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.1)'}; border-radius: 8px; margin-bottom: 0.75rem; border-left: 3px solid rgba(255, 255, 255, 0.4);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <strong style="color: #ffffff;">${n.title}</strong>
            <span style="font-size: 0.75rem; opacity: 0.7;">
              ${new Date(n.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p style="font-size: 0.875rem; opacity: 0.9;">
            ${n.message}
          </p>
        </div>
      `
        )
        .join('');
    } catch (error) {
      this.panelContent.innerHTML = `
        <p style="color: #ff6b6b; text-align: center; padding: 2rem;">
          알림을 불러오는데 실패했습니다.
        </p>
      `;
    }
  }

  async renderSettingsPanel() {
    // 설정은 왼쪽 메뉴에서 관리합니다 - 이 공간은 Canvas Workspace로 사용
    this.panelContent.innerHTML = `
      <div class="canvas-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 3rem; text-align: center;">
        <div style="font-size: 4rem; margin-bottom: 1.5rem; opacity: 0.3;">⚙️</div>
        <h3 style="font-size: 1.25rem; font-weight: 500; margin-bottom: 1rem; opacity: 0.8;">
          설정은 왼쪽 메뉴에서
        </h3>
        <p style="font-size: 0.9375rem; opacity: 0.6; line-height: 1.6; max-width: 400px;">
          모든 설정 옵션은 왼쪽 메뉴의 설정 패널에서 관리할 수 있습니다.<br>
          이 공간은 향후 멀티 패널 작업 공간으로 사용될 예정입니다.
        </p>
        <button
          onclick="window.soulApp.menuManager.open(); window.soulApp.menuManager.switchMenu('settings');"
          style="margin-top: 2rem; padding: 0.875rem 1.5rem; background: rgba(96, 165, 250, 0.2); border: 1px solid rgba(96, 165, 250, 0.4); border-radius: 10px; cursor: pointer; color: #ffffff; font-size: 0.9375rem; font-weight: 500; transition: all 0.2s;"
          onmouseover="this.style.background='rgba(96, 165, 250, 0.3)'"
          onmouseout="this.style.background='rgba(96, 165, 250, 0.2)'"
        >
          설정 열기
        </button>
      </div>
    `;
  }

  async renderContextPanel() {
    try {
      const stats = await this.apiClient.getTokenStatus();

      this.panelContent.innerHTML = `
        <div class="context-panel">
          <div style="margin-bottom: 1.5rem;">
            <h4 style="margin-bottom: 0.5rem; color: #ffffff;">토큰 사용량</h4>
            <div style="background: rgba(255, 255, 255, 0.1); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: rgba(255, 255, 255, 0.4); height: 100%; width: ${stats.percentage || 0}%;"></div>
            </div>
            <p style="font-size: 0.875rem; opacity: 0.8; margin-top: 0.5rem;">
              ${stats.used || 0} / ${stats.total || 0} 토큰 (${stats.percentage || 0}%)
            </p>
          </div>

          <p style="opacity: 0.7; text-align: center;">
            컨텍스트 관리 기능 (구현 예정)
          </p>
        </div>
      `;
    } catch (error) {
      this.panelContent.innerHTML = `
        <p style="color: #ff6b6b; text-align: center; padding: 2rem;">
          컨텍스트 정보를 불러오는데 실패했습니다.
        </p>
      `;
    }
  }

  async renderTodoPanel() {
    try {
      // 할일 목록 가져오기
      const response = await this.apiClient.fetch('/api/tools/builtin/manage_todo', {
        method: 'POST',
        body: JSON.stringify({ action: 'list' })
      });

      const todos = response.todos || [];

      this.panelContent.innerHTML = `
        <div class="todo-panel">
          <div class="todo-header">
            <button class="todo-add-btn" id="addTodoBtn">
              <span>➕</span> 새 할일
            </button>
            <div class="todo-filters">
              <button class="todo-filter-btn active" data-filter="all">전체</button>
              <button class="todo-filter-btn" data-filter="pending">대기</button>
              <button class="todo-filter-btn" data-filter="in_progress">진행중</button>
              <button class="todo-filter-btn" data-filter="completed">완료</button>
            </div>
          </div>

          <div class="todo-list" id="todoList">
            ${todos.length === 0 ? `
              <div class="todo-empty">
                <p>할일이 없습니다</p>
                <p style="font-size: 0.85rem; opacity: 0.7; margin-top: 0.5rem;">
                  새 할일 버튼을 눌러 추가하세요
                </p>
              </div>
            ` : todos.map(todo => this._renderTodoItem(todo)).join('')}
          </div>
        </div>
      `;

      // 이벤트 리스너
      document.getElementById('addTodoBtn')?.addEventListener('click', () => this._showTodoDialog());

      // 필터 버튼
      document.querySelectorAll('.todo-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          document.querySelectorAll('.todo-filter-btn').forEach(b => b.classList.remove('active'));
          e.target.classList.add('active');
          this._filterTodos(e.target.dataset.filter);
        });
      });

      // 할일 아이템 이벤트
      this._attachTodoItemEvents();

    } catch (error) {
      console.error('Todo 패널 렌더링 실패:', error);
      this.panelContent.innerHTML = `
        <div class="todo-panel">
          <p style="color: var(--destructive); text-align: center; padding: 2rem;">
            할일 목록을 불러오는데 실패했습니다
          </p>
        </div>
      `;
    }
  }

  _renderTodoItem(todo) {
    const priorityColors = {
      low: '#4ade80',
      medium: '#fbbf24',
      high: '#f87171'
    };

    const statusIcons = {
      pending: '⏸️',
      in_progress: '▶️',
      completed: '✅'
    };

    return `
      <div class="todo-item" data-todo-id="${todo.todoId}" data-status="${todo.status}">
        <div class="todo-item-header">
          <div class="todo-item-left">
            <span class="todo-status-icon">${statusIcons[todo.status] || '⏸️'}</span>
            <h4 class="todo-title">${this._escapeHtml(todo.title)}</h4>
            <span class="todo-priority" style="background: ${priorityColors[todo.priority || 'medium']};">
              ${todo.priority || 'medium'}
            </span>
          </div>
          <div class="todo-item-actions">
            <button class="todo-action-btn" data-action="edit" title="수정">✏️</button>
            <button class="todo-action-btn" data-action="delete" title="삭제">🗑️</button>
          </div>
        </div>

        ${todo.description ? `
          <p class="todo-description">${this._escapeHtml(todo.description)}</p>
        ` : ''}

        <div class="todo-item-footer">
          ${todo.dueDate ? `
            <span class="todo-due-date">📅 ${new Date(todo.dueDate).toLocaleDateString('ko-KR')}</span>
          ` : ''}
          ${todo.tags ? `
            <div class="todo-tags">
              ${JSON.parse(todo.tags).map(tag => `<span class="todo-tag">#${tag}</span>`).join('')}
            </div>
          ` : ''}
          <select class="todo-status-select" data-todo-id="${todo.todoId}">
            <option value="pending" ${todo.status === 'pending' ? 'selected' : ''}>대기</option>
            <option value="in_progress" ${todo.status === 'in_progress' ? 'selected' : ''}>진행중</option>
            <option value="completed" ${todo.status === 'completed' ? 'selected' : ''}>완료</option>
          </select>
        </div>
      </div>
    `;
  }

  _attachTodoItemEvents() {
    // 상태 변경
    document.querySelectorAll('.todo-status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const todoId = e.target.dataset.todoId;
        const newStatus = e.target.value;
        await this._updateTodoStatus(todoId, newStatus);
      });
    });

    // 수정/삭제 버튼
    document.querySelectorAll('.todo-action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const action = e.currentTarget.dataset.action;
        const todoItem = e.currentTarget.closest('.todo-item');
        const todoId = todoItem.dataset.todoId;

        if (action === 'edit') {
          await this._editTodo(todoId);
        } else if (action === 'delete') {
          if (confirm('정말 삭제하시겠습니까?')) {
            await this._deleteTodo(todoId);
          }
        }
      });
    });
  }

  async _updateTodoStatus(todoId, status) {
    try {
      await this.apiClient.fetch('/api/tools/builtin/manage_todo', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update',
          todo_id: todoId,
          status
        })
      });

      // 목록 새로고침
      await this.renderTodoPanel();
    } catch (error) {
      console.error('Todo 상태 업데이트 실패:', error);
      alert('상태 변경에 실패했습니다');
    }
  }

  async _deleteTodo(todoId) {
    try {
      await this.apiClient.fetch('/api/tools/builtin/manage_todo', {
        method: 'POST',
        body: JSON.stringify({
          action: 'delete',
          todo_id: todoId
        })
      });

      // 목록 새로고침
      await this.renderTodoPanel();
    } catch (error) {
      console.error('Todo 삭제 실패:', error);
      alert('삭제에 실패했습니다');
    }
  }

  async _editTodo(todoId) {
    // 기존 데이터 가져오기
    try {
      const response = await this.apiClient.fetch('/api/tools/builtin/manage_todo', {
        method: 'POST',
        body: JSON.stringify({
          action: 'list'
        })
      });

      const todo = response.todos.find(t => t.todoId === todoId);
      if (todo) {
        this._showTodoDialog(todo);
      }
    } catch (error) {
      console.error('Todo 조회 실패:', error);
    }
  }

  _showTodoDialog(existingTodo = null) {
    const isEdit = !!existingTodo;

    const dialog = document.createElement('div');
    dialog.className = 'todo-dialog-overlay';
    dialog.innerHTML = `
      <div class="todo-dialog">
        <h3>${isEdit ? '할일 수정' : '새 할일'}</h3>
        <form id="todoForm">
          <div class="form-group">
            <label>제목</label>
            <input type="text" name="title" required value="${existingTodo ? this._escapeHtml(existingTodo.title) : ''}">
          </div>

          <div class="form-group">
            <label>설명</label>
            <textarea name="description" rows="3">${existingTodo ? this._escapeHtml(existingTodo.description || '') : ''}</textarea>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>우선순위</label>
              <select name="priority">
                <option value="low" ${existingTodo?.priority === 'low' ? 'selected' : ''}>낮음</option>
                <option value="medium" ${!existingTodo || existingTodo?.priority === 'medium' ? 'selected' : ''}>보통</option>
                <option value="high" ${existingTodo?.priority === 'high' ? 'selected' : ''}>높음</option>
              </select>
            </div>

            <div class="form-group">
              <label>마감일</label>
              <input type="date" name="due_date" value="${existingTodo?.dueDate ? existingTodo.dueDate.split('T')[0] : ''}">
            </div>
          </div>

          <div class="form-group">
            <label>태그 (쉼표로 구분)</label>
            <input type="text" name="tags" placeholder="work, urgent"
              value="${existingTodo?.tags ? JSON.parse(existingTodo.tags).join(', ') : ''}">
          </div>

          <div class="form-actions">
            <button type="button" class="btn-cancel">취소</button>
            <button type="submit" class="btn-submit">${isEdit ? '수정' : '추가'}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(dialog);

    // 이벤트
    dialog.querySelector('.btn-cancel').addEventListener('click', () => {
      document.body.removeChild(dialog);
    });

    dialog.querySelector('#todoForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);

      const data = {
        action: isEdit ? 'update' : 'add',
        title: formData.get('title'),
        description: formData.get('description'),
        priority: formData.get('priority'),
        due_date: formData.get('due_date') || null,
        tags: formData.get('tags') ? formData.get('tags').split(',').map(t => t.trim()).filter(Boolean) : []
      };

      if (isEdit) {
        data.todo_id = existingTodo.todoId;
      }

      try {
        await this.apiClient.fetch('/api/tools/builtin/manage_todo', {
          method: 'POST',
          body: JSON.stringify(data)
        });

        document.body.removeChild(dialog);
        await this.renderTodoPanel();
      } catch (error) {
        console.error('Todo 저장 실패:', error);
        alert('저장에 실패했습니다');
      }
    });

    // 배경 클릭 시 닫기
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
      }
    });
  }

  _filterTodos(filter) {
    const items = document.querySelectorAll('.todo-item');
    items.forEach(item => {
      if (filter === 'all' || item.dataset.status === filter) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }


  async renderTerminalPanel() {
    this.panelContent.innerHTML = `
      <div class="terminal-panel">
        <p style="opacity: 0.7; text-align: center; padding: 2rem;">
          터미널 (구현 예정)
        </p>
      </div>
    `;
  }

  async renderProfilePanel() {
    const profileManager = new ProfileManager(this.apiClient);
    await profileManager.renderProfilePanel(this.panelContent);
  }
}
