/**
 * 카메라 및 갤러리 접근 모듈
 */

class CameraManager {
  constructor() {
    this.selectedFiles = [];
    this.maxFiles = 10;
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  }

  /**
   * 카메라로 사진 촬영
   * @returns {Promise<File[]>} 촬영된 사진 배열
   */
  async capturePhoto() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.capture = 'environment'; // 후면 카메라

      input.onchange = async (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          try {
            const validFiles = await this.validateAndProcessFiles(files);
            resolve(validFiles);
          } catch (error) {
            reject(error);
          }
        } else {
          resolve([]);
        }
      };

      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  /**
   * 갤러리에서 사진 선택
   * @returns {Promise<File[]>} 선택된 사진 배열
   */
  async selectFromGallery() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;

      input.onchange = async (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
          try {
            const validFiles = await this.validateAndProcessFiles(files);
            resolve(validFiles);
          } catch (error) {
            reject(error);
          }
        } else {
          resolve([]);
        }
      };

      input.oncancel = () => resolve([]);
      input.click();
    });
  }

  /**
   * 파일 유효성 검사 및 처리
   * @param {FileList} files - 파일 목록
   * @returns {Promise<File[]>} 유효한 파일 배열
   */
  async validateAndProcessFiles(files) {
    const validFiles = [];
    const errors = [];

    for (const file of files) {
      // 최대 개수 확인
      if (this.selectedFiles.length + validFiles.length >= this.maxFiles) {
        errors.push(`최대 ${this.maxFiles}개까지 선택할 수 있습니다.`);
        break;
      }

      // 파일 타입 확인
      if (!this.supportedTypes.includes(file.type)) {
        errors.push(`${file.name}: 지원하지 않는 파일 형식입니다.`);
        continue;
      }

      // 파일 크기 확인
      if (file.size > this.maxFileSize) {
        errors.push(`${file.name}: 파일 크기가 너무 큽니다. (최대 10MB)`);
        continue;
      }

      // 중복 확인
      const isDuplicate = this.selectedFiles.some(
        f => f.name === file.name && f.size === file.size
      );
      if (isDuplicate) {
        errors.push(`${file.name}: 이미 선택된 파일입니다.`);
        continue;
      }

      validFiles.push(file);
    }

    // 에러가 있으면 알림
    if (errors.length > 0) {
      console.warn('파일 검증 경고:', errors);
      // 첫 번째 에러만 표시
      if (validFiles.length === 0) {
        throw new Error(errors[0]);
      }
    }

    return validFiles;
  }

  /**
   * 파일 추가
   * @param {File[]} files - 추가할 파일 배열
   */
  addFiles(files) {
    this.selectedFiles.push(...files);
  }

  /**
   * 파일 제거
   * @param {number} index - 제거할 파일 인덱스
   */
  removeFile(index) {
    if (index >= 0 && index < this.selectedFiles.length) {
      this.selectedFiles.splice(index, 1);
    }
  }

  /**
   * 모든 파일 제거
   */
  clearFiles() {
    this.selectedFiles = [];
  }

  /**
   * 선택된 파일 목록 반환
   * @returns {File[]} 선택된 파일 배열
   */
  getSelectedFiles() {
    return this.selectedFiles;
  }

  /**
   * 파일 개수 반환
   * @returns {number} 선택된 파일 개수
   */
  getFileCount() {
    return this.selectedFiles.length;
  }

  /**
   * 이미지 미리보기 URL 생성
   * @param {File} file - 이미지 파일
   * @returns {string} Object URL
   */
  createPreviewUrl(file) {
    return URL.createObjectURL(file);
  }

  /**
   * 미리보기 URL 해제
   * @param {string} url - Object URL
   */
  revokePreviewUrl(url) {
    URL.revokeObjectURL(url);
  }

  /**
   * 이미지 압축 (필요시)
   * @param {File} file - 원본 파일
   * @param {Object} options - 압축 옵션
   * @returns {Promise<File>} 압축된 파일
   */
  async compressImage(file, options = {}) {
    const {
      maxWidth = 2048,
      maxHeight = 2048,
      quality = 0.85
    } = options;

    // GIF는 압축하지 않음
    if (file.type === 'image/gif') {
      return file;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          let { width, height } = img;

          // 리사이즈 필요 여부 확인
          if (width <= maxWidth && height <= maxHeight) {
            URL.revokeObjectURL(img.src);
            resolve(file); // 원본 반환
            return;
          }

          // 비율 계산
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);

          // Canvas에 그리기
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Blob으로 변환
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(img.src);

              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                });
                resolve(compressedFile);
              } else {
                reject(new Error('이미지 압축 실패'));
              }
            },
            'image/jpeg',
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

      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * 파일 크기 포맷팅
   * @param {number} bytes - 바이트
   * @returns {string} 포맷된 크기
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

// 전역으로 노출
window.CameraManager = CameraManager;
