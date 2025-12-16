/**
 * 이미지 유틸리티 함수들
 * 이미지 압축, 최적화, 변환 등
 */

// 최대 이미지 크기 (픽셀)
const MAX_IMAGE_DIMENSION = 2048;

// 최대 파일 크기 (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 썸네일 크기
const THUMBNAIL_SIZE = 200;

// 지원하는 이미지 타입
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/**
 * 이미지 압축 및 리사이즈
 * @param {Blob} blob - 원본 이미지 Blob
 * @param {Object} options - 옵션
 * @returns {Promise<Blob>} 압축된 이미지 Blob
 */
export async function compressImage(blob, options = {}) {
  const {
    maxWidth = MAX_IMAGE_DIMENSION,
    maxHeight = MAX_IMAGE_DIMENSION,
    quality = 0.85,
    type = 'image/jpeg'
  } = options;

  // GIF는 압축하지 않음 (애니메이션 유지)
  if (blob.type === 'image/gif') {
    return blob;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        let { width, height } = img;

        // 리사이즈 필요 여부 확인
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Canvas에 그리기
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');

        // 이미지 스무딩 품질 설정
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, 0, 0, width, height);

        // Blob으로 변환
        canvas.toBlob(
          (compressedBlob) => {
            URL.revokeObjectURL(img.src);

            if (compressedBlob) {
              resolve(compressedBlob);
            } else {
              reject(new Error('이미지 압축 실패'));
            }
          },
          type,
          quality
        );
      } catch (error) {
        URL.revokeObjectURL(img.src);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('이미지 로드 실패'));
    };

    img.src = URL.createObjectURL(blob);
  });
}

/**
 * 썸네일 생성
 * @param {Blob} blob - 원본 이미지 Blob
 * @param {number} size - 썸네일 크기 (기본 200px)
 * @returns {Promise<Blob>} 썸네일 Blob
 */
export async function createThumbnail(blob, size = THUMBNAIL_SIZE) {
  // GIF의 경우 첫 프레임만 사용
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');

        // 정사각형 크롭 또는 비율 유지
        const ratio = Math.min(size / img.width, size / img.height);
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (thumbnailBlob) => {
            URL.revokeObjectURL(img.src);
            resolve(thumbnailBlob);
          },
          'image/jpeg',
          0.7
        );
      } catch (error) {
        URL.revokeObjectURL(img.src);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('썸네일 생성 실패'));
    };

    img.src = URL.createObjectURL(blob);
  });
}

/**
 * 이미지 유효성 검사
 * @param {File|Blob} file - 검사할 파일
 * @returns {Object} 검증 결과 { valid: boolean, error?: string }
 */
export function validateImage(file) {
  // 파일 타입 검사
  if (!SUPPORTED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `지원하지 않는 이미지 형식입니다. (${SUPPORTED_TYPES.join(', ')} 만 지원)`
    };
  }

  // 파일 크기 검사
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `파일 크기가 너무 큽니다. (최대 ${MAX_FILE_SIZE / 1024 / 1024}MB)`
    };
  }

  return { valid: true };
}

/**
 * 이미지 메타데이터 읽기
 * @param {Blob} blob - 이미지 Blob
 * @returns {Promise<Object>} 메타데이터
 */
export async function getImageMetadata(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        aspectRatio: img.naturalWidth / img.naturalHeight,
        type: blob.type,
        size: blob.size
      });
      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('이미지 메타데이터 읽기 실패'));
    };

    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Blob을 Base64로 변환
 * @param {Blob} blob - 변환할 Blob
 * @returns {Promise<string>} Base64 데이터 URL
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Base64를 Blob으로 변환
 * @param {string} base64 - Base64 데이터 URL
 * @returns {Blob} 변환된 Blob
 */
export function base64ToBlob(base64) {
  try {
    const parts = base64.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; i++) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  } catch (error) {
    throw new Error('Base64 변환 실패');
  }
}

/**
 * 이미지 회전 (EXIF 기반)
 * @param {Blob} blob - 원본 이미지
 * @param {number} orientation - EXIF orientation 값
 * @returns {Promise<Blob>} 회전된 이미지
 */
export async function rotateImage(blob, orientation) {
  if (!orientation || orientation === 1) {
    return blob;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 회전에 따른 캔버스 크기 설정
        if (orientation >= 5 && orientation <= 8) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }

        // 변환 적용
        switch (orientation) {
          case 2:
            ctx.transform(-1, 0, 0, 1, canvas.width, 0);
            break;
          case 3:
            ctx.transform(-1, 0, 0, -1, canvas.width, canvas.height);
            break;
          case 4:
            ctx.transform(1, 0, 0, -1, 0, canvas.height);
            break;
          case 5:
            ctx.transform(0, 1, 1, 0, 0, 0);
            break;
          case 6:
            ctx.transform(0, 1, -1, 0, canvas.width, 0);
            break;
          case 7:
            ctx.transform(0, -1, -1, 0, canvas.width, canvas.height);
            break;
          case 8:
            ctx.transform(0, -1, 1, 0, 0, canvas.height);
            break;
        }

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (rotatedBlob) => {
            URL.revokeObjectURL(img.src);
            resolve(rotatedBlob);
          },
          blob.type,
          0.92
        );
      } catch (error) {
        URL.revokeObjectURL(img.src);
        reject(error);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('이미지 회전 실패'));
    };

    img.src = URL.createObjectURL(blob);
  });
}

// 모듈 내보내기
export default {
  compressImage,
  createThumbnail,
  validateImage,
  getImageMetadata,
  blobToBase64,
  base64ToBlob,
  rotateImage,
  MAX_IMAGE_DIMENSION,
  MAX_FILE_SIZE,
  THUMBNAIL_SIZE,
  SUPPORTED_TYPES
};

// 전역 변수로 노출
window.BangselImageUtils = {
  compressImage,
  createThumbnail,
  validateImage,
  getImageMetadata,
  blobToBase64,
  base64ToBlob,
  rotateImage
};
