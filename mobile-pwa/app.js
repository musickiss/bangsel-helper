/**
 * 모바일 PWA 메인 앱 로직
 */

// Firebase 설정 (실제 배포 시 변경 필요)
const firebaseConfig = {
  apiKey: "AIzaSyDUVu0ixcp4D8aOVSpDe_CiaiMBzaujhyY",
  authDomain: "bangsel-helper.firebaseapp.com",
  databaseURL: "https://bangsel-helper-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bangsel-helper",
  storageBucket: "bangsel-helper.firebasestorage.app",
  messagingSenderId: "686580911050",
  appId: "1:686580911050:web:5f1520c56029ce2cc71d33",
  measurementId: "G-89K836YMRH"
};

class MobileApp {
  constructor() {
    this.sender = null;
    this.camera = new CameraManager();
    this.isConnecting = false;
    this.previewUrls = [];

    // DOM 요소
    this.elements = {
      connectSection: document.getElementById('connect-section'),
      scannerSection: document.getElementById('scanner-section'),
      transferSection: document.getElementById('transfer-section'),

      scanQrBtn: document.getElementById('scan-qr-btn'),
      roomCodeInput: document.getElementById('room-code-input'),
      connectBtn: document.getElementById('connect-btn'),
      closeScannerBtn: document.getElementById('close-scanner-btn'),
      scannerVideo: document.getElementById('scanner-video'),

      disconnectBtn: document.getElementById('disconnect-btn'),
      cameraBtn: document.getElementById('camera-btn'),
      galleryBtn: document.getElementById('gallery-btn'),
      clearPhotosBtn: document.getElementById('clear-photos-btn'),

      selectedPhotos: document.getElementById('selected-photos'),
      photoPreviewList: document.getElementById('photo-preview-list'),
      progressContainer: document.getElementById('progress-container'),
      progressText: document.getElementById('progress-text'),
      progressPercent: document.getElementById('progress-percent'),
      progressFill: document.getElementById('progress-fill'),

      sendBtn: document.getElementById('send-btn'),
      successMessage: document.getElementById('success-message')
    };

    this.scannerStream = null;
    this.scanInterval = null;
  }

  /**
   * 앱 초기화
   */
  init() {
    // Firebase 초기화
    this.initFirebase();

    // 이벤트 바인딩
    this.bindEvents();

    // URL에서 room 파라미터 확인
    this.checkUrlParams();

    // 서비스 워커 등록
    this.registerServiceWorker();

    console.log('Mobile app initialized');
  }

  /**
   * Firebase 초기화
   */
  initFirebase() {
    console.log('[Mobile] Firebase 초기화 시작...');
    console.log('[Mobile] databaseURL:', firebaseConfig.databaseURL);

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log('[Mobile] Firebase 앱 초기화 완료');
    } else {
      console.log('[Mobile] Firebase 이미 초기화됨');
    }

    // Firebase 연결 상태 모니터링
    firebase.database().ref('.info/connected').on('value', (snapshot) => {
      console.log('[Mobile] Firebase 연결 상태:', snapshot.val() ? '연결됨' : '연결 안됨');
    });
  }

  /**
   * 이벤트 바인딩
   */
  bindEvents() {
    // QR 스캔
    this.elements.scanQrBtn.addEventListener('click', () => this.startQRScanner());
    this.elements.closeScannerBtn.addEventListener('click', () => this.stopQRScanner());

    // 코드 입력
    this.elements.connectBtn.addEventListener('click', () => this.connectWithCode());
    this.elements.roomCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.connectWithCode();
    });

    // 코드 입력 자동 포맷팅
    this.elements.roomCodeInput.addEventListener('input', (e) => {
      let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (value.length > 3) {
        value = value.slice(0, 3) + '-' + value.slice(3, 6);
      }
      e.target.value = value;
    });

    // 연결 해제
    this.elements.disconnectBtn.addEventListener('click', () => this.disconnect());

    // 사진 촬영/선택
    this.elements.cameraBtn.addEventListener('click', () => this.capturePhoto());
    this.elements.galleryBtn.addEventListener('click', () => this.selectFromGallery());
    this.elements.clearPhotosBtn.addEventListener('click', () => this.clearPhotos());

    // 전송
    this.elements.sendBtn.addEventListener('click', () => this.sendPhotos());
  }

  /**
   * URL 파라미터 확인
   */
  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');

    if (roomId && this.isValidRoomId(roomId)) {
      this.elements.roomCodeInput.value = roomId;
      // 자동 연결
      this.connectWithCode();
    }
  }

  /**
   * Room ID 유효성 검사
   */
  isValidRoomId(roomId) {
    return /^[A-Z]{3}-[0-9]{3}$/.test(roomId);
  }

  /**
   * QR 스캐너 시작
   */
  async startQRScanner() {
    try {
      this.showSection('scanner');

      // 카메라 스트림 시작
      this.scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      this.elements.scannerVideo.srcObject = this.scannerStream;

      // BarcodeDetector API 사용 (지원되는 경우)
      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });

        this.scanInterval = setInterval(async () => {
          try {
            const barcodes = await detector.detect(this.elements.scannerVideo);
            if (barcodes.length > 0) {
              const url = new URL(barcodes[0].rawValue);
              const roomId = url.searchParams.get('room');
              if (roomId && this.isValidRoomId(roomId)) {
                this.stopQRScanner();
                this.elements.roomCodeInput.value = roomId;
                this.connectWithCode();
              }
            }
          } catch (e) {
            // 감지 실패 무시
          }
        }, 200);
      } else {
        // BarcodeDetector 미지원 시 안내
        alert('이 브라우저에서는 QR 스캔을 지원하지 않습니다.\n코드를 직접 입력해주세요.');
        this.stopQRScanner();
      }
    } catch (error) {
      console.error('Camera access failed:', error);
      alert('카메라에 접근할 수 없습니다.\n권한을 확인해주세요.');
      this.stopQRScanner();
    }
  }

  /**
   * QR 스캐너 중지
   */
  stopQRScanner() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    if (this.scannerStream) {
      this.scannerStream.getTracks().forEach(track => track.stop());
      this.scannerStream = null;
    }

    this.elements.scannerVideo.srcObject = null;
    this.showSection('connect');
  }

  /**
   * 코드로 연결
   */
  async connectWithCode() {
    const roomId = this.elements.roomCodeInput.value.trim().toUpperCase();
    console.log('[Mobile] connectWithCode 시작, roomId:', roomId);

    if (!this.isValidRoomId(roomId)) {
      alert('올바른 연결 코드를 입력해주세요.\n(예: ABC-123)');
      return;
    }

    if (this.isConnecting) return;

    try {
      this.isConnecting = true;
      this.elements.connectBtn.disabled = true;
      this.elements.connectBtn.textContent = '연결 중...';

      // 방 존재 여부 확인
      console.log('[Mobile] Firebase에서 방 확인 중...');
      const roomRef = firebase.database().ref(`rooms/${roomId}`);
      const snapshot = await roomRef.once('value');

      console.log('[Mobile] 방 조회 결과:', snapshot.exists() ? '존재함' : '없음');
      if (snapshot.exists()) {
        console.log('[Mobile] 방 데이터:', JSON.stringify(snapshot.val()));
      }

      if (!snapshot.exists()) {
        throw new Error('존재하지 않는 연결 코드입니다.');
      }

      // WebRTC 연결
      console.log('[Mobile] WebRTC 연결 시작...');
      this.sender = new PhotoSender(roomId, (status) => this.onConnectionStatusChange(status));
      await this.sender.connect();

      console.log('[Mobile] WebRTC 연결 성공!');
      // 연결 성공 → 전송 화면으로 전환
      this.showSection('transfer');

    } catch (error) {
      console.error('[Mobile] Connection failed:', error);
      alert(error.message || '연결에 실패했습니다.');
    } finally {
      this.isConnecting = false;
      this.elements.connectBtn.disabled = false;
      this.elements.connectBtn.textContent = '연결';
    }
  }

  /**
   * 연결 상태 변경 핸들러
   * WebRTC P2P 실패해도 Firebase로 전송 가능하므로 연결 유지
   */
  onConnectionStatusChange(status) {
    console.log('[Mobile] Connection status:', status);

    // 'disconnected'만 처리 (사용자가 명시적으로 연결 해제한 경우)
    // 'failed'는 WebRTC P2P 실패를 의미하지만, Firebase로 전송 가능하므로 무시
    if (status === 'disconnected') {
      // 연결 해제 시에만 상태 초기화
      // (사용자가 disconnect() 호출한 경우)
    }
    // WebRTC 'failed' 상태는 무시 - Firebase로 계속 전송 가능
  }

  /**
   * 연결 해제
   */
  disconnect() {
    if (this.sender) {
      this.sender.disconnect();
      this.sender = null;
    }

    this.clearPhotos();
    this.showSection('connect');
  }

  /**
   * 사진 촬영
   */
  async capturePhoto() {
    try {
      const files = await this.camera.capturePhoto();
      if (files.length > 0) {
        this.camera.addFiles(files);
        this.updatePhotoPreview();
      }
    } catch (error) {
      alert(error.message);
    }
  }

  /**
   * 갤러리에서 선택
   */
  async selectFromGallery() {
    try {
      const files = await this.camera.selectFromGallery();
      if (files.length > 0) {
        this.camera.addFiles(files);
        this.updatePhotoPreview();
      }
    } catch (error) {
      alert(error.message);
    }
  }

  /**
   * 사진 미리보기 업데이트
   */
  updatePhotoPreview() {
    const files = this.camera.getSelectedFiles();
    const list = this.elements.photoPreviewList;

    // 기존 URL 해제
    this.previewUrls.forEach(url => URL.revokeObjectURL(url));
    this.previewUrls = [];

    // 미리보기 생성
    list.innerHTML = '';
    files.forEach((file, index) => {
      const url = this.camera.createPreviewUrl(file);
      this.previewUrls.push(url);

      const item = document.createElement('div');
      item.className = 'photo-preview-item';
      item.innerHTML = `
        <img src="${url}" alt="${file.name}">
        <button class="photo-preview-remove" data-index="${index}">×</button>
      `;

      item.querySelector('.photo-preview-remove').addEventListener('click', () => {
        this.removePhoto(index);
      });

      list.appendChild(item);
    });

    // UI 상태 업데이트
    if (files.length > 0) {
      this.elements.selectedPhotos.classList.remove('hidden');
      this.elements.sendBtn.classList.remove('hidden');
    } else {
      this.elements.selectedPhotos.classList.add('hidden');
      this.elements.sendBtn.classList.add('hidden');
    }

    // 성공 메시지 숨기기
    this.elements.successMessage.classList.add('hidden');
  }

  /**
   * 사진 제거
   */
  removePhoto(index) {
    this.camera.removeFile(index);
    this.updatePhotoPreview();
  }

  /**
   * 모든 사진 삭제
   */
  clearPhotos() {
    this.camera.clearFiles();
    this.previewUrls.forEach(url => URL.revokeObjectURL(url));
    this.previewUrls = [];
    this.updatePhotoPreview();
  }

  /**
   * 사진 전송 (Firebase를 통해 전송)
   */
  async sendPhotos() {
    if (!this.sender) {
      alert('PC와 연결되지 않았습니다.');
      return;
    }

    const files = this.camera.getSelectedFiles();
    if (files.length === 0) {
      alert('전송할 사진을 선택해주세요.');
      return;
    }

    try {
      // UI 상태 변경
      this.elements.sendBtn.classList.add('hidden');
      this.elements.progressContainer.classList.remove('hidden');
      this.elements.successMessage.classList.add('hidden');

      // 전송 시작
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        this.elements.progressText.textContent = `전송 중 (${i + 1}/${files.length}): ${file.name}`;

        await this.sender.sendPhoto(file, (progress) => {
          const totalProgress = ((i + progress / 100) / files.length) * 100;
          this.elements.progressPercent.textContent = `${Math.round(totalProgress)}%`;
          this.elements.progressFill.style.width = `${totalProgress}%`;
        });
      }

      // 전송 완료
      this.elements.progressContainer.classList.add('hidden');
      this.elements.successMessage.classList.remove('hidden');

      // 3초 후 사진 목록 초기화
      setTimeout(() => {
        this.clearPhotos();
      }, 3000);

    } catch (error) {
      console.error('Send failed:', error);
      alert('전송에 실패했습니다: ' + error.message);

      this.elements.progressContainer.classList.add('hidden');
      this.elements.sendBtn.classList.remove('hidden');
    }
  }

  /**
   * 섹션 전환
   */
  showSection(sectionName) {
    this.elements.connectSection.classList.add('hidden');
    this.elements.scannerSection.classList.add('hidden');
    this.elements.transferSection.classList.add('hidden');

    switch (sectionName) {
      case 'connect':
        this.elements.connectSection.classList.remove('hidden');
        break;
      case 'scanner':
        this.elements.scannerSection.classList.remove('hidden');
        break;
      case 'transfer':
        this.elements.transferSection.classList.remove('hidden');
        break;
    }
  }

  /**
   * 서비스 워커 등록
   */
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered:', registration);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
  const app = new MobileApp();
  app.init();
});
