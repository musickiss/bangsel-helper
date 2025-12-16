/**
 * Firebase 설정 및 초기화
 * 시그널링 서버로 Firebase Realtime Database 사용
 */

(function() {
  'use strict';

  // Firebase 설정
  var firebaseConfig = {
    apiKey: "AIzaSyDUVu0ixcp4D8aOVSpDe_CiaiMBzaujhyY",
    authDomain: "bangsel-helper.firebaseapp.com",
    databaseURL: "https://bangsel-helper-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bangsel-helper",
    storageBucket: "bangsel-helper.firebasestorage.app",
    messagingSenderId: "686580911050",
    appId: "1:686580911050:web:5f1520c56029ce2cc71d33",
    measurementId: "G-89K836YMRH"
  };

  // Firebase 인스턴스 (전역)
  var firebaseApp = null;
  var database = null;

  /**
   * Firebase 초기화
   */
  function initializeFirebase() {
    if (firebaseApp) {
      return { app: firebaseApp, database: database };
    }

    // Firebase가 이미 로드되었는지 확인
    if (typeof firebase !== 'undefined') {
      // Compat 버전 사용 (CDN으로 로드된 경우)
      if (!firebase.apps.length) {
        firebaseApp = firebase.initializeApp(firebaseConfig);
      } else {
        firebaseApp = firebase.app();
      }
      database = firebase.database();
      console.log('[방셀 헬퍼] Firebase 초기화 완료');
    } else {
      console.error('[방셀 헬퍼] Firebase SDK가 로드되지 않았습니다.');
      throw new Error('Firebase SDK not loaded');
    }

    return { app: firebaseApp, database: database };
  }

  /**
   * 데이터베이스 참조 가져오기
   */
  function getRef(path) {
    if (!database) {
      initializeFirebase();
    }
    return database.ref(path);
  }

  /**
   * 방(Room) 생성
   */
  function createRoom(roomId) {
    return new Promise(function(resolve, reject) {
      var roomRef = getRef('rooms/' + roomId);

      var roomData = {
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        status: 'waiting'
      };

      roomRef.set(roomData)
        .then(function() {
          console.log('[방셀 헬퍼] 방 생성됨:', roomId);

          // 1시간 후 자동 삭제
          setTimeout(function() {
            roomRef.remove().catch(function() {
              // 이미 삭제되었을 수 있음
            });
          }, 60 * 60 * 1000);

          resolve({ roomId: roomId, createdAt: Date.now(), status: 'waiting' });
        })
        .catch(function(error) {
          console.error('[방셀 헬퍼] 방 생성 실패:', error);
          reject(error);
        });
    });
  }

  /**
   * 방에 시그널링 데이터 전송
   */
  function sendSignal(roomId, role, data) {
    return new Promise(function(resolve, reject) {
      var signalRef = getRef('rooms/' + roomId + '/' + role);

      var signalData = Object.assign({}, data, {
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      signalRef.push(signalData)
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * 시그널링 데이터 리스닝
   */
  function listenToSignals(roomId, targetRole, callback) {
    var signalRef = getRef('rooms/' + roomId + '/' + targetRole);

    var onChildAdded = function(snapshot) {
      var data = snapshot.val();
      if (data) {
        callback(data);
      }
    };

    signalRef.on('child_added', onChildAdded);

    // unsubscribe 함수 반환
    return function() {
      signalRef.off('child_added', onChildAdded);
    };
  }

  /**
   * 방 삭제 (연결 종료 시)
   */
  function deleteRoom(roomId) {
    return new Promise(function(resolve, reject) {
      var roomRef = getRef('rooms/' + roomId);
      roomRef.remove()
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * 방 존재 여부 확인
   */
  function roomExists(roomId) {
    return new Promise(function(resolve, reject) {
      var roomRef = getRef('rooms/' + roomId);
      roomRef.once('value')
        .then(function(snapshot) {
          resolve(snapshot.exists());
        })
        .catch(reject);
    });
  }

  /**
   * Firebase 연결 상태 모니터링
   */
  function monitorConnection(callback) {
    var connectedRef = getRef('.info/connected');

    var onValue = function(snapshot) {
      callback(snapshot.val() === true);
    };

    connectedRef.on('value', onValue);

    return function() {
      connectedRef.off('value', onValue);
    };
  }

  // 전역 변수로 노출
  window.BangselFirebase = {
    config: firebaseConfig,
    initializeFirebase: initializeFirebase,
    getRef: getRef,
    createRoom: createRoom,
    sendSignal: sendSignal,
    listenToSignals: listenToSignals,
    deleteRoom: deleteRoom,
    roomExists: roomExists,
    monitorConnection: monitorConnection
  };

  console.log('[방셀 헬퍼] Firebase 모듈 로드 완료');
})();
