/**
 * 유틸리티 함수들
 */

// PWA URL (GitHub Pages 배포 시 변경 필요)
const PWA_BASE_URL = 'https://yourusername.github.io/bangsel-helper';

/**
 * 랜덤 Room ID 생성 (예: ABC-123)
 * 충분한 엔트로피를 가진 안전한 랜덤 ID
 */
export function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 혼동하기 쉬운 I, O 제외
  const nums = '23456789'; // 혼동하기 쉬운 0, 1 제외

  let id = '';

  // 암호학적으로 안전한 랜덤 값 사용
  const randomValues = new Uint32Array(6);
  crypto.getRandomValues(randomValues);

  // 문자 3개
  for (let i = 0; i < 3; i++) {
    id += chars[randomValues[i] % chars.length];
  }

  id += '-';

  // 숫자 3개
  for (let i = 3; i < 6; i++) {
    id += nums[randomValues[i] % nums.length];
  }

  return id;
}

/**
 * QR 코드에 포함할 URL 생성
 */
export function generateQRCodeUrl(roomId) {
  // 개발 중에는 localhost 사용, 배포 시 PWA URL로 변경
  const baseUrl = getPWAUrl();
  return `${baseUrl}?room=${encodeURIComponent(roomId)}`;
}

/**
 * PWA URL 가져오기
 */
export function getPWAUrl() {
  // 개발 모드 감지
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    // 확장 프로그램 컨텍스트
    return PWA_BASE_URL;
  }
  return window.location.origin;
}

/**
 * Room ID 유효성 검증
 */
export function isValidRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') {
    return false;
  }
  // ABC-123 형식 검증
  const pattern = /^[A-Z]{3}-[0-9]{3}$/;
  return pattern.test(roomId);
}

/**
 * 파일 크기 포맷팅
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 타임스탬프 포맷팅
 */
export function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * 디바운스 함수
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 안전한 JSON 파싱
 */
export function safeJsonParse(str, defaultValue = null) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}

/**
 * HTML 이스케이프 (XSS 방지)
 */
export function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * URL 안전성 검증
 */
export function isSafeUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // HTTPS만 허용
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
