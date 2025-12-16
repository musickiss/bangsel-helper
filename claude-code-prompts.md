# Claude Code 시작 프롬프트

아래 텍스트를 Claude Code에 붙여넣어서 개발을 시작하세요.

---

## 🚀 첫 번째 프롬프트 (프로젝트 초기화)

```
방셀 헬퍼(Bangsel Helper) 크롬 확장프로그램을 개발하려고 해.

## 프로젝트 개요
SOOP(구 아프리카TV) 스트리머들이 "방셀"(방송 셀카 + 감사글)을 작성할 때 글과 사진이 소실되지 않도록 도와주는 크롬 확장프로그램이야.

## 핵심 기능
1. 모바일에서 PC로 사진 직접 전송 (WebRTC P2P, 서버 거치지 않음)
2. 글 작성 중 자동 저장 (IndexedDB)
3. 브라우저 종료 후에도 내용 복구

## 기술 스택
- Chrome Extension Manifest V3
- IndexedDB (Dexie.js 래퍼)
- WebRTC DataChannel (P2P)
- Firebase Realtime DB (시그널링만)
- 모바일 PWA (Vanilla JS)

## 프로젝트 구조
bangsel-helper/
├── chrome-extension/
│   ├── manifest.json
│   ├── background/service-worker.js
│   ├── popup/
│   ├── content/soop-content.js
│   └── lib/
├── mobile-pwa/
│   ├── index.html
│   ├── app.js
│   └── webrtc-sender.js
└── firebase/

지금 Phase 1부터 시작해서 프로젝트 기본 구조를 만들어줘.
1. package.json 생성
2. 크롬 확장프로그램 manifest.json 작성
3. 기본 팝업 UI (popup.html, popup.css, popup.js) 구현
4. .gitignore 설정
```

---

## 🔧 두 번째 프롬프트 (IndexedDB 구현)

```
Phase 2: IndexedDB 저장 기능을 구현해줘.

1. lib/db.js 파일 생성
   - Dexie.js를 사용해서 IndexedDB 관리
   - drafts 테이블: id, boardUrl, title, content, photoIds[], createdAt, updatedAt, status
   - photos 테이블: id, draftId, name, type, size, data(Blob), thumbnail, createdAt

2. CRUD 함수 구현
   - saveDraft(draft): 초안 저장/업데이트
   - getDraft(boardUrl): URL로 초안 조회
   - deleteDraft(id): 초안 삭제
   - savePhoto(draftId, photoData): 사진 저장
   - getPhotos(draftId): 초안의 사진 목록
   - deletePhoto(id): 사진 삭제

lib-vendor 폴더에 dexie.min.js도 다운로드해줘.
```

---

## 🌐 세 번째 프롬프트 (WebRTC 구현)

```
Phase 3: WebRTC P2P 연결을 구현해줘.

1. lib/firebase-config.js
   - Firebase 초기화 설정
   - Realtime DB 참조 함수

2. lib/webrtc-receiver.js (PC 크롬 확장에서 실행)
   - PhotoReceiver 클래스
   - RTCPeerConnection 설정 (STUN 서버)
   - DataChannel로 사진 수신
   - 청크 데이터 조립 → Blob 생성
   - Firebase 시그널링 (offer/answer/ICE candidate 교환)

3. mobile-pwa/webrtc-sender.js (모바일에서 실행)
   - PhotoSender 클래스
   - DataChannel 생성
   - 파일을 16KB 청크로 분할 전송
   - 진행률 콜백 지원

4. 6자리 Room ID 생성 함수 (예: "ABC-123")
```

---

## 📝 네 번째 프롬프트 (SOOP 연동)

```
Phase 4: SOOP 게시판 연동 Content Script를 구현해줘.

content/soop-content.js에서:

1. SOOP 에디터 자동 감지
   - MutationObserver로 에디터 요소 찾기
   - 선택자: .fr-element.fr-view 또는 [contenteditable="true"]

2. 실시간 자동 저장
   - input 이벤트마다 debounce 500ms로 IndexedDB 저장
   - 저장 완료 시 "✓ 자동 저장됨" 인디케이터 표시

3. 초안 복구 기능
   - 페이지 로드 시 기존 초안 확인
   - 복구 모달: "저장된 방셀 초안이 있습니다" + 미리보기
   - "이어서 작성하기" / "새로 시작" 버튼

4. 수신된 사진 표시
   - chrome.runtime.onMessage로 사진 수신 알림 받기
   - 사진 미리보기 그리드 표시
   - "삽입" 버튼으로 에디터에 이미지 추가

content/soop-content.css도 함께 작성해줘.
```

---

## 📱 다섯 번째 프롬프트 (모바일 PWA)

```
Phase 5: 모바일 PWA를 완성해줘.

mobile-pwa/ 폴더에:

1. index.html
   - 연결 전: QR 스캔 버튼, 코드 입력 필드
   - 연결 후: 사진 촬영/갤러리 선택 버튼
   - 선택된 사진 미리보기 그리드
   - 전송 진행률 바

2. app.js
   - QR 스캐너 (jsQR 라이브러리 또는 BarcodeDetector API)
   - 카메라 접근 (MediaDevices API)
   - 파일 선택 (File API)
   - WebRTC 연결 및 전송

3. style.css
   - 모바일 친화적 UI
   - 다크 테마 (보라-핑크 그라데이션)
   - 터치 친화적 큰 버튼

4. manifest.json (PWA)
   - name, short_name, icons
   - start_url, display: standalone
   - theme_color, background_color

5. sw.js (Service Worker)
   - 정적 자원 캐싱
   - 오프라인 지원
```

---

## 🚢 여섯 번째 프롬프트 (배포 설정)

```
Phase 6: 배포 설정을 해줘.

1. .github/workflows/deploy-pwa.yml
   - main 브랜치 push 시 자동 배포
   - GitHub Pages로 mobile-pwa 폴더 배포

2. firebase/database.rules.json
   - rooms/$roomId 읽기/쓰기 허용
   - 데이터 구조 검증 규칙

3. docs/SETUP.md
   - Firebase 프로젝트 생성 방법
   - 환경 변수 설정 (.env)
   - 로컬 개발 실행 방법

4. docs/USAGE.md
   - 스트리머용 사용 가이드
   - 스크린샷 포함 단계별 설명

5. README.md 업데이트
   - 프로젝트 소개
   - 주요 기능
   - 설치 방법
   - 라이선스
```

---

## 💡 추가 팁

Claude Code에서 개발할 때 유용한 명령어:

```bash
# 크롬 확장프로그램 로드 테스트
# chrome://extensions → 개발자 모드 → 압축해제된 확장 프로그램 로드

# 모바일 PWA 로컬 테스트
npx serve mobile-pwa -p 3000

# Firebase 에뮬레이터 (선택)
firebase emulators:start --only database
```

---

이 프롬프트들을 순서대로 Claude Code에 전달하면서 개발을 진행하세요!
