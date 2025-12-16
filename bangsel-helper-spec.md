# 방셀 헬퍼 (Bangsel Helper) - 프로젝트 명세서

## 📋 프로젝트 개요

SOOP(구 아프리카TV) 스트리머들이 후원자에게 보답하는 "방셀"(방송 셀카 + 감사글)을 작성할 때, 글과 사진이 소실되지 않도록 도와주는 크롬 확장프로그램입니다.

### 핵심 문제 해결
1. SOOP 게시판의 불안정성으로 인한 글/사진 소실 방지
2. 모바일에서 촬영한 사진을 PC로 쉽게 전송
3. 작성 중인 글의 자동 백업

### 핵심 특징
- **P2P 직접 전송**: 사진이 외부 서버를 거치지 않고 모바일→PC 직접 전송 (WebRTC)
- **자동 저장**: 글 작성 중 IndexedDB에 실시간 백업
- **브라우저 종료 복구**: 브라우저가 꺼져도 다시 열면 작성 중이던 내용 복구

---

## 🛠 기술 스택

```
Chrome Extension (Manifest V3)
├── Background: Service Worker
├── Storage: IndexedDB (Dexie.js 래퍼 사용)
├── P2P: WebRTC DataChannel
└── UI: Vanilla JS + Tailwind CSS (CDN)

Mobile PWA
├── Vanilla JS (프레임워크 없음, 가볍게)
├── WebRTC
├── Camera API / File API
└── PWA (홈화면 추가 가능)

Signaling Server (최소 비용)
└── Firebase Realtime Database (무료 티어)
    - 시그널링 데이터만 교환 (KB 단위)
    - 사진 데이터는 거치지 않음
```

---

## 📁 프로젝트 구조

```
bangsel-helper/
│
├── chrome-extension/                 # 크롬 확장프로그램
│   ├── manifest.json                 # Manifest V3 설정
│   ├── background/
│   │   └── service-worker.js         # 백그라운드 서비스 워커
│   ├── popup/
│   │   ├── popup.html                # 팝업 UI (QR코드 표시)
│   │   ├── popup.js                  # 팝업 로직
│   │   └── popup.css                 # 팝업 스타일
│   ├── content/
│   │   └── soop-content.js           # SOOP 페이지에 주입되는 스크립트
│   ├── lib/
│   │   ├── webrtc-receiver.js        # WebRTC 수신 로직
│   │   ├── db.js                     # IndexedDB 관리 (Dexie.js)
│   │   ├── firebase-config.js        # Firebase 설정
│   │   └── image-utils.js            # 이미지 압축/최적화
│   ├── assets/
│   │   ├── icons/
│   │   │   ├── icon-16.png
│   │   │   ├── icon-48.png
│   │   │   └── icon-128.png
│   │   └── logo.svg
│   └── lib-vendor/
│       ├── dexie.min.js              # IndexedDB 래퍼
│       ├── qrcode.min.js             # QR코드 생성
│       └── firebase-app.js           # Firebase SDK (필요한 모듈만)
│
├── mobile-pwa/                       # 모바일 웹앱
│   ├── index.html                    # 메인 페이지
│   ├── app.js                        # 앱 로직
│   ├── webrtc-sender.js              # WebRTC 전송 로직
│   ├── camera.js                     # 카메라/갤러리 접근
│   ├── style.css                     # 스타일
│   ├── manifest.json                 # PWA 매니페스트
│   ├── sw.js                         # Service Worker (오프라인)
│   └── assets/
│       └── icons/
│
├── firebase/                         # Firebase 설정
│   ├── firebase.json
│   ├── database.rules.json           # Realtime DB 보안 규칙
│   └── .firebaserc
│
├── docs/                             # 문서
│   ├── SETUP.md                      # 설치 가이드
│   ├── USAGE.md                      # 사용법
│   └── ARCHITECTURE.md               # 아키텍처 설명
│
├── .github/
│   └── workflows/
│       └── deploy-pwa.yml            # PWA 자동 배포 (GitHub Pages)
│
├── package.json
├── README.md
└── .gitignore
```

---

## 🔧 상세 기능 명세

### 1. 크롬 확장프로그램 - manifest.json

```json
{
  "manifest_version": 3,
  "name": "방셀 헬퍼",
  "version": "1.0.0",
  "description": "SOOP 방셀 작성 도우미 - 사진 전송 & 자동 저장",
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://www.sooplive.co.kr/*",
    "https://ch.sooplive.co.kr/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "assets/icons/icon-16.png",
      "48": "assets/icons/icon-48.png",
      "128": "assets/icons/icon-128.png"
    }
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.sooplive.co.kr/station/*/board/*",
        "https://ch.sooplive.co.kr/*/post/*"
      ],
      "js": ["lib-vendor/dexie.min.js", "lib/db.js", "content/soop-content.js"],
      "css": ["content/soop-content.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "assets/icons/icon-16.png",
    "48": "assets/icons/icon-48.png",
    "128": "assets/icons/icon-128.png"
  }
}
```

### 2. IndexedDB 스키마 (lib/db.js)

```javascript
// Dexie.js를 사용한 IndexedDB 관리
import Dexie from 'dexie';

const db = new Dexie('BangselHelperDB');

db.version(1).stores({
  // 방셀 초안 저장
  drafts: '++id, boardUrl, createdAt, updatedAt, status',
  
  // 수신된 사진 저장
  photos: '++id, draftId, name, type, size, createdAt',
  
  // 연결 세션 정보
  sessions: 'roomId, createdAt, lastActivity'
});

// drafts 테이블 구조
/*
{
  id: auto-increment,
  boardUrl: "https://www.sooplive.co.kr/station/xxx/board/123",
  title: "방셀 제목",
  content: "본문 내용...",
  photoIds: [1, 2, 3],  // photos 테이블 참조
  createdAt: timestamp,
  updatedAt: timestamp,
  status: "draft" | "uploading" | "completed"
}
*/

// photos 테이블 구조
/*
{
  id: auto-increment,
  draftId: drafts.id 참조,
  name: "셀카.jpg",
  type: "image/jpeg",
  size: 2048000,  // bytes
  data: Blob,     // 실제 이미지 데이터
  thumbnail: Blob, // 미리보기용 썸네일
  createdAt: timestamp
}
*/

export default db;
```

### 3. WebRTC P2P 연결 - 수신측 (chrome-extension/lib/webrtc-receiver.js)

```javascript
/**
 * PC 크롬 확장프로그램에서 실행
 * 모바일로부터 사진을 수신하는 역할
 */
export class PhotoReceiver {
  constructor(roomId, onPhotoReceived, onStatusChange) {
    this.roomId = roomId;
    this.onPhotoReceived = onPhotoReceived;
    this.onStatusChange = onStatusChange;
    this.pc = null;
    this.dataChannel = null;
    this.receivedChunks = [];
    this.currentFileInfo = null;
  }

  async initialize() {
    // RTCPeerConnection 설정
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // ICE candidate 처리
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendToSignaling('ice-candidate', event.candidate);
      }
    };

    // 연결 상태 변화 감지
    this.pc.onconnectionstatechange = () => {
      this.onStatusChange(this.pc.connectionState);
    };

    // 데이터 채널 수신 대기
    this.pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    // Firebase 시그널링 리스너 등록
    await this.listenToSignaling();
  }

  setupDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
      this.onStatusChange('connected');
    };
  }

  handleMessage(data) {
    // JSON 메시지 (파일 정보)
    if (typeof data === 'string') {
      const message = JSON.parse(data);
      
      if (message.type === 'file-start') {
        // 새 파일 수신 시작
        this.currentFileInfo = message;
        this.receivedChunks = [];
      } else if (message.type === 'file-end') {
        // 파일 수신 완료 → Blob 생성
        const blob = new Blob(this.receivedChunks, { 
          type: this.currentFileInfo.mimeType 
        });
        this.onPhotoReceived({
          name: this.currentFileInfo.name,
          type: this.currentFileInfo.mimeType,
          size: this.currentFileInfo.size,
          data: blob
        });
        this.receivedChunks = [];
        this.currentFileInfo = null;
      }
    } else {
      // 바이너리 데이터 (파일 청크)
      this.receivedChunks.push(data);
    }
  }

  // Firebase Realtime DB를 통한 시그널링
  async sendToSignaling(type, data) {
    const { database, ref, push } = await import('./firebase-config.js');
    const signalingRef = ref(database, `rooms/${this.roomId}/receiver`);
    await push(signalingRef, { type, data, timestamp: Date.now() });
  }

  async listenToSignaling() {
    const { database, ref, onChildAdded } = await import('./firebase-config.js');
    const senderRef = ref(database, `rooms/${this.roomId}/sender`);
    
    onChildAdded(senderRef, async (snapshot) => {
      const message = snapshot.val();
      
      if (message.type === 'offer') {
        await this.pc.setRemoteDescription(message.data);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.sendToSignaling('answer', answer);
      } else if (message.type === 'ice-candidate') {
        await this.pc.addIceCandidate(message.data);
      }
    });
  }

  disconnect() {
    if (this.dataChannel) this.dataChannel.close();
    if (this.pc) this.pc.close();
  }
}
```

### 4. WebRTC P2P 연결 - 송신측 (mobile-pwa/webrtc-sender.js)

```javascript
/**
 * 모바일 PWA에서 실행
 * PC로 사진을 전송하는 역할
 */
export class PhotoSender {
  constructor(roomId, onStatusChange) {
    this.roomId = roomId;
    this.onStatusChange = onStatusChange;
    this.pc = null;
    this.dataChannel = null;
  }

  async connect() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // 데이터 채널 생성 (송신측에서 생성)
    this.dataChannel = this.pc.createDataChannel('photos', {
      ordered: true
    });
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      this.onStatusChange('connected');
    };

    // ICE candidate 처리
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendToSignaling('ice-candidate', event.candidate);
      }
    };

    // Offer 생성 및 전송
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.sendToSignaling('offer', offer);

    // Answer 대기
    await this.listenToSignaling();
  }

  async sendPhoto(file, onProgress) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('연결되지 않았습니다');
    }

    const CHUNK_SIZE = 16384; // 16KB
    const buffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);

    // 파일 시작 알림
    this.dataChannel.send(JSON.stringify({
      type: 'file-start',
      name: file.name,
      mimeType: file.type,
      size: file.size,
      totalChunks
    }));

    // 청크 단위로 전송
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
      const chunk = buffer.slice(start, end);
      
      // 버퍼가 가득 차면 대기
      while (this.dataChannel.bufferedAmount > 65535) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      this.dataChannel.send(chunk);
      onProgress?.((i + 1) / totalChunks * 100);
    }

    // 파일 끝 알림
    this.dataChannel.send(JSON.stringify({ type: 'file-end' }));
  }

  async sendToSignaling(type, data) {
    const signalingRef = firebase.database().ref(`rooms/${this.roomId}/sender`);
    await signalingRef.push({ type, data, timestamp: Date.now() });
  }

  async listenToSignaling() {
    return new Promise((resolve) => {
      const receiverRef = firebase.database().ref(`rooms/${this.roomId}/receiver`);
      
      receiverRef.on('child_added', async (snapshot) => {
        const message = snapshot.val();
        
        if (message.type === 'answer') {
          await this.pc.setRemoteDescription(message.data);
          resolve();
        } else if (message.type === 'ice-candidate') {
          await this.pc.addIceCandidate(message.data);
        }
      });
    });
  }

  disconnect() {
    if (this.dataChannel) this.dataChannel.close();
    if (this.pc) this.pc.close();
  }
}
```

### 5. Content Script - SOOP 페이지 자동저장 (content/soop-content.js)

```javascript
/**
 * SOOP 게시판 페이지에 주입되어 실행
 * 글 작성 내용을 실시간으로 IndexedDB에 백업
 */

import db from '../lib/db.js';

class SoopAutoSaver {
  constructor() {
    this.currentDraftId = null;
    this.saveDebounceTimer = null;
    this.boardUrl = window.location.href;
  }

  async init() {
    // 기존 초안 확인
    await this.checkExistingDraft();
    
    // 에디터 감지 및 이벤트 바인딩
    this.observeEditor();
    
    // 페이지 떠날 때 저장
    window.addEventListener('beforeunload', () => this.saveNow());
    
    // 확장프로그램과 통신 (사진 수신 알림 등)
    this.setupMessageListener();
  }

  async checkExistingDraft() {
    const existingDraft = await db.drafts
      .where('boardUrl')
      .equals(this.boardUrl)
      .and(draft => draft.status === 'draft')
      .first();

    if (existingDraft) {
      this.currentDraftId = existingDraft.id;
      this.showRecoveryPrompt(existingDraft);
    }
  }

  showRecoveryPrompt(draft) {
    const modal = document.createElement('div');
    modal.className = 'bangsel-helper-modal';
    modal.innerHTML = `
      <div class="bangsel-modal-content">
        <h3>📋 저장된 방셀 초안이 있습니다</h3>
        <p>마지막 저장: ${new Date(draft.updatedAt).toLocaleString()}</p>
        <p>사진 ${draft.photoIds?.length || 0}장</p>
        <div class="bangsel-modal-preview">${draft.content?.substring(0, 100)}...</div>
        <div class="bangsel-modal-buttons">
          <button id="bangsel-recover">이어서 작성하기</button>
          <button id="bangsel-discard">새로 시작</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('bangsel-recover').onclick = () => {
      this.recoverDraft(draft);
      modal.remove();
    };

    document.getElementById('bangsel-discard').onclick = async () => {
      await db.drafts.delete(draft.id);
      await db.photos.where('draftId').equals(draft.id).delete();
      this.currentDraftId = null;
      modal.remove();
    };
  }

  async recoverDraft(draft) {
    // SOOP 에디터에 내용 복원
    const editor = this.findEditor();
    if (editor && draft.content) {
      editor.innerHTML = draft.content;
    }

    // 저장된 사진 미리보기 표시
    const photos = await db.photos.where('draftId').equals(draft.id).toArray();
    this.displayRecoveredPhotos(photos);
  }

  observeEditor() {
    // SOOP 에디터 요소를 찾아서 이벤트 바인딩
    const observer = new MutationObserver(() => {
      const editor = this.findEditor();
      if (editor && !editor.dataset.bangselBound) {
        editor.dataset.bangselBound = 'true';
        this.bindEditorEvents(editor);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  findEditor() {
    // SOOP 게시판의 에디터 요소 선택자 (실제 구조에 맞게 수정 필요)
    return document.querySelector('.fr-element.fr-view') || 
           document.querySelector('[contenteditable="true"]') ||
           document.querySelector('textarea.write-content');
  }

  bindEditorEvents(editor) {
    editor.addEventListener('input', () => {
      this.debouncedSave();
    });

    editor.addEventListener('paste', () => {
      setTimeout(() => this.debouncedSave(), 100);
    });
  }

  debouncedSave() {
    clearTimeout(this.saveDebounceTimer);
    this.saveDebounceTimer = setTimeout(() => this.saveNow(), 500);
  }

  async saveNow() {
    const editor = this.findEditor();
    if (!editor) return;

    const content = editor.innerHTML || editor.value;
    const title = document.querySelector('input[name="title"]')?.value || '';

    if (!this.currentDraftId) {
      // 새 초안 생성
      this.currentDraftId = await db.drafts.add({
        boardUrl: this.boardUrl,
        title,
        content,
        photoIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'draft'
      });
    } else {
      // 기존 초안 업데이트
      await db.drafts.update(this.currentDraftId, {
        title,
        content,
        updatedAt: Date.now()
      });
    }

    this.showSaveIndicator();
  }

  showSaveIndicator() {
    let indicator = document.getElementById('bangsel-save-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'bangsel-save-indicator';
      indicator.className = 'bangsel-save-indicator';
      document.body.appendChild(indicator);
    }
    
    indicator.textContent = '✓ 자동 저장됨';
    indicator.classList.add('show');
    
    setTimeout(() => {
      indicator.classList.remove('show');
    }, 2000);
  }

  setupMessageListener() {
    // 확장프로그램 백그라운드에서 사진 수신 알림
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      if (message.type === 'PHOTO_RECEIVED') {
        await this.handleReceivedPhoto(message.photo);
        sendResponse({ success: true });
      }
    });
  }

  async handleReceivedPhoto(photoData) {
    // 초안이 없으면 생성
    if (!this.currentDraftId) {
      this.currentDraftId = await db.drafts.add({
        boardUrl: this.boardUrl,
        title: '',
        content: '',
        photoIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'draft'
      });
    }

    // 사진 저장
    const photoId = await db.photos.add({
      draftId: this.currentDraftId,
      name: photoData.name,
      type: photoData.type,
      size: photoData.size,
      data: photoData.data,
      thumbnail: await this.createThumbnail(photoData.data),
      createdAt: Date.now()
    });

    // 초안에 사진 ID 추가
    const draft = await db.drafts.get(this.currentDraftId);
    await db.drafts.update(this.currentDraftId, {
      photoIds: [...(draft.photoIds || []), photoId],
      updatedAt: Date.now()
    });

    // UI에 사진 미리보기 추가
    this.displayReceivedPhoto(photoData);
  }

  async createThumbnail(blob, maxSize = 200) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(resolve, 'image/jpeg', 0.7);
      };
      img.src = URL.createObjectURL(blob);
    });
  }

  displayReceivedPhoto(photoData) {
    // 사진 미리보기 UI 표시 (실제 구현 시 SOOP UI에 맞게 수정)
    let container = document.getElementById('bangsel-photos');
    if (!container) {
      container = document.createElement('div');
      container.id = 'bangsel-photos';
      container.className = 'bangsel-photos-container';
      
      const editorArea = this.findEditor()?.parentElement;
      editorArea?.insertBefore(container, editorArea.firstChild);
    }

    const photoEl = document.createElement('div');
    photoEl.className = 'bangsel-photo-item';
    photoEl.innerHTML = `
      <img src="${URL.createObjectURL(photoData.data)}" alt="${photoData.name}">
      <button class="bangsel-photo-insert" data-name="${photoData.name}">삽입</button>
      <button class="bangsel-photo-delete" data-name="${photoData.name}">삭제</button>
    `;
    container.appendChild(photoEl);
  }
}

// 초기화
const autoSaver = new SoopAutoSaver();
autoSaver.init();
```

### 6. 팝업 UI (popup/popup.html)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>방셀 헬퍼</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <header>
      <img src="../assets/logo.svg" alt="방셀 헬퍼" class="logo">
      <h1>방셀 헬퍼</h1>
    </header>

    <!-- 연결 대기 상태 -->
    <section id="waiting-section" class="section">
      <p class="description">모바일에서 QR코드를 스캔하세요</p>
      <div id="qrcode" class="qr-container"></div>
      <p class="room-code">코드: <span id="room-code">---</span></p>
      <button id="new-code-btn" class="btn-secondary">새 코드 생성</button>
    </section>

    <!-- 연결됨 상태 -->
    <section id="connected-section" class="section hidden">
      <div class="status-badge connected">
        <span class="status-dot"></span>
        모바일 연결됨
      </div>
      
      <div class="photos-grid" id="photos-grid">
        <!-- 수신된 사진들 표시 -->
      </div>
      
      <p id="photo-count">수신된 사진: 0장</p>
      
      <button id="disconnect-btn" class="btn-danger">연결 해제</button>
    </section>

    <!-- 저장된 초안 목록 -->
    <section id="drafts-section" class="section">
      <h2>저장된 방셀 초안</h2>
      <div id="drafts-list">
        <!-- 초안 목록 -->
      </div>
    </section>

    <footer>
      <a href="#" id="settings-link">설정</a>
      <a href="#" id="help-link">도움말</a>
    </footer>
  </div>

  <script src="../lib-vendor/qrcode.min.js"></script>
  <script src="../lib-vendor/firebase-app.js"></script>
  <script src="popup.js" type="module"></script>
</body>
</html>
```

### 7. Firebase 설정 (firebase/database.rules.json)

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        // 방 생성 후 1시간 뒤 자동 삭제를 위한 TTL 인덱스
        ".indexOn": ["createdAt"],
        
        // 누구나 읽기/쓰기 가능 (시그널링 목적)
        // 실제 서비스에서는 인증 추가 권장
        ".read": true,
        ".write": true,
        
        // 데이터 구조 검증
        "sender": {
          ".validate": "newData.hasChildren(['type', 'data', 'timestamp'])"
        },
        "receiver": {
          ".validate": "newData.hasChildren(['type', 'data', 'timestamp'])"
        }
      }
    }
  }
}
```

### 8. 모바일 PWA (mobile-pwa/index.html)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#7c3aed">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  
  <title>방셀 헬퍼</title>
  
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="assets/icons/icon-192.png">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="app-container">
    <!-- 연결 전 -->
    <section id="connect-section">
      <h1>📱 방셀 헬퍼</h1>
      <p>PC의 QR코드를 스캔하거나 코드를 입력하세요</p>
      
      <button id="scan-qr-btn" class="btn-primary">
        📷 QR코드 스캔
      </button>
      
      <div class="divider">또는</div>
      
      <input type="text" id="room-code-input" placeholder="코드 입력 (예: ABC-123)" maxlength="7">
      <button id="connect-btn" class="btn-secondary">연결하기</button>
    </section>

    <!-- QR 스캐너 -->
    <section id="scanner-section" class="hidden">
      <video id="scanner-video" autoplay playsinline></video>
      <button id="close-scanner-btn" class="btn-close">✕</button>
    </section>

    <!-- 연결됨 -->
    <section id="transfer-section" class="hidden">
      <div class="status-badge connected">
        <span class="status-dot"></span>
        PC와 연결됨
      </div>

      <div class="photo-actions">
        <button id="camera-btn" class="btn-large">
          📷<br>사진 촬영
        </button>
        <button id="gallery-btn" class="btn-large">
          🖼️<br>갤러리에서 선택
        </button>
      </div>

      <input type="file" id="file-input" accept="image/*,image/gif" multiple hidden>
      <input type="file" id="camera-input" accept="image/*" capture="environment" hidden>

      <!-- 선택된 사진 미리보기 -->
      <div id="selected-photos" class="photo-grid"></div>

      <!-- 전송 진행률 -->
      <div id="progress-container" class="hidden">
        <div class="progress-bar">
          <div id="progress-fill" class="progress-fill"></div>
        </div>
        <p id="progress-text">전송 중... 0%</p>
      </div>

      <button id="send-btn" class="btn-primary hidden">
        🚀 PC로 전송하기
      </button>

      <button id="disconnect-btn" class="btn-text">연결 해제</button>
    </section>
  </div>

  <script src="https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.0.0/firebase-database-compat.js"></script>
  <script src="app.js" type="module"></script>
</body>
</html>
```

---

## 🚀 개발 순서 (단계별)

### Phase 1: 기본 구조 (1일)
1. 프로젝트 초기 설정 (package.json, .gitignore)
2. 크롬 확장프로그램 manifest.json 작성
3. 기본 팝업 UI 구현
4. Firebase 프로젝트 생성 및 설정

### Phase 2: IndexedDB 저장 기능 (0.5일)
1. Dexie.js 설정
2. 초안(drafts) CRUD 구현
3. 사진(photos) CRUD 구현

### Phase 3: WebRTC P2P 연결 (1일)
1. 시그널링 로직 구현 (Firebase Realtime DB)
2. PC 수신측 (PhotoReceiver) 구현
3. 모바일 송신측 (PhotoSender) 구현
4. 청크 단위 파일 전송 구현

### Phase 4: SOOP 연동 (1일)
1. Content Script로 SOOP 에디터 감지
2. 실시간 자동 저장 구현
3. 초안 복구 UI 구현
4. 수신된 사진 삽입 기능

### Phase 5: 모바일 PWA (0.5일)
1. QR 스캔 기능
2. 카메라/갤러리 접근
3. 사진 선택 및 전송 UI
4. PWA 설정 (오프라인, 홈화면 추가)

### Phase 6: 테스트 및 배포 (1일)
1. 크롬 웹스토어 개발자 등록
2. 확장프로그램 패키징 및 제출
3. PWA GitHub Pages 배포
4. 사용자 가이드 문서 작성

---

## 🔐 보안 고려사항

1. **Firebase 보안 규칙**: 방 ID 기반 접근 제한, TTL 설정
2. **Room ID 생성**: 충분히 랜덤한 6자리 코드 (예: `ABC-123`)
3. **데이터 암호화**: WebRTC는 기본적으로 DTLS 암호화 적용
4. **자동 정리**: 사용 완료된 방 데이터 자동 삭제

---

## 📝 환경 변수 (.env.example)

```
# Firebase 설정
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
FIREBASE_PROJECT_ID=your_project_id

# PWA 배포 URL
PWA_URL=https://yourusername.github.io/bangsel-helper
```

---

## 🎯 개발 시작 명령어

```bash
# 1. 프로젝트 생성
mkdir bangsel-helper && cd bangsel-helper
git init

# 2. 기본 구조 생성
mkdir -p chrome-extension/{background,popup,content,lib,lib-vendor,assets/icons}
mkdir -p mobile-pwa/assets/icons
mkdir -p firebase docs .github/workflows

# 3. 패키지 초기화
npm init -y
npm install -D web-ext  # 크롬 확장 개발 도구

# 4. Firebase CLI (선택)
npm install -g firebase-tools
firebase login
firebase init database
```

---

이 명세서를 Claude Code에 전달하면 단계별로 개발을 진행할 수 있습니다.
시작하시겠습니까?
