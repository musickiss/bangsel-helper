/**
 * IndexedDB 관리 (Dexie.js 래퍼)
 * 초안 및 사진 데이터 저장
 */

// Dexie.js가 lib-vendor에서 로드됨
// content script와 popup에서 모두 사용 가능

(function() {
  'use strict';

  // Dexie가 로드되었는지 확인
  if (typeof Dexie === 'undefined') {
    console.error('[방셀 헬퍼] Dexie.js가 로드되지 않았습니다.');
    return;
  }

  // 데이터베이스 인스턴스 생성
  const db = new Dexie('BangselHelperDB');

  // 스키마 정의
  db.version(1).stores({
    drafts: '++id, boardUrl, createdAt, updatedAt, status',
    photos: '++id, draftId, name, type, size, createdAt',
    sessions: 'roomId, createdAt, lastActivity'
  });

  /**
   * 초안 저장 또는 업데이트
   */
  async function saveDraft(draft) {
    const now = Date.now();

    if (draft.id) {
      await db.drafts.update(draft.id, {
        ...draft,
        updatedAt: now
      });
      return draft.id;
    } else {
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
   */
  async function getDraftById(id) {
    return await db.drafts.get(id);
  }

  /**
   * 모든 초안 목록 조회
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
   */
  async function deleteDraft(id) {
    await db.photos.where('draftId').equals(id).delete();
    await db.drafts.delete(id);
  }

  /**
   * 초안 상태 업데이트
   */
  async function updateDraftStatus(id, status) {
    await db.drafts.update(id, {
      status,
      updatedAt: Date.now()
    });
  }

  /**
   * 사진 저장
   */
  async function savePhoto(draftId, photoData) {
    const photoId = await db.photos.add({
      draftId,
      name: photoData.name,
      type: photoData.type,
      size: photoData.size,
      data: photoData.data,
      thumbnail: photoData.thumbnail,
      createdAt: Date.now()
    });

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
   */
  async function getPhotosByDraftId(draftId) {
    return await db.photos
      .where('draftId')
      .equals(draftId)
      .toArray();
  }

  /**
   * ID로 사진 조회
   */
  async function getPhotoById(id) {
    return await db.photos.get(id);
  }

  /**
   * 사진 삭제
   */
  async function deletePhoto(id) {
    const photo = await db.photos.get(id);
    if (photo) {
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
   * 세션 저장
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

    const oldDrafts = await db.drafts
      .where('updatedAt')
      .below(sevenDaysAgo)
      .toArray();

    for (const draft of oldDrafts) {
      await deleteDraft(draft.id);
    }

    await cleanupOldSessions();

    return oldDrafts.length;
  }

  /**
   * 썸네일 생성
   */
  async function createThumbnail(blob, maxSize) {
    maxSize = maxSize || 200;
    return new Promise(function(resolve, reject) {
      var img = new Image();

      img.onload = function() {
        try {
          var canvas = document.createElement('canvas');
          var scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            function(thumbnailBlob) {
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

      img.onerror = function() {
        URL.revokeObjectURL(img.src);
        reject(new Error('이미지 로드 실패'));
      };

      img.src = URL.createObjectURL(blob);
    });
  }

  /**
   * Base64를 Blob으로 변환
   */
  function base64ToBlob(base64) {
    var parts = base64.split(';base64,');
    var contentType = parts[0].split(':')[1];
    var raw = window.atob(parts[1]);
    var rawLength = raw.length;
    var uInt8Array = new Uint8Array(rawLength);

    for (var i = 0; i < rawLength; i++) {
      uInt8Array[i] = raw.charCodeAt(i);
    }

    return new Blob([uInt8Array], { type: contentType });
  }

  // 전역 변수로 노출
  window.BangselDB = {
    db: db,
    saveDraft: saveDraft,
    getDraftByUrl: getDraftByUrl,
    getDraftById: getDraftById,
    getAllDrafts: getAllDrafts,
    deleteDraft: deleteDraft,
    updateDraftStatus: updateDraftStatus,
    savePhoto: savePhoto,
    getPhotosByDraftId: getPhotosByDraftId,
    getPhotoById: getPhotoById,
    deletePhoto: deletePhoto,
    saveSession: saveSession,
    updateSessionActivity: updateSessionActivity,
    cleanupOldSessions: cleanupOldSessions,
    cleanupOldData: cleanupOldData,
    createThumbnail: createThumbnail,
    base64ToBlob: base64ToBlob
  };

  console.log('[방셀 헬퍼] DB 모듈 로드 완료');
})();
