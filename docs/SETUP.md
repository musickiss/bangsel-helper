# 방셀 헬퍼 설치 가이드

## 1. 사전 요구사항

- Node.js 18.0.0 이상
- Chrome 브라우저 (PC)
- Firebase 계정

---

## 2. Firebase 프로젝트 설정

### 2.1 Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력 (예: `bangsel-helper`)
4. Google Analytics는 선택 사항 (비활성화 권장)
5. 프로젝트 생성 완료

### 2.2 Realtime Database 활성화

1. 왼쪽 메뉴에서 "빌드" → "Realtime Database" 클릭
2. "데이터베이스 만들기" 클릭
3. 위치 선택 (아시아 권장: `asia-southeast1`)
4. **보안 규칙: "테스트 모드에서 시작"** 선택
5. 생성 완료

### 2.3 보안 규칙 적용

1. Realtime Database → "규칙" 탭
2. `firebase/database.rules.json` 파일의 내용을 복사하여 붙여넣기
3. "게시" 클릭

### 2.4 Firebase 설정 값 복사

1. 프로젝트 설정 (톱니바퀴 아이콘) → "일반" 탭
2. "내 앱" 섹션에서 웹 앱 추가 (</> 아이콘)
3. 앱 닉네임 입력 (예: `bangsel-helper-web`)
4. Firebase SDK 설정 값 복사:

```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

---

## 3. 프로젝트 설정

### 3.1 저장소 클론

```bash
git clone https://github.com/yourusername/bangsel-helper.git
cd bangsel-helper
```

### 3.2 의존성 설치

```bash
npm install
```

### 3.3 Firebase 설정 적용

다음 파일들의 `firebaseConfig` 객체를 수정하세요:

1. **크롬 확장프로그램**: `chrome-extension/lib/firebase-config.js`
2. **모바일 PWA**: `mobile-pwa/app.js`

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## 4. 크롬 확장프로그램 설치

### 4.1 외부 라이브러리 다운로드

`chrome-extension/lib-vendor/` 폴더에 다음 파일들을 추가:

1. **Dexie.js** (IndexedDB 래퍼)
   - https://unpkg.com/dexie@latest/dist/dexie.min.js
   - 저장: `dexie.min.js`

2. **QRCode.js** (QR 코드 생성)
   - https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js
   - 저장: `qrcode.min.js`

### 4.2 개발 모드로 확장프로그램 로드

1. Chrome에서 `chrome://extensions` 접속
2. 오른쪽 상단 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `chrome-extension` 폴더 선택
5. 확장프로그램이 목록에 추가됨

### 4.3 아이콘 파일 생성

`chrome-extension/assets/icons/` 폴더에 아이콘 파일 필요:
- `icon-16.png` (16x16)
- `icon-48.png` (48x48)
- `icon-128.png` (128x128)

---

## 5. 모바일 PWA 로컬 테스트

### 5.1 로컬 서버 실행

```bash
npm run serve:pwa
```

또는:

```bash
npx serve mobile-pwa -p 3000
```

### 5.2 모바일에서 접속

1. PC와 같은 네트워크에 연결
2. PC의 로컬 IP 주소 확인 (예: `192.168.0.100`)
3. 모바일 브라우저에서 `http://192.168.0.100:3000` 접속

**참고**: HTTPS가 아니면 카메라 API가 제한될 수 있습니다.

---

## 6. PWA 배포 (GitHub Pages)

### 6.1 GitHub 저장소 설정

1. GitHub에 저장소 생성
2. 코드 푸시
3. Settings → Pages → Source: "GitHub Actions" 선택

### 6.2 PWA URL 업데이트

배포 후 `chrome-extension/lib/utils.js`의 `PWA_BASE_URL` 수정:

```javascript
const PWA_BASE_URL = 'https://yourusername.github.io/bangsel-helper';
```

---

## 7. 문제 해결

### Firebase 연결 오류

- Firebase 설정 값이 올바른지 확인
- Realtime Database가 활성화되어 있는지 확인
- 보안 규칙이 적용되어 있는지 확인

### WebRTC 연결 오류

- 방화벽이 WebRTC를 차단하지 않는지 확인
- STUN 서버 접근이 가능한지 확인

### 카메라 접근 오류

- HTTPS 환경에서만 카메라 API 사용 가능
- 브라우저 권한 설정 확인

---

## 8. 다음 단계

- [사용법 가이드](USAGE.md) 참조
- 크롬 웹스토어 게시를 위해서는 개발자 등록 필요 ($5 일회성 비용)
