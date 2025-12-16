/**
 * Background Service Worker
 * 확장 프로그램의 백그라운드 작업 처리
 */

// 확장 프로그램 설치/업데이트 시
chrome.runtime.onInstalled.addListener((details) => {
  console.log('방셀 헬퍼 설치됨:', details.reason);

  if (details.reason === 'install') {
    // 최초 설치 시 환영 페이지 표시 (선택적)
    // chrome.tabs.create({ url: 'welcome.html' });
  }
});

// 메시지 리스너 (팝업/컨텐츠 스크립트 간 통신)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case 'GET_ACTIVE_SESSION':
      // 현재 활성 세션 정보 반환
      getActiveSession().then(sendResponse);
      return true; // 비동기 응답을 위해 true 반환

    case 'PHOTO_RECEIVED':
      // 사진 수신 알림을 활성 탭에 전달
      forwardPhotoToActiveTab(message.photo, sender).then(sendResponse);
      return true;

    case 'CLEAR_OLD_DATA':
      // 오래된 데이터 정리
      cleanupOldData().then(sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// 활성 세션 정보 가져오기
async function getActiveSession() {
  try {
    const result = await chrome.storage.local.get('activeSession');
    return result.activeSession || null;
  } catch (error) {
    console.error('세션 조회 실패:', error);
    return null;
  }
}

// 사진을 활성 SOOP 탭에 전달
async function forwardPhotoToActiveTab(photo, sender) {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://www.sooplive.co.kr/*', '*://ch.sooplive.co.kr/*']
    });

    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'PHOTO_RECEIVED',
          photo: photo
        });
      } catch (e) {
        // 컨텐츠 스크립트가 로드되지 않은 탭은 무시
        console.log(`Tab ${tab.id} not ready for messages`);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('사진 전달 실패:', error);
    return { error: error.message };
  }
}

// 오래된 데이터 정리 (7일 이상)
async function cleanupOldData() {
  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // IndexedDB는 content script에서 처리하므로
    // 여기서는 storage.local만 정리
    const result = await chrome.storage.local.get(null);
    const keysToRemove = [];

    for (const [key, value] of Object.entries(result)) {
      if (value && value.createdAt && value.createdAt < sevenDaysAgo) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`정리된 항목: ${keysToRemove.length}개`);
    }

    return { cleaned: keysToRemove.length };
  } catch (error) {
    console.error('데이터 정리 실패:', error);
    return { error: error.message };
  }
}

// 주기적 정리 작업 (매일 1회)
chrome.alarms.create('dailyCleanup', {
  periodInMinutes: 24 * 60 // 24시간
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyCleanup') {
    cleanupOldData();
  }
});
