/**
 * 팝업 UI 로직
 * QR 코드 생성, 연결 상태 관리, 초안 목록 표시
 */

(function() {
  'use strict';

  // PWA URL
  var PWA_BASE_URL = 'https://musickiss.github.io/bangsel-helper';

  /**
   * 랜덤 Room ID 생성 (예: ABC-123)
   */
  function generateRoomId() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    var nums = '23456789';
    var id = '';

    var randomValues = new Uint32Array(6);
    crypto.getRandomValues(randomValues);

    for (var i = 0; i < 3; i++) {
      id += chars[randomValues[i] % chars.length];
    }

    id += '-';

    for (var i = 3; i < 6; i++) {
      id += nums[randomValues[i] % nums.length];
    }

    return id;
  }

  /**
   * QR 코드 URL 생성
   */
  function generateQRCodeUrl(roomId) {
    return PWA_BASE_URL + '?room=' + encodeURIComponent(roomId);
  }

  /**
   * PopupApp 클래스
   */
  function PopupApp() {
    this.roomId = null;
    this.receivedPhotos = [];
    this.firebaseInitialized = false;

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

  PopupApp.prototype.init = async function() {
    // Firebase 초기화
    this.initFirebase();

    this.bindEvents();
    await this.loadDrafts();
    await this.createNewSession();
  };

  PopupApp.prototype.initFirebase = function() {
    try {
      if (window.BangselFirebase) {
        window.BangselFirebase.initializeFirebase();
        this.firebaseInitialized = true;
        console.log('Firebase 초기화 완료');
      } else {
        console.error('Firebase 모듈이 로드되지 않았습니다.');
      }
    } catch (error) {
      console.error('Firebase 초기화 실패:', error);
    }
  };

  PopupApp.prototype.bindEvents = function() {
    var self = this;

    this.elements.newCodeBtn.addEventListener('click', async function() {
      await self.createNewSession();
    });

    this.elements.disconnectBtn.addEventListener('click', function() {
      self.disconnect();
    });

    this.elements.settingsLink.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Settings clicked');
    });

    this.elements.helpLink.addEventListener('click', function(e) {
      e.preventDefault();
      console.log('Help clicked');
    });
  };

  PopupApp.prototype.createNewSession = async function() {
    var self = this;

    // 이전 방이 있으면 삭제
    if (this.roomId && this.firebaseInitialized) {
      try {
        await window.BangselFirebase.deleteRoom(this.roomId);
      } catch (e) {
        // 무시
      }
    }

    // 새 Room ID 생성
    this.roomId = generateRoomId();
    this.elements.roomCodeSpan.textContent = this.roomId;

    // Firebase에 방 생성
    if (this.firebaseInitialized) {
      try {
        await window.BangselFirebase.createRoom(this.roomId);
        console.log('Firebase 방 생성됨:', this.roomId);
      } catch (error) {
        console.error('Firebase 방 생성 실패:', error);
        this.elements.qrcodeContainer.innerHTML =
          '<div style="text-align: center; padding: 20px; color: #ef4444;">' +
          '<p>서버 연결 실패</p>' +
          '<p>인터넷 연결을 확인하세요</p>' +
          '</div>';
        return;
      }
    }

    this.generateQRCode();
    this.showWaitingSection();
  };

  PopupApp.prototype.generateQRCode = function() {
    this.elements.qrcodeContainer.innerHTML = '';

    var qrCodeUrl = generateQRCodeUrl(this.roomId);

    if (typeof QRCode !== 'undefined') {
      try {
        new QRCode(this.elements.qrcodeContainer, {
          text: qrCodeUrl,
          width: 150,
          height: 150,
          colorDark: '#1f2937',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (e) {
        console.error('QR 코드 생성 실패:', e);
        this.elements.qrcodeContainer.innerHTML =
          '<div style="text-align: center; padding: 20px; color: #6b7280;">' +
          '<p>QR 코드를 생성할 수 없습니다.</p>' +
          '<p>코드를 직접 입력하세요: ' + this.roomId + '</p>' +
          '</div>';
      }
    } else {
      this.elements.qrcodeContainer.innerHTML =
        '<div style="text-align: center; padding: 20px; color: #6b7280;">' +
        '<p>코드를 직접 입력하세요: ' + this.roomId + '</p>' +
        '</div>';
    }
  };

  PopupApp.prototype.loadDrafts = async function() {
    try {
      if (!window.BangselDB) {
        console.log('DB 모듈이 아직 로드되지 않았습니다.');
        return;
      }

      var drafts = await window.BangselDB.getAllDrafts();
      this.renderDraftsList(drafts);
    } catch (error) {
      console.error('초안 목록 로드 실패:', error);
    }
  };

  PopupApp.prototype.renderDraftsList = function(drafts) {
    var list = this.elements.draftsList;
    var self = this;

    if (!drafts || drafts.length === 0) {
      list.innerHTML = '<p class="empty-message">저장된 초안이 없습니다</p>';
      return;
    }

    list.innerHTML = '';

    drafts.forEach(function(draft) {
      var item = document.createElement('div');
      item.className = 'draft-item';
      item.innerHTML =
        '<div class="draft-info">' +
        '<div class="draft-title">' + self.escapeHtml(draft.title || '제목 없음') + '</div>' +
        '<div class="draft-meta">' + self.formatDate(draft.updatedAt) + ' · 사진 ' + (draft.photoIds ? draft.photoIds.length : 0) + '장</div>' +
        '</div>' +
        '<button class="draft-delete" data-id="' + draft.id + '" title="삭제">×</button>';

      item.querySelector('.draft-info').addEventListener('click', function() {
        chrome.tabs.create({ url: draft.boardUrl });
      });

      item.querySelector('.draft-delete').addEventListener('click', function(e) {
        e.stopPropagation();
        self.deleteDraft(draft.id);
      });

      list.appendChild(item);
    });
  };

  PopupApp.prototype.deleteDraft = async function(draftId) {
    try {
      if (window.BangselDB) {
        await window.BangselDB.deleteDraft(draftId);
        await this.loadDrafts();
      }
    } catch (error) {
      console.error('초안 삭제 실패:', error);
    }
  };

  PopupApp.prototype.formatDate = function(timestamp) {
    var date = new Date(timestamp);
    var now = new Date();
    var diff = now - date;

    if (diff < 3600000) {
      var minutes = Math.floor(diff / 60000);
      return minutes + '분 전';
    }

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  PopupApp.prototype.escapeHtml = function(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  PopupApp.prototype.showWaitingSection = function() {
    this.elements.waitingSection.classList.remove('hidden');
    this.elements.connectedSection.classList.add('hidden');
  };

  PopupApp.prototype.showConnectedSection = function() {
    this.elements.waitingSection.classList.add('hidden');
    this.elements.connectedSection.classList.remove('hidden');
  };

  PopupApp.prototype.disconnect = async function() {
    // Firebase에서 방 삭제
    if (this.roomId && this.firebaseInitialized) {
      try {
        await window.BangselFirebase.deleteRoom(this.roomId);
      } catch (e) {
        // 무시
      }
    }

    this.receivedPhotos = [];
    this.showWaitingSection();
    await this.createNewSession();
  };

  // 초기화
  document.addEventListener('DOMContentLoaded', function() {
    var app = new PopupApp();
    app.init();
  });
})();
