/**
 * WebRTC 송신자 (모바일 PWA에서 실행)
 * PC로 사진을 전송하는 역할
 */

class PhotoSender {
  /**
   * @param {string} roomId - 방 ID
   * @param {Function} onStatusChange - 연결 상태 변경 시 콜백
   */
  constructor(roomId, onStatusChange) {
    this.roomId = roomId;
    this.onStatusChange = onStatusChange;

    this.pc = null;
    this.dataChannel = null;
    this.isConnected = false;

    // ICE 서버 설정
    this.iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
      ]
    };
  }

  /**
   * PC에 연결
   */
  async connect() {
    try {
      this.onStatusChange('connecting');

      // RTCPeerConnection 생성
      this.pc = new RTCPeerConnection(this.iceServers);

      // 데이터 채널 생성 (송신측에서 생성)
      this.dataChannel = this.pc.createDataChannel('photos', {
        ordered: true
      });
      this.dataChannel.binaryType = 'arraybuffer';

      // 데이터 채널 이벤트
      this.dataChannel.onopen = () => {
        console.log('Data channel opened');
        this.isConnected = true;
        this.onStatusChange('connected');
      };

      this.dataChannel.onclose = () => {
        console.log('Data channel closed');
        this.isConnected = false;
        this.onStatusChange('disconnected');
      };

      this.dataChannel.onerror = (error) => {
        console.error('Data channel error:', error);
        this.onStatusChange('failed');
      };

      this.dataChannel.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      // ICE candidate 처리
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendToSignaling('ice-candidate', event.candidate.toJSON());
        }
      };

      // 연결 상태 변화
      this.pc.onconnectionstatechange = () => {
        console.log('Connection state:', this.pc.connectionState);
        if (this.pc.connectionState === 'failed') {
          this.onStatusChange('failed');
        }
      };

      // Offer 생성 및 전송
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.sendToSignaling('offer', offer);

      // Answer 대기
      await this.listenToSignaling();

      console.log('Connected to room:', this.roomId);
    } catch (error) {
      console.error('Connection failed:', error);
      this.onStatusChange('failed');
      throw error;
    }
  }

  /**
   * 메시지 처리
   */
  handleMessage(data) {
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        if (message.type === 'file-ack') {
          console.log('File received confirmation');
        } else if (message.type === 'pong') {
          console.log('Connection alive');
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    }
  }

  /**
   * 사진 전송
   * @param {File} file - 전송할 파일
   * @param {Function} onProgress - 진행률 콜백 (0-100)
   */
  async sendPhoto(file, onProgress) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('연결되지 않았습니다');
    }

    const CHUNK_SIZE = 16384; // 16KB
    const buffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);

    console.log(`Sending file: ${file.name} (${file.size} bytes, ${totalChunks} chunks)`);

    // 파일 시작 알림
    this.dataChannel.send(JSON.stringify({
      type: 'file-start',
      name: file.name,
      mimeType: file.type || 'image/jpeg',
      size: file.size,
      totalChunks
    }));

    // 청크 단위로 전송
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, buffer.byteLength);
      const chunk = buffer.slice(start, end);

      // 버퍼가 가득 차면 대기
      while (this.dataChannel.bufferedAmount > 65535) {
        await this.waitForBuffer();
      }

      this.dataChannel.send(chunk);

      // 진행률 업데이트
      const progress = ((i + 1) / totalChunks) * 100;
      onProgress?.(progress);
    }

    // 파일 끝 알림
    this.dataChannel.send(JSON.stringify({ type: 'file-end' }));

    console.log(`File sent: ${file.name}`);
  }

  /**
   * 버퍼 대기
   */
  waitForBuffer() {
    return new Promise((resolve) => {
      const checkBuffer = () => {
        if (this.dataChannel.bufferedAmount <= 65535) {
          resolve();
        } else {
          setTimeout(checkBuffer, 10);
        }
      };
      checkBuffer();
    });
  }

  /**
   * 시그널링 데이터 전송
   */
  async sendToSignaling(type, data) {
    const signalingRef = firebase.database().ref(`rooms/${this.roomId}/sender`);
    await signalingRef.push({
      type,
      data,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  /**
   * 시그널링 리스너
   */
  listenToSignaling() {
    return new Promise((resolve, reject) => {
      const receiverRef = firebase.database().ref(`rooms/${this.roomId}/receiver`);
      const timeout = setTimeout(() => {
        receiverRef.off();
        reject(new Error('연결 시간 초과'));
      }, 30000);

      receiverRef.on('child_added', async (snapshot) => {
        const message = snapshot.val();

        try {
          if (message.type === 'answer') {
            await this.pc.setRemoteDescription(new RTCSessionDescription(message.data));
            clearTimeout(timeout);
            resolve();
          } else if (message.type === 'ice-candidate') {
            if (message.data && this.pc.remoteDescription) {
              await this.pc.addIceCandidate(new RTCIceCandidate(message.data));
            }
          }
        } catch (error) {
          console.error('Failed to handle signal:', error);
        }
      });
    });
  }

  /**
   * 연결 해제
   */
  disconnect() {
    console.log('Disconnecting sender...');

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.isConnected = false;
    this.onStatusChange('disconnected');
  }

  /**
   * 연결 상태 확인
   */
  getConnectionState() {
    return this.isConnected ? 'connected' : 'disconnected';
  }

  /**
   * 연결 유지 핑
   */
  sendPing() {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type: 'ping' }));
    }
  }
}

// 전역으로 노출
window.PhotoSender = PhotoSender;
