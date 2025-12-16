/**
 * Firebase 설정 및 초기화
 * 시그널링 서버로 Firebase Realtime Database 사용
 */

// Firebase 설정 (환경 변수 또는 직접 입력)
// 실제 배포 시에는 본인의 Firebase 프로젝트 설정으로 변경해야 합니다
const firebaseConfig = {
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
let firebaseApp = null;
let database = null;

/**
 * Firebase 초기화
 * @returns {Object} Firebase 인스턴스들
 */
export function initializeFirebase() {
  if (firebaseApp) {
    return { app: firebaseApp, database };
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
  } else {
    console.error('Firebase SDK가 로드되지 않았습니다.');
    throw new Error('Firebase SDK not loaded');
  }

  return { app: firebaseApp, database };
}

/**
 * 데이터베이스 참조 가져오기
 * @param {string} path - DB 경로
 * @returns {Object} Database Reference
 */
export function getRef(path) {
  if (!database) {
    initializeFirebase();
  }
  return database.ref(path);
}

/**
 * 방(Room) 생성
 * @param {string} roomId - 방 ID
 * @returns {Promise<Object>} 생성된 방 정보
 */
export async function createRoom(roomId) {
  const roomRef = getRef(`rooms/${roomId}`);

  const roomData = {
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    status: 'waiting'
  };

  await roomRef.set(roomData);

  // 1시간 후 자동 삭제를 위한 TTL 설정
  setTimeout(async () => {
    try {
      await roomRef.remove();
      console.log(`Room ${roomId} auto-deleted after 1 hour`);
    } catch (e) {
      // 이미 삭제되었을 수 있음
    }
  }, 60 * 60 * 1000);

  return { roomId, ...roomData };
}

/**
 * 방에 시그널링 데이터 전송
 * @param {string} roomId - 방 ID
 * @param {string} role - 역할 ('sender' | 'receiver')
 * @param {Object} data - 시그널링 데이터
 * @returns {Promise<void>}
 */
export async function sendSignal(roomId, role, data) {
  const signalRef = getRef(`rooms/${roomId}/${role}`);
  await signalRef.push({
    ...data,
    timestamp: firebase.database.ServerValue.TIMESTAMP
  });
}

/**
 * 시그널링 데이터 리스닝
 * @param {string} roomId - 방 ID
 * @param {string} targetRole - 수신할 역할 ('sender' | 'receiver')
 * @param {Function} callback - 데이터 수신 시 콜백
 * @returns {Function} unsubscribe 함수
 */
export function listenToSignals(roomId, targetRole, callback) {
  const signalRef = getRef(`rooms/${roomId}/${targetRole}`);

  const onChildAdded = signalRef.on('child_added', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      callback(data);
    }
  });

  // unsubscribe 함수 반환
  return () => {
    signalRef.off('child_added', onChildAdded);
  };
}

/**
 * 방 삭제 (연결 종료 시)
 * @param {string} roomId - 방 ID
 * @returns {Promise<void>}
 */
export async function deleteRoom(roomId) {
  const roomRef = getRef(`rooms/${roomId}`);
  await roomRef.remove();
}

/**
 * 방 존재 여부 확인
 * @param {string} roomId - 방 ID
 * @returns {Promise<boolean>}
 */
export async function roomExists(roomId) {
  const roomRef = getRef(`rooms/${roomId}`);
  const snapshot = await roomRef.once('value');
  return snapshot.exists();
}

/**
 * Firebase 연결 상태 모니터링
 * @param {Function} callback - 연결 상태 변경 시 콜백
 * @returns {Function} unsubscribe 함수
 */
export function monitorConnection(callback) {
  const connectedRef = getRef('.info/connected');

  const onValue = connectedRef.on('value', (snapshot) => {
    callback(snapshot.val() === true);
  });

  return () => {
    connectedRef.off('value', onValue);
  };
}

// 전역 변수로 노출 (필요한 경우)
window.BangselFirebase = {
  initializeFirebase,
  getRef,
  createRoom,
  sendSignal,
  listenToSignals,
  deleteRoom,
  roomExists,
  monitorConnection
};

export default {
  initializeFirebase,
  getRef,
  createRoom,
  sendSignal,
  listenToSignals,
  deleteRoom,
  roomExists,
  monitorConnection,
  firebaseConfig
};
