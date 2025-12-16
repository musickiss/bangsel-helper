/**
 * WebRTC 수신자 (PC 크롬 확장에서 실행)
 * 모바일로부터 사진을 수신하는 역할
 */

import {
  initializeFirebase,
  createRoom,
  sendSignal,
  listenToSignals,
  deleteRoom
} from './firebase-config.js';

// ICE 서버 설정 (STUN 서버 - 무료)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ]
};

/**
 * 사진 수신자 클래스
 */
export class PhotoReceiver {
  /**
   * @param {string} roomId - 방 ID
   * @param {Function} onPhotoReceived - 사진 수신 시 콜백
   * @param {Function} onStatusChange - 연결 상태 변경 시 콜백
   */
  constructor(roomId, onPhotoReceived, onStatusChange) {
    this.roomId = roomId;
    this.onPhotoReceived = onPhotoReceived;
    this.onStatusChange = onStatusChange;

    this.pc = null;
    this.dataChannel = null;
    this.unsubscribeSignaling = null;

    // 파일 수신 상태
    this.receivedChunks = [];
    this.currentFileInfo = null;
    this.totalReceivedSize = 0;
  }

  /**
   * 수신자 초기화
   */
  async initialize() {
    try {
      // Firebase 초기화
      initializeFirebase();

      // 방 생성
      await createRoom(this.roomId);

      // RTCPeerConnection 설정
      this.pc = new RTCPeerConnection(ICE_SERVERS);

      // ICE candidate 처리
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendToSignaling('ice-candidate', event.candidate.toJSON());
        }
      };

      // 연결 상태 변화 감지
      this.pc.onconnectionstatechange = () => {
        console.log('Connection state:', this.pc.connectionState);
        this.onStatusChange(this.pc.connectionState);

        if (this.pc.connectionState === 'failed') {
          this.handleConnectionFailure();
        }
      };

      // ICE 연결 상태 변화
      this.pc.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', this.pc.iceConnectionState);
      };

      // 데이터 채널 수신 대기 (송신측에서 생성)
      this.pc.ondatachannel = (event) => {
        console.log('Data channel received');
        this.setupDataChannel(event.channel);
      };

      // 시그널링 리스너 시작
      this.listenToSignaling();

      console.log(`Receiver initialized with room: ${this.roomId}`);
    } catch (error) {
      console.error('Receiver initialization failed:', error);
      this.onStatusChange('failed');
      throw error;
    }
  }

  /**
   * 데이터 채널 설정
   */
  setupDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
      this.onStatusChange('connected');
    };

    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
      this.onStatusChange('disconnected');
    };

    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.onStatusChange('failed');
    };

    this.dataChannel.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  /**
   * 수신된 메시지 처리
   */
  handleMessage(data) {
    // JSON 메시지 (파일 정보)
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);

        if (message.type === 'file-start') {
          // 새 파일 수신 시작
          console.log('File transfer started:', message.name);
          this.currentFileInfo = message;
          this.receivedChunks = [];
          this.totalReceivedSize = 0;
        } else if (message.type === 'file-end') {
          // 파일 수신 완료
          this.assembleFile();
        } else if (message.type === 'ping') {
          // 연결 유지 핑
          this.dataChannel.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    } else {
      // 바이너리 데이터 (파일 청크)
      this.receivedChunks.push(data);
      this.totalReceivedSize += data.byteLength;

      // 진행률 계산 (선택적으로 표시)
      if (this.currentFileInfo) {
        const progress = (this.totalReceivedSize / this.currentFileInfo.size) * 100;
        // console.log(`Receiving: ${progress.toFixed(1)}%`);
      }
    }
  }

  /**
   * 수신된 청크들을 파일로 조립
   */
  assembleFile() {
    if (!this.currentFileInfo || this.receivedChunks.length === 0) {
      console.error('No file data to assemble');
      return;
    }

    try {
      // Blob 생성
      const blob = new Blob(this.receivedChunks, {
        type: this.currentFileInfo.mimeType || 'image/jpeg'
      });

      console.log(`File assembled: ${this.currentFileInfo.name} (${blob.size} bytes)`);

      // 콜백 호출
      this.onPhotoReceived({
        name: this.currentFileInfo.name,
        type: this.currentFileInfo.mimeType,
        size: blob.size,
        data: blob
      });

      // 상태 초기화
      this.receivedChunks = [];
      this.currentFileInfo = null;
      this.totalReceivedSize = 0;

      // 수신 확인 전송
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify({ type: 'file-ack' }));
      }
    } catch (error) {
      console.error('Failed to assemble file:', error);
    }
  }

  /**
   * 시그널링 데이터 전송
   */
  async sendToSignaling(type, data) {
    try {
      await sendSignal(this.roomId, 'receiver', { type, data });
    } catch (error) {
      console.error('Failed to send signal:', error);
    }
  }

  /**
   * 시그널링 리스너 시작
   */
  listenToSignaling() {
    this.unsubscribeSignaling = listenToSignals(
      this.roomId,
      'sender',
      async (message) => {
        try {
          if (message.type === 'offer') {
            await this.handleOffer(message.data);
          } else if (message.type === 'ice-candidate') {
            await this.handleIceCandidate(message.data);
          }
        } catch (error) {
          console.error('Failed to handle signal:', error);
        }
      }
    );
  }

  /**
   * Offer 처리
   */
  async handleOffer(offer) {
    console.log('Received offer');

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      await this.sendToSignaling('answer', answer);
      console.log('Answer sent');
    } catch (error) {
      console.error('Failed to handle offer:', error);
      throw error;
    }
  }

  /**
   * ICE Candidate 처리
   */
  async handleIceCandidate(candidate) {
    try {
      if (candidate && this.pc.remoteDescription) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  }

  /**
   * 연결 실패 처리
   */
  handleConnectionFailure() {
    console.log('Connection failed, cleaning up...');
    this.disconnect();
  }

  /**
   * 연결 해제
   */
  disconnect() {
    console.log('Disconnecting receiver...');

    // 시그널링 리스너 해제
    if (this.unsubscribeSignaling) {
      this.unsubscribeSignaling();
      this.unsubscribeSignaling = null;
    }

    // 데이터 채널 닫기
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    // RTCPeerConnection 닫기
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    // 방 삭제
    deleteRoom(this.roomId).catch(console.error);

    // 상태 초기화
    this.receivedChunks = [];
    this.currentFileInfo = null;
    this.totalReceivedSize = 0;

    this.onStatusChange('disconnected');
  }

  /**
   * 현재 연결 상태 확인
   */
  isConnected() {
    return this.pc && this.pc.connectionState === 'connected';
  }
}

// 전역 변수로 노출
window.PhotoReceiver = PhotoReceiver;

export default PhotoReceiver;
