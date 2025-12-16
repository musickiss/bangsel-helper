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
    this.receiver = null; // WebRTC 수신자

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
    console.log('[Popup] init 시작');

    // Firebase 초기화 (async)
    await this.initFirebase();

    this.bindEvents();
    await this.loadDrafts();
    await this.createNewSession();

    console.log('[Popup] init 완료');
  };

  PopupApp.prototype.initFirebase = async function() {
    console.log('[Popup] initFirebase 시작');
    console.log('[Popup] window.BangselFirebase:', window.BangselFirebase ? 'OK' : 'undefined');
    console.log('[Popup] typeof firebase:', typeof firebase);

    try {
      if (!window.BangselFirebase) {
        console.error('[Popup] BangselFirebase 모듈이 로드되지 않았습니다.');
        return;
      }

      window.BangselFirebase.initializeFirebase();
      this.firebaseInitialized = true;
      console.log('[Popup] Firebase 초기화 완료, firebaseInitialized:', this.firebaseInitialized);

      // Firebase 연결 상태 모니터링
      window.BangselFirebase.monitorConnection(function(connected) {
        console.log('[Popup] Firebase 연결 상태 변경:', connected);
      });

      // 테스트 쓰기 수행
      console.log('[Popup] Firebase 쓰기 테스트 시작...');
      try {
        await window.BangselFirebase.testWrite();
        console.log('[Popup] Firebase 쓰기 테스트 성공!');
      } catch (testError) {
        console.error('[Popup] Firebase 쓰기 테스트 실패:', testError);
      }

    } catch (error) {
      console.error('[Popup] Firebase 초기화 실패:', error);
      this.firebaseInitialized = false;
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
    console.log('[Popup] createNewSession 시작');
    console.log('[Popup] firebaseInitialized:', this.firebaseInitialized);

    // 이전 수신자 정리
    if (this.receiver) {
      console.log('[Popup] 이전 receiver 정리');
      this.receiver.disconnect();
      this.receiver = null;
    }

    // 이전 방이 있으면 삭제
    if (this.roomId && this.firebaseInitialized) {
      console.log('[Popup] 이전 방 삭제 시도:', this.roomId);
      try {
        await window.BangselFirebase.deleteRoom(this.roomId);
        console.log('[Popup] 이전 방 삭제 완료');
      } catch (e) {
        console.log('[Popup] 이전 방 삭제 실패 (무시):', e.message);
      }
    }

    // 새 Room ID 생성
    this.roomId = generateRoomId();
    console.log('[Popup] 새 Room ID 생성됨:', this.roomId);
    this.elements.roomCodeSpan.textContent = this.roomId;

    // Firebase에 방 생성 및 WebRTC 수신자 초기화
    if (this.firebaseInitialized) {
      console.log('[Popup] Firebase에 방 생성 시도...');
      try {
        var result = await window.BangselFirebase.createRoom(this.roomId);
        console.log('[Popup] Firebase 방 생성 성공!', result);

        // WebRTC 수신자 초기화
        console.log('[Popup] PhotoReceiver 초기화 시작...');
        this.initReceiver();

      } catch (error) {
        console.error('[Popup] Firebase 방 생성 실패!');
        console.error('[Popup] Error:', error);
        this.elements.qrcodeContainer.innerHTML =
          '<div style="text-align: center; padding: 20px; color: #ef4444;">' +
          '<p>서버 연결 실패</p>' +
          '<p>오류: ' + (error.message || error) + '</p>' +
          '</div>';
        return;
      }
    } else {
      console.warn('[Popup] Firebase가 초기화되지 않아 방 생성을 건너뜀');
    }

    this.generateQRCode();
    this.showWaitingSection();
    console.log('[Popup] createNewSession 완료');
  };

  /**
   * WebRTC 수신자 초기화
   */
  PopupApp.prototype.initReceiver = function() {
    var self = this;

    if (!window.PhotoReceiver) {
      console.error('[Popup] PhotoReceiver 클래스가 로드되지 않았습니다.');
      return;
    }

    console.log('[Popup] PhotoReceiver 생성, roomId:', this.roomId);

    this.receiver = new window.PhotoReceiver(
      this.roomId,
      // 사진 수신 콜백
      function(photo) {
        console.log('[Popup] 사진 수신됨:', photo.name);
        self.onPhotoReceived(photo);
      },
      // 연결 상태 변경 콜백
      function(status) {
        console.log('[Popup] 연결 상태 변경:', status);
        self.onConnectionStatusChange(status);
      }
    );

    // 수신자는 방 생성 후 대기 상태로 두고, WebRTC 연결 대기
    console.log('[Popup] PhotoReceiver 리스닝 시작...');
    this.receiver.startListening();
  };

  /**
   * 사진 수신 처리
   */
  PopupApp.prototype.onPhotoReceived = function(photo) {
    console.log('[Popup] onPhotoReceived:', photo.name, photo.size, 'bytes');
    this.receivedPhotos.push(photo);
    this.updatePhotoCount();
    // TODO: 사진을 그리드에 표시하고 IndexedDB에 저장
  };

  /**
   * 연결 상태 변경 처리
   */
  PopupApp.prototype.onConnectionStatusChange = function(status) {
    console.log('[Popup] onConnectionStatusChange:', status);

    if (status === 'connected') {
      console.log('[Popup] 모바일 연결됨!');
      this.showConnectedSection();
    } else if (status === 'disconnected' || status === 'failed') {
      console.log('[Popup] 연결 해제됨');
      // 연결 해제 시 대기 상태로 복귀하지 않고 현재 상태 유지
    }
  };

  /**
   * 사진 개수 업데이트
   */
  PopupApp.prototype.updatePhotoCount = function() {
    this.elements.photoCount.textContent = '수신된 사진: ' + this.receivedPhotos.length + '장';
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
