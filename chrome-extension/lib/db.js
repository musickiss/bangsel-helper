/**
 * IndexedDB 관리 (Dexie.js 래퍼)
 * 초안 및 사진 데이터 저장
 */

// Dexie.js가 lib-vendor에서 로드됨
// content script와 popup에서 모두 사용 가능

// 전역 Dexie 객체 확인 (content script에서는 전역으로 로드됨)
const Dexie = window.Dexie;

// 데이터베이스 인스턴스 생성
const db = new Dexie('BangselHelperDB');

// 스키마 정의
db.version(1).stores({
  // 방셀 초안 저장
  // ++id: 자동 증가 기본 키
  // boardUrl, createdAt, updatedAt, status: 인덱스
  drafts: '++id, boardUrl, createdAt, updatedAt, status',

  // 수신된 사진 저장
  // draftId로 초안과 연결
  photos: '++id, draftId, name, type, size, createdAt',

  // 연결 세션 정보
  sessions: 'roomId, createdAt, lastActivity'
});

/**
 * 초안 관련 함수들
 */

/**
 * 초안 저장 또는 업데이트
 * @param {Object} draft - 초안 데이터
 * @returns {Promise<number>} 저장된 초안의 ID
 */
async function saveDraft(draft) {
  const now = Date.now();

  if (draft.id) {
    // 기존 초안 업데이트
    await db.drafts.update(draft.id, {
      ...draft,
      updatedAt: now
    });
    return draft.id;
  } else {
    // 새 초안 생성
    return await db.drafts.add({
      boardUrl: draft.boardUrl || '',
      title: draft.title || '',
      content: draft.content || '',
      photoIds: draft.photoIds || [],
      createdAt: now,
      updatedAt: now,
      status: draft.status || 'draft'
    });
  }
}

/**
 * URL로 초안 조회
 * @param {string} boardUrl - 게시판 URL
 * @returns {Promise<Object|undefined>} 초안 데이터
 */
async function getDraftByUrl(boardUrl) {
  return await db.drafts
    .where('boardUrl')
    .equals(boardUrl)
    .and(draft => draft.status === 'draft')
    .first();
}

/**
 * ID로 초안 조회
 * @param {number} id - 초안 ID
 * @returns {Promise<Object|undefined>} 초안 데이터
 */
async function getDraftById(id) {
  return await db.drafts.get(id);
}

/**
 * 모든 초안 목록 조회
 * @returns {Promise<Array>} 초안 배열
 */
async function getAllDrafts() {
  return await db.drafts
    .where('status')
    .equals('draft')
    .reverse()
    .sortBy('updatedAt');
}

/**
 * 초안 삭제
 * @param {number} id - 초안 ID
 */
async function deleteDraft(id) {
  // 연결된 사진도 함께 삭제
  await db.photos.where('draftId').equals(id).delete();
  await db.drafts.delete(id);
}

/**
 * 초안 상태 업데이트
 * @param {number} id - 초안 ID
 * @param {string} status - 새 상태 ('draft' | 'uploading' | 'completed')
 */
async function updateDraftStatus(id, status) {
  await db.drafts.update(id, {
    status,
    updatedAt: Date.now()
  });
}

/**
 * 사진 관련 함수들
 */

/**
 * 사진 저장
 * @param {number} draftId - 연결할 초안 ID
 * @param {Object} photoData - 사진 데이터 (name, type, size, data, thumbnail)
 * @returns {Promise<number>} 저장된 사진의 ID
 */
async function savePhoto(draftId, photoData) {
  const photoId = await db.photos.add({
    draftId,
    name: photoData.name,
    type: photoData.type,
    size: photoData.size,
    data: photoData.data, // Blob
    thumbnail: photoData.thumbnail, // Blob (미리보기용)
    createdAt: Date.now()
  });

  // 초안의 photoIds 배열에 추가
  const draft = await db.drafts.get(draftId);
  if (draft) {
    await db.drafts.update(draftId, {
      photoIds: [...(draft.photoIds || []), photoId],
      updatedAt: Date.now()
    });
  }

  return photoId;
}

/**
 * 초안의 모든 사진 조회
 * @param {number} draftId - 초안 ID
 * @returns {Promise<Array>} 사진 배열
 */
async function getPhotosByDraftId(draftId) {
  return await db.photos
    .where('draftId')
    .equals(draftId)
    .toArray();
}

/**
 * ID로 사진 조회
 * @param {number} id - 사진 ID
 * @returns {Promise<Object|undefined>} 사진 데이터
 */
async function getPhotoById(id) {
  return await db.photos.get(id);
}

/**
 * 사진 삭제
 * @param {number} id - 사진 ID
 */
async function deletePhoto(id) {
  const photo = await db.photos.get(id);
  if (photo) {
    // 초안의 photoIds 배열에서 제거
    const draft = await db.drafts.get(photo.draftId);
    if (draft) {
      await db.drafts.update(photo.draftId, {
        photoIds: (draft.photoIds || []).filter(pid => pid !== id),
        updatedAt: Date.now()
      });
    }
  }
  await db.photos.delete(id);
}

/**
 * 세션 관련 함수들
 */

/**
 * 세션 저장
 * @param {string} roomId - 방 ID
 * @returns {Promise<string>} 저장된 roomId
 */
async function saveSession(roomId) {
  await db.sessions.put({
    roomId,
    createdAt: Date.now(),
    lastActivity: Date.now()
  });
  return roomId;
}

/**
 * 세션 활동 시간 업데이트
 * @param {string} roomId - 방 ID
 */
async function updateSessionActivity(roomId) {
  await db.sessions.update(roomId, {
    lastActivity: Date.now()
  });
}

/**
 * 오래된 세션 정리 (1시간 이상)
 */
async function cleanupOldSessions() {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  await db.sessions
    .where('lastActivity')
    .below(oneHourAgo)
    .delete();
}

/**
 * 오래된 데이터 정리 (7일 이상)
 */
async function cleanupOldData() {
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  // 완료된 오래된 초안 삭제
  const oldDrafts = await db.drafts
    .where('updatedAt')
    .below(sevenDaysAgo)
    .toArray();

  for (const draft of oldDrafts) {
    await deleteDraft(draft.id);
  }

  // 오래된 세션 정리
  await cleanupOldSessions();

  return oldDrafts.length;
}

/**
 * 이미지 유틸리티
 */

/**
 * 썸네일 생성
 * @param {Blob} blob - 원본 이미지 Blob
 * @param {number} maxSize - 최대 크기 (기본 200px)
 * @returns {Promise<Blob>} 썸네일 Blob
 */
async function createThumbnail(blob, maxSize = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

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
      reject(new Error('이미지 로드 실패'));
    };

    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Base64를 Blob으로 변환
 * @param {string} base64 - Base64 인코딩된 데이터 URL
 * @returns {Blob} 변환된 Blob
 */
function base64ToBlob(base64) {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; i++) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}

// 모듈 내보내기 (ES Module 방식)
// content script에서 전역 변수로 사용하기 위해 window에도 할당
const dbModule = {
  db,
  saveDraft,
  getDraftByUrl,
  getDraftById,
  getAllDrafts,
  deleteDraft,
  updateDraftStatus,
  savePhoto,
  getPhotosByDraftId,
  getPhotoById,
  deletePhoto,
  saveSession,
  updateSessionActivity,
  cleanupOldSessions,
  cleanupOldData,
  createThumbnail,
  base64ToBlob
};

// 전역 변수로 노출 (content script에서 사용)
window.BangselDB = dbModule;

// ES Module export (popup.js 등에서 사용)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = dbModule;
}

// default export
export default db;
export {
  saveDraft,
  getDraftByUrl,
  getDraftById,
  getAllDrafts,
  deleteDraft,
  updateDraftStatus,
  savePhoto,
  getPhotosByDraftId,
  getPhotoById,
  deletePhoto,
  saveSession,
  updateSessionActivity,
  cleanupOldSessions,
  cleanupOldData,
  createThumbnail,
  base64ToBlob
};
