/**
 * 팝업 UI 로직
 * QR 코드 생성, 연결 상태 관리, 초안 목록 표시
 */

import { PhotoReceiver } from '../lib/webrtc-receiver.js';
import db from '../lib/db.js';
import { generateRoomId, generateQRCodeUrl } from '../lib/utils.js';

class PopupApp {
  constructor() {
    this.receiver = null;
    this.roomId = null;
    this.receivedPhotos = [];

    // DOM 요소
    this.elements = {
      waitingSection: document.getElementById('waiting-section'),
      connectedSection: document.getElementById('connected-section'),
      draftsSection: document.getElementById('drafts-section'),
      qrcodeContainer: document.getElementById('qrcode'),
      roomCodeSpan: document.getElementById('room-code'),
      newCodeBtn: document.getElementById('new-code-btn'),
      disconnectBtn: document.getElementById('disconnect-btn'),
      photosGrid: document.getElementById('photos-grid'),
      photoCount: document.getElementById('photo-count'),
      draftsList: document.getElementById('drafts-list'),
      settingsLink: document.getElementById('settings-link'),
      helpLink: document.getElementById('help-link')
    };
  }

  async init() {
    this.bindEvents();
    await this.loadDrafts();
    await this.createNewSession();
  }

  bindEvents() {
    this.elements.newCodeBtn.addEventListener('click', () => this.createNewSession());
    this.elements.disconnectBtn.addEventListener('click', () => this.disconnect());
    this.elements.settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      // 설정 페이지 열기 (추후 구현)
      console.log('Settings clicked');
    });
    this.elements.helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      // 도움말 페이지 열기 (추후 구현)
      console.log('Help clicked');
    });
  }

  async createNewSession() {
    // 기존 연결 정리
    if (this.receiver) {
      this.receiver.disconnect();
    }

    // 새 Room ID 생성
    this.roomId = generateRoomId();
    this.elements.roomCodeSpan.textContent = this.roomId;

    // QR 코드 생성
    this.generateQRCode();

    // WebRTC 수신자 초기화
    await this.initReceiver();

    // 연결 대기 상태 표시
    this.showWaitingSection();
  }

  generateQRCode() {
    // QR 코드 컨테이너 초기화
    this.elements.qrcodeContainer.innerHTML = '';

    const qrCodeUrl = generateQRCodeUrl(this.roomId);

    // QRCode 라이브러리 사용 (lib-vendor/qrcode.min.js)
    if (typeof QRCode !== 'undefined') {
      new QRCode(this.elements.qrcodeContainer, {
        text: qrCodeUrl,
        width: 150,
        height: 150,
        colorDark: '#1f2937',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      // QRCode 라이브러리 미로드 시 대체 표시
      this.elements.qrcodeContainer.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #6b7280;">
          <p>QR 코드를 생성할 수 없습니다.</p>
          <p>코드를 직접 입력하세요: ${this.roomId}</p>
        </div>
      `;
    }
  }

  async initReceiver() {
    try {
      this.receiver = new PhotoReceiver(
        this.roomId,
        (photo) => this.onPhotoReceived(photo),
        (status) => this.onStatusChange(status)
      );
      await this.receiver.initialize();
    } catch (error) {
      console.error('WebRTC 초기화 실패:', error);
    }
  }

  onPhotoReceived(photo) {
    this.receivedPhotos.push(photo);
    this.updatePhotoGrid();

    // content script에 사진 수신 알림
    this.notifyContentScript(photo);
  }

  onStatusChange(status) {
    console.log('Connection status:', status);

    if (status === 'connected') {
      this.showConnectedSection();
    } else if (status === 'disconnected' || status === 'failed') {
      this.showWaitingSection();
    }
  }

  updatePhotoGrid() {
    const grid = this.elements.photosGrid;
    grid.innerHTML = '';

    this.receivedPhotos.slice(-9).forEach((photo, index) => {
      const photoEl = document.createElement('div');
      photoEl.className = 'photo-item';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(photo.data);
      img.alt = photo.name;

      photoEl.appendChild(img);
      grid.appendChild(photoEl);
    });

    this.elements.photoCount.textContent = `수신된 사진: ${this.receivedPhotos.length}장`;
  }

  async notifyContentScript(photo) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && (tab.url.includes('sooplive.co.kr'))) {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'PHOTO_RECEIVED',
          photo: {
            name: photo.name,
            type: photo.type,
            size: photo.size,
            // Blob은 직렬화할 수 없으므로 base64로 변환
            data: await this.blobToBase64(photo.data)
          }
        });
      }
    } catch (error) {
      console.error('Content script 알림 실패:', error);
    }
  }

  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async loadDrafts() {
    try {
      const drafts = await db.drafts
        .where('status')
        .equals('draft')
        .reverse()
        .sortBy('updatedAt');

      this.renderDraftsList(drafts);
    } catch (error) {
      console.error('초안 목록 로드 실패:', error);
    }
  }

  renderDraftsList(drafts) {
    const list = this.elements.draftsList;

    if (!drafts || drafts.length === 0) {
      list.innerHTML = '<p class="empty-message">저장된 초안이 없습니다</p>';
      return;
    }

    list.innerHTML = '';

    drafts.forEach(draft => {
      const item = document.createElement('div');
      item.className = 'draft-item';
      item.innerHTML = `
        <div class="draft-info">
          <div class="draft-title">${this.escapeHtml(draft.title) || '제목 없음'}</div>
          <div class="draft-meta">${this.formatDate(draft.updatedAt)} · 사진 ${draft.photoIds?.length || 0}장</div>
        </div>
        <button class="draft-delete" data-id="${draft.id}" title="삭제">×</button>
      `;

      // 초안 클릭 시 해당 페이지로 이동
      item.querySelector('.draft-info').addEventListener('click', () => {
        chrome.tabs.create({ url: draft.boardUrl });
      });

      // 삭제 버튼
      item.querySelector('.draft-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.deleteDraft(draft.id);
      });

      list.appendChild(item);
    });
  }

  async deleteDraft(draftId) {
    try {
      // 연결된 사진도 함께 삭제
      await db.photos.where('draftId').equals(draftId).delete();
      await db.drafts.delete(draftId);
      await this.loadDrafts();
    } catch (error) {
      console.error('초안 삭제 실패:', error);
    }
  }

  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // 1시간 이내
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}분 전`;
    }

    // 오늘
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    }

    // 그 외
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showWaitingSection() {
    this.elements.waitingSection.classList.remove('hidden');
    this.elements.connectedSection.classList.add('hidden');
  }

  showConnectedSection() {
    this.elements.waitingSection.classList.add('hidden');
    this.elements.connectedSection.classList.remove('hidden');
  }

  disconnect() {
    if (this.receiver) {
      this.receiver.disconnect();
      this.receiver = null;
    }
    this.receivedPhotos = [];
    this.showWaitingSection();
    this.createNewSession();
  }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  const app = new PopupApp();
  app.init();
});
