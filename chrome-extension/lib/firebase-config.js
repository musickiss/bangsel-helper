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
    console.log('[방셀 헬퍼] Firebase 초기화 시작...');

    if (firebaseApp && database) {
      console.log('[방셀 헬퍼] Firebase 이미 초기화됨');
      return { app: firebaseApp, database: database };
    }

    // Firebase SDK 로드 확인
    if (typeof firebase === 'undefined') {
      console.error('[방셀 헬퍼] Firebase SDK가 로드되지 않았습니다. typeof firebase:', typeof firebase);
      throw new Error('Firebase SDK not loaded');
    }

    console.log('[방셀 헬퍼] Firebase SDK 발견:', firebase.SDK_VERSION || 'version unknown');
    console.log('[방셀 헬퍼] 사용할 databaseURL:', firebaseConfig.databaseURL);

    try {
      // Firebase 앱 초기화
      if (!firebase.apps || firebase.apps.length === 0) {
        console.log('[방셀 헬퍼] Firebase 앱 초기화 중...');
        firebaseApp = firebase.initializeApp(firebaseConfig);
        console.log('[방셀 헬퍼] Firebase 앱 초기화 완료');
      } else {
        console.log('[방셀 헬퍼] 기존 Firebase 앱 사용');
        firebaseApp = firebase.app();
      }

      // Database 초기화
      if (typeof firebase.database !== 'function') {
        console.error('[방셀 헬퍼] firebase.database가 함수가 아닙니다. Firebase Database SDK가 로드되지 않았을 수 있습니다.');
        throw new Error('Firebase Database SDK not loaded');
      }

      database = firebase.database();
      console.log('[방셀 헬퍼] Firebase Database 초기화 완료');
      console.log('[방셀 헬퍼] Database 객체:', database ? 'OK' : 'NULL');

    } catch (error) {
      console.error('[방셀 헬퍼] Firebase 초기화 중 오류:', error);
      throw error;
    }

    return { app: firebaseApp, database: database };
  }

  /**
   * 데이터베이스 참조 가져오기
   */
  function getRef(path) {
    if (!database) {
      console.log('[방셀 헬퍼] Database가 없어 초기화 시도');
      initializeFirebase();
    }

    if (!database) {
      console.error('[방셀 헬퍼] Database 초기화 실패');
      throw new Error('Database not initialized');
    }

    return database.ref(path);
  }

  /**
   * 방(Room) 생성
   */
  function createRoom(roomId) {
    console.log('[방셀 헬퍼] createRoom 호출됨, roomId:', roomId);

    return new Promise(function(resolve, reject) {
      try {
        var roomRef = getRef('rooms/' + roomId);
        console.log('[방셀 헬퍼] roomRef 생성됨:', roomRef.toString());

        var roomData = {
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          status: 'waiting'
        };

        console.log('[방셀 헬퍼] roomData:', JSON.stringify(roomData));
        console.log('[방셀 헬퍼] Firebase set() 호출 시작...');

        roomRef.set(roomData)
          .then(function() {
            console.log('[방셀 헬퍼] Firebase set() 성공! 방 생성됨:', roomId);

            // 1시간 후 자동 삭제
            setTimeout(function() {
              roomRef.remove().catch(function(err) {
                console.log('[방셀 헬퍼] 자동 삭제 실패 (이미 삭제됨):', err.message);
              });
            }, 60 * 60 * 1000);

            resolve({ roomId: roomId, createdAt: Date.now(), status: 'waiting' });
          })
          .catch(function(error) {
            console.error('[방셀 헬퍼] Firebase set() 실패!');
            console.error('[방셀 헬퍼] Error code:', error.code);
            console.error('[방셀 헬퍼] Error message:', error.message);
            console.error('[방셀 헬퍼] Full error:', error);
            reject(error);
          });

      } catch (error) {
        console.error('[방셀 헬퍼] createRoom 예외 발생:', error);
        reject(error);
      }
    });
  }

  /**
   * 방에 시그널링 데이터 전송
   */
  function sendSignal(roomId, role, data) {
    return new Promise(function(resolve, reject) {
      try {
        var signalRef = getRef('rooms/' + roomId + '/' + role);

        var signalData = Object.assign({}, data, {
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        signalRef.push(signalData)
          .then(resolve)
          .catch(function(error) {
            console.error('[방셀 헬퍼] sendSignal 실패:', error);
            reject(error);
          });
      } catch (error) {
        console.error('[방셀 헬퍼] sendSignal 예외:', error);
        reject(error);
      }
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
    console.log('[방셀 헬퍼] deleteRoom 호출됨, roomId:', roomId);

    return new Promise(function(resolve, reject) {
      try {
        var roomRef = getRef('rooms/' + roomId);
        roomRef.remove()
          .then(function() {
            console.log('[방셀 헬퍼] 방 삭제 완료:', roomId);
            resolve();
          })
          .catch(function(error) {
            console.error('[방셀 헬퍼] 방 삭제 실패:', error);
            reject(error);
          });
      } catch (error) {
        console.error('[방셀 헬퍼] deleteRoom 예외:', error);
        reject(error);
      }
    });
  }

  /**
   * 방 존재 여부 확인
   */
  function roomExists(roomId) {
    return new Promise(function(resolve, reject) {
      try {
        var roomRef = getRef('rooms/' + roomId);
        roomRef.once('value')
          .then(function(snapshot) {
            var exists = snapshot.exists();
            console.log('[방셀 헬퍼] roomExists 결과:', roomId, exists);
            resolve(exists);
          })
          .catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Firebase 연결 상태 모니터링
   */
  function monitorConnection(callback) {
    var connectedRef = getRef('.info/connected');

    var onValue = function(snapshot) {
      var connected = snapshot.val() === true;
      console.log('[방셀 헬퍼] Firebase 연결 상태:', connected ? '연결됨' : '연결 안됨');
      callback(connected);
    };

    connectedRef.on('value', onValue);

    return function() {
      connectedRef.off('value', onValue);
    };
  }

  /**
   * 테스트용: 간단한 쓰기 테스트
   */
  function testWrite() {
    console.log('[방셀 헬퍼] testWrite 시작...');

    return new Promise(function(resolve, reject) {
      try {
        var testRef = getRef('test/' + Date.now());
        testRef.set({ test: true, timestamp: Date.now() })
          .then(function() {
            console.log('[방셀 헬퍼] testWrite 성공!');
            // 테스트 데이터 즉시 삭제
            testRef.remove();
            resolve(true);
          })
          .catch(function(error) {
            console.error('[방셀 헬퍼] testWrite 실패:', error);
            reject(error);
          });
      } catch (error) {
        console.error('[방셀 헬퍼] testWrite 예외:', error);
        reject(error);
      }
    });
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
    monitorConnection: monitorConnection,
    testWrite: testWrite
  };

  console.log('[방셀 헬퍼] Firebase 모듈 로드 완료');
})();
