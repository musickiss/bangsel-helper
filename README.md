# 방셀 헬퍼 (Bangsel Helper)

SOOP(구 아프리카TV) 스트리머를 위한 방셀 작성 도우미 크롬 확장프로그램입니다.

## 핵심 기능

### 1. 모바일 → PC 사진 전송

- 휴대폰으로 촬영한 셀카를 PC로 **직접 전송** (P2P)
- 외부 서버를 거치지 않아 **빠르고 안전**
- QR 코드 스캔 또는 연결 코드 입력으로 간편 연결

### 2. 자동 저장

- 방셀 작성 중 **실시간 자동 백업**
- 브라우저 종료/충돌 시에도 내용 보존
- IndexedDB에 로컬 저장 (외부 전송 X)

### 3. 초안 복구

- 브라우저를 다시 열면 작성 중이던 내용 복구
- "이어서 작성하기" 또는 "새로 시작" 선택

## 기술 스택

- **Chrome Extension** (Manifest V3)
- **WebRTC DataChannel** (P2P 사진 전송)
- **IndexedDB** (Dexie.js 래퍼) (로컬 저장)
- **Firebase Realtime Database** (시그널링만)
- **PWA** (모바일 웹앱)

## 프로젝트 구조

```
bangsel-helper/
├── chrome-extension/          # 크롬 확장프로그램
│   ├── manifest.json
│   ├── background/            # 서비스 워커
│   ├── popup/                 # 팝업 UI
│   ├── content/               # SOOP 페이지 주입 스크립트
│   └── lib/                   # 공통 라이브러리
├── mobile-pwa/                # 모바일 PWA
│   ├── index.html
│   ├── app.js
│   └── ...
├── firebase/                  # Firebase 설정
└── docs/                      # 문서
```

## 설치 방법

### 1. Firebase 설정

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. Realtime Database 활성화
3. `firebase/database.rules.json`의 보안 규칙 적용

### 2. 설정 파일 수정

`chrome-extension/lib/firebase-config.js`와 `mobile-pwa/app.js`에서 Firebase 설정 수정:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  // ...
};
```

### 3. 외부 라이브러리 설치

`chrome-extension/lib-vendor/` 폴더에 추가:

- [dexie.min.js](https://unpkg.com/dexie@latest/dist/dexie.min.js)
- [qrcode.min.js](https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js)

### 4. 크롬 확장프로그램 로드

1. `chrome://extensions` 접속
2. 개발자 모드 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `chrome-extension` 폴더 선택

### 5. 모바일 PWA 배포

GitHub Pages로 자동 배포됩니다:

1. 저장소 Settings → Pages
2. Source: "GitHub Actions" 선택
3. main 브랜치에 푸시 시 자동 배포

## 사용 방법

자세한 사용 방법은 [사용 가이드](docs/USAGE.md)를 참조하세요.

## 보안

- **P2P 전송**: 사진은 서버를 거치지 않고 직접 전송
- **암호화**: WebRTC DTLS 암호화 기본 적용
- **로컬 저장**: 모든 데이터는 브라우저 로컬에만 저장
- **자동 삭제**: 7일 이상 된 데이터 자동 정리

## 라이선스

MIT License

## 기여

버그 리포트나 기능 제안은 Issues에 등록해주세요.
