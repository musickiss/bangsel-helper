/**
 * SOOP 게시판 Content Script
 * 글 작성 내용을 실시간으로 IndexedDB에 백업
 */

// 전역 DB 객체 사용 (lib/db.js에서 window.BangselDB로 노출됨)

class SoopAutoSaver {
  constructor() {
    this.currentDraftId = null;
    this.saveDebounceTimer = null;
    this.boardUrl = this.getCurrentBoardUrl();
    this.isInitialized = false;
    this.editorObserver = null;
  }

  /**
   * 현재 게시판 URL 정규화
   */
  getCurrentBoardUrl() {
    // URL에서 쿼리 파라미터 제거하고 기본 경로만 사용
    const url = new URL(window.location.href);
    return `${url.origin}${url.pathname}`;
  }

  /**
   * 초기화
   */
  async init() {
    if (this.isInitialized) return;

    console.log('[방셀 헬퍼] 초기화 중...');

    // DB 사용 가능 확인
    if (!window.BangselDB) {
      console.error('[방셀 헬퍼] DB 모듈이 로드되지 않았습니다.');
      return;
    }

    // 게시글 작성 페이지인지 확인
    if (!this.isWritePage()) {
      console.log('[방셀 헬퍼] 글 작성 페이지가 아닙니다.');
      return;
    }

    // 기존 초안 확인
    await this.checkExistingDraft();

    // 에디터 감지 및 이벤트 바인딩
    this.observeEditor();

    // 페이지 떠날 때 저장
    window.addEventListener('beforeunload', () => this.saveNow());

    // 확장프로그램과 통신 (사진 수신 알림 등)
    this.setupMessageListener();

    // UI 컨테이너 생성
    this.createUIContainer();

    this.isInitialized = true;
    console.log('[방셀 헬퍼] 초기화 완료');
  }

  /**
   * 글 작성 페이지 여부 확인
   */
  isWritePage() {
    const url = window.location.href;
    // SOOP 글쓰기 페이지 패턴
    return (
      url.includes('/board/write') ||
      url.includes('/post/write') ||
      url.includes('/board/modify') ||
      url.includes('/post/modify') ||
      // 에디터가 있는 페이지
      document.querySelector('[contenteditable="true"]') !== null ||
      document.querySelector('.fr-element') !== null ||
      document.querySelector('textarea') !== null
    );
  }

  /**
   * 기존 초안 확인
   */
  async checkExistingDraft() {
    try {
      const existingDraft = await window.BangselDB.getDraftByUrl(this.boardUrl);

      if (existingDraft) {
        this.currentDraftId = existingDraft.id;
        this.showRecoveryPrompt(existingDraft);
      }
    } catch (error) {
      console.error('[방셀 헬퍼] 초안 확인 실패:', error);
    }
  }

  /**
   * 복구 프롬프트 표시
   */
  async showRecoveryPrompt(draft) {
    const photos = await window.BangselDB.getPhotosByDraftId(draft.id);

    const modal = document.createElement('div');
    modal.className = 'bangsel-helper-modal';
    modal.innerHTML = `
      <div class="bangsel-modal-backdrop"></div>
      <div class="bangsel-modal-content">
        <div class="bangsel-modal-header">
          <span class="bangsel-modal-icon">📋</span>
          <h3>저장된 방셀 초안이 있습니다</h3>
        </div>
        <div class="bangsel-modal-body">
          <p class="bangsel-modal-meta">마지막 저장: ${this.formatDate(draft.updatedAt)}</p>
          <p class="bangsel-modal-meta">사진 ${photos.length}장</p>
          ${draft.content ? `<div class="bangsel-modal-preview">${this.escapeHtml(this.stripHtml(draft.content).substring(0, 100))}...</div>` : ''}
        </div>
        <div class="bangsel-modal-buttons">
          <button id="bangsel-recover" class="bangsel-btn bangsel-btn-primary">이어서 작성하기</button>
          <button id="bangsel-discard" class="bangsel-btn bangsel-btn-secondary">새로 시작</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 버튼 이벤트
    document.getElementById('bangsel-recover').onclick = async () => {
      await this.recoverDraft(draft);
      modal.remove();
    };

    document.getElementById('bangsel-discard').onclick = async () => {
      await window.BangselDB.deleteDraft(draft.id);
      this.currentDraftId = null;
      modal.remove();
      this.showSaveIndicator('새로 시작합니다');
    };

    // 배경 클릭으로 닫기
    modal.querySelector('.bangsel-modal-backdrop').onclick = () => {
      modal.remove();
    };
  }

  /**
   * 초안 복구
   */
  async recoverDraft(draft) {
    try {
      // SOOP 에디터에 내용 복원
      const editor = this.findEditor();
      if (editor && draft.content) {
        if (editor.tagName === 'TEXTAREA') {
          editor.value = draft.content;
        } else {
          editor.innerHTML = draft.content;
        }

        // input 이벤트 발생시켜 SOOP 에디터가 인식하도록
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // 제목 복원
      const titleInput = document.querySelector('input[name="title"], input[type="text"][placeholder*="제목"]');
      if (titleInput && draft.title) {
        titleInput.value = draft.title;
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // 저장된 사진 미리보기 표시
      const photos = await window.BangselDB.getPhotosByDraftId(draft.id);
      this.displayRecoveredPhotos(photos);

      this.showSaveIndicator('초안을 복구했습니다');
    } catch (error) {
      console.error('[방셀 헬퍼] 초안 복구 실패:', error);
    }
  }

  /**
   * 복구된 사진 표시
   */
  displayRecoveredPhotos(photos) {
    if (!photos || photos.length === 0) return;

    let container = document.getElementById('bangsel-photos');
    if (!container) {
      container = this.createPhotosContainer();
    }

    photos.forEach(photo => {
      this.addPhotoToContainer(photo, container);
    });
  }

  /**
   * 에디터 감지 Observer
   */
  observeEditor() {
    // 이미 에디터가 있는지 확인
    const existingEditor = this.findEditor();
    if (existingEditor) {
      this.bindEditorEvents(existingEditor);
    }

    // DOM 변화 감시
    this.editorObserver = new MutationObserver(() => {
      const editor = this.findEditor();
      if (editor && !editor.dataset.bangselBound) {
        editor.dataset.bangselBound = 'true';
        this.bindEditorEvents(editor);
      }
    });

    this.editorObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * 에디터 요소 찾기
   */
  findEditor() {
    // SOOP에서 사용할 수 있는 에디터 선택자들
    const selectors = [
      '.fr-element.fr-view',           // Froala Editor
      '[contenteditable="true"]',       // 일반 contenteditable
      'textarea.write-content',         // textarea
      'textarea[name="content"]',       // textarea
      '.note-editable',                 // Summernote
      '.ql-editor',                     // Quill
      '#tinymce',                       // TinyMCE
      'iframe.wysiwyg'                  // iframe 에디터
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return null;
  }

  /**
   * 에디터 이벤트 바인딩
   */
  bindEditorEvents(editor) {
    console.log('[방셀 헬퍼] 에디터 이벤트 바인딩');

    editor.addEventListener('input', () => {
      this.debouncedSave();
    });

    editor.addEventListener('paste', () => {
      setTimeout(() => this.debouncedSave(), 100);
    });

    editor.addEventListener('keyup', () => {
      this.debouncedSave();
    });

    // 제목 입력 필드도 감시
    const titleInput = document.querySelector('input[name="title"], input[type="text"][placeholder*="제목"]');
    if (titleInput) {
      titleInput.addEventListener('input', () => {
        this.debouncedSave();
      });
    }
  }

  /**
   * 디바운스된 저장
   */
  debouncedSave() {
    clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => this.saveNow(), 500);
  }

  /**
   * 즉시 저장
   */
  async saveNow() {
    const editor = this.findEditor();
    if (!editor) return;

    const content = editor.tagName === 'TEXTAREA' ? editor.value : editor.innerHTML;
    const titleInput = document.querySelector('input[name="title"], input[type="text"][placeholder*="제목"]');
    const title = titleInput?.value || '';

    // 내용이 비어있으면 저장하지 않음
    if (!content && !title) return;

    try {
      if (!this.currentDraftId) {
        // 새 초안 생성
        this.currentDraftId = await window.BangselDB.saveDraft({
          boardUrl: this.boardUrl,
          title,
          content,
          photoIds: [],
          status: 'draft'
        });
      } else {
        // 기존 초안 업데이트
        await window.BangselDB.saveDraft({
          id: this.currentDraftId,
          boardUrl: this.boardUrl,
          title,
          content,
          status: 'draft'
        });
      }

      this.showSaveIndicator();
    } catch (error) {
      console.error('[방셀 헬퍼] 저장 실패:', error);
    }
  }

  /**
   * 저장 인디케이터 표시
   */
  showSaveIndicator(message = '자동 저장됨') {
    let indicator = document.getElementById('bangsel-save-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'bangsel-save-indicator';
      indicator.className = 'bangsel-save-indicator';
      document.body.appendChild(indicator);
    }

    indicator.textContent = `✓ ${message}`;
    indicator.classList.add('show');

    setTimeout(() => {
      indicator.classList.remove('show');
    }, 2000);
  }

  /**
   * 확장프로그램 메시지 리스너
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PHOTO_RECEIVED') {
        this.handleReceivedPhoto(message.photo)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ error: error.message }));
        return true; // 비동기 응답
      }
    });
  }

  /**
   * 수신된 사진 처리
   */
  async handleReceivedPhoto(photoData) {
    console.log('[방셀 헬퍼] 사진 수신:', photoData.name);

    // 초안이 없으면 생성
    if (!this.currentDraftId) {
      this.currentDraftId = await window.BangselDB.saveDraft({
        boardUrl: this.boardUrl,
        title: '',
        content: '',
        photoIds: [],
        status: 'draft'
      });
    }

    // Base64를 Blob으로 변환
    const blob = window.BangselDB.base64ToBlob(photoData.data);

    // 썸네일 생성
    const thumbnail = await window.BangselDB.createThumbnail(blob);

    // 사진 저장
    const photoId = await window.BangselDB.savePhoto(this.currentDraftId, {
      name: photoData.name,
      type: photoData.type,
      size: photoData.size,
      data: blob,
      thumbnail
    });

    // UI에 사진 표시
    this.displayReceivedPhoto({
      id: photoId,
      name: photoData.name,
      data: blob
    });

    this.showSaveIndicator('사진 저장됨');
  }

  /**
   * UI 컨테이너 생성
   */
  createUIContainer() {
    // 이미 존재하면 스킵
    if (document.getElementById('bangsel-ui-container')) return;

    const container = document.createElement('div');
    container.id = 'bangsel-ui-container';
    container.className = 'bangsel-ui-container';

    // 에디터 영역 찾기
    const editor = this.findEditor();
    if (editor) {
      editor.parentElement?.insertBefore(container, editor);
    } else {
      // 폼 상단에 추가
      const form = document.querySelector('form');
      if (form) {
        form.insertBefore(container, form.firstChild);
      }
    }
  }

  /**
   * 사진 컨테이너 생성
   */
  createPhotosContainer() {
    let container = document.getElementById('bangsel-photos');
    if (container) return container;

    container = document.createElement('div');
    container.id = 'bangsel-photos';
    container.className = 'bangsel-photos-container';
    container.innerHTML = `
      <div class="bangsel-photos-header">
        <span>📷 수신된 사진</span>
        <button id="bangsel-clear-photos" class="bangsel-btn-small">모두 삭제</button>
      </div>
      <div class="bangsel-photos-grid" id="bangsel-photos-grid"></div>
    `;

    // 삭제 버튼 이벤트
    container.querySelector('#bangsel-clear-photos').onclick = () => {
      this.clearAllPhotos();
    };

    // UI 컨테이너에 추가
    const uiContainer = document.getElementById('bangsel-ui-container');
    if (uiContainer) {
      uiContainer.appendChild(container);
    } else {
      const editor = this.findEditor();
      editor?.parentElement?.insertBefore(container, editor);
    }

    return container;
  }

  /**
   * 사진을 컨테이너에 추가
   */
  addPhotoToContainer(photo, container) {
    const grid = container.querySelector('#bangsel-photos-grid') || container;

    const photoEl = document.createElement('div');
    photoEl.className = 'bangsel-photo-item';
    photoEl.dataset.photoId = photo.id;

    const imgUrl = URL.createObjectURL(photo.thumbnail || photo.data);

    photoEl.innerHTML = `
      <img src="${imgUrl}" alt="${this.escapeHtml(photo.name)}">
      <div class="bangsel-photo-overlay">
        <button class="bangsel-photo-insert" title="에디터에 삽입">➕</button>
        <button class="bangsel-photo-delete" title="삭제">🗑️</button>
      </div>
    `;

    // 삽입 버튼
    photoEl.querySelector('.bangsel-photo-insert').onclick = () => {
      this.insertPhotoToEditor(photo);
    };

    // 삭제 버튼
    photoEl.querySelector('.bangsel-photo-delete').onclick = async () => {
      await window.BangselDB.deletePhoto(photo.id);
      photoEl.remove();
      URL.revokeObjectURL(imgUrl);
    };

    grid.appendChild(photoEl);
  }

  /**
   * 수신된 사진 표시
   */
  displayReceivedPhoto(photo) {
    let container = document.getElementById('bangsel-photos');
    if (!container) {
      container = this.createPhotosContainer();
    }

    this.addPhotoToContainer(photo, container);
  }

  /**
   * 에디터에 사진 삽입
   */
  async insertPhotoToEditor(photo) {
    const editor = this.findEditor();
    if (!editor) {
      alert('에디터를 찾을 수 없습니다.');
      return;
    }

    // Blob URL 생성
    const blobUrl = URL.createObjectURL(photo.data);

    if (editor.tagName === 'TEXTAREA') {
      // textarea의 경우 이미지 삽입 불가 알림
      alert('이 에디터는 이미지 직접 삽입을 지원하지 않습니다.\n이미지를 수동으로 첨부해주세요.');
    } else {
      // contenteditable의 경우
      const img = document.createElement('img');
      img.src = blobUrl;
      img.alt = photo.name;
      img.style.maxWidth = '100%';

      // 커서 위치에 삽입
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.insertNode(img);
        range.collapse(false);
      } else {
        editor.appendChild(img);
      }

      // 변경 이벤트 발생
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    this.showSaveIndicator('이미지 삽입됨');
  }

  /**
   * 모든 사진 삭제
   */
  async clearAllPhotos() {
    if (!this.currentDraftId) return;

    if (!confirm('모든 사진을 삭제하시겠습니까?')) return;

    const photos = await window.BangselDB.getPhotosByDraftId(this.currentDraftId);
    for (const photo of photos) {
      await window.BangselDB.deletePhoto(photo.id);
    }

    const grid = document.getElementById('bangsel-photos-grid');
    if (grid) {
      grid.innerHTML = '';
    }

    this.showSaveIndicator('모든 사진 삭제됨');
  }

  /**
   * 유틸리티: 날짜 포맷
   */
  formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 유틸리티: HTML 이스케이프 (XSS 방지)
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 유틸리티: HTML 태그 제거
   */
  stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  /**
   * 정리
   */
  destroy() {
    if (this.editorObserver) {
      this.editorObserver.disconnect();
    }
    clearTimeout(this.saveDebounceTimer);
  }
}

// 페이지 로드 시 초기화
const autoSaver = new SoopAutoSaver();

// DOM 로드 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => autoSaver.init());
} else {
  autoSaver.init();
}

// 페이지 언로드 시 정리
window.addEventListener('unload', () => autoSaver.destroy());
