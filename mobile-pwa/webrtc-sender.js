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
   * PC에 연결 (Firebase 기반 사진 전송 - WebRTC는 백그라운드에서 시도)
   */
  async connect() {
    try {
      this.onStatusChange('connecting');

      // RTCPeerConnection 생성 (WebRTC는 백그라운드에서 시도)
      this.pc = new RTCPeerConnection(this.iceServers);

      // 데이터 채널 생성 (송신측에서 생성)
      this.dataChannel = this.pc.createDataChannel('photos', {
        ordered: true
      });
      this.dataChannel.binaryType = 'arraybuffer';

      // 데이터 채널 이벤트 (옵션 - P2P 연결 성공 시 로깅용)
      this.dataChannel.onopen = () => {
        console.log('[Sender] Data channel opened (P2P 연결 성공!)');
      };

      this.dataChannel.onclose = () => {
        console.log('[Sender] Data channel closed');
      };

      this.dataChannel.onerror = (error) => {
        console.error('[Sender] Data channel error:', error);
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

      // 연결 상태 변화 (로깅용)
      this.pc.onconnectionstatechange = () => {
        console.log('[Sender] WebRTC connection state:', this.pc.connectionState);
        // P2P 실패해도 Firebase로 전송 가능하므로 상태 변경 안함
      };

      // Offer 생성 및 전송
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.sendToSignaling('offer', offer);

      // Answer 대기 (시그널링 완료)
      await this.listenToSignaling();

      // 시그널링 완료 = 연결 성공 (Firebase로 전송 가능)
      // WebRTC P2P 연결 성공 여부와 관계없이 사진 전송 가능
      this.isConnected = true;
      this.onStatusChange('connected');

      console.log('[Sender] Connected to room:', this.roomId, '(Firebase 전송 준비 완료)');
    } catch (error) {
      console.error('[Sender] Connection failed:', error);
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
   * 사진 전송 (Firebase Realtime Database 사용)
   * @param {File} file - 전송할 파일
   * @param {Function} onProgress - 진행률 콜백 (0-100)
   */
  async sendPhoto(file, onProgress) {
    console.log('[Sender] sendPhoto 호출 (Firebase 전송)');
    console.log('[Sender] roomId:', this.roomId);

    // roomId만 있으면 Firebase로 전송 가능
    if (!this.roomId) {
      throw new Error('방에 연결되지 않았습니다');
    }

    console.log(`[Sender] 파일 전송 시작: ${file.name} (${file.size} bytes)`);

    // 파일을 Base64로 인코딩
    onProgress?.(10);
    const base64Data = await this.fileToBase64(file);
    onProgress?.(30);

    console.log(`[Sender] Base64 인코딩 완료, 크기: ${base64Data.length} chars`);

    // Firebase에 사진 데이터 저장
    const photoId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const photoRef = firebase.database().ref(`rooms/${this.roomId}/photos/${photoId}`);

    try {
      // 사진 데이터가 크면 청크로 나누어 저장 (Firebase 단일 쓰기 제한 대응)
      const MAX_CHUNK_SIZE = 500000; // 500KB per chunk (Firebase 권장)

      if (base64Data.length > MAX_CHUNK_SIZE) {
        // 큰 파일은 청크로 나누어 저장
        const totalChunks = Math.ceil(base64Data.length / MAX_CHUNK_SIZE);
        console.log(`[Sender] 큰 파일 감지, ${totalChunks}개 청크로 분할`);

        // 먼저 메타데이터 저장
        await photoRef.set({
          name: file.name,
          mimeType: file.type || 'image/jpeg',
          size: file.size,
          totalChunks: totalChunks,
          isChunked: true,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        onProgress?.(40);

        // 청크 데이터 저장
        for (let i = 0; i < totalChunks; i++) {
          const start = i * MAX_CHUNK_SIZE;
          const end = Math.min(start + MAX_CHUNK_SIZE, base64Data.length);
          const chunkData = base64Data.slice(start, end);

          await firebase.database().ref(`rooms/${this.roomId}/photos/${photoId}/chunks/${i}`).set(chunkData);

          const progress = 40 + ((i + 1) / totalChunks) * 60;
          onProgress?.(progress);
        }
      } else {
        // 작은 파일은 한 번에 저장
        await photoRef.set({
          name: file.name,
          mimeType: file.type || 'image/jpeg',
          size: file.size,
          data: base64Data,
          isChunked: false,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        onProgress?.(100);
      }

      console.log(`[Sender] Firebase에 사진 저장 완료: ${file.name}`);
    } catch (error) {
      console.error('[Sender] Firebase 저장 실패:', error);
      throw new Error('사진 전송 실패: ' + error.message);
    }
  }

  /**
   * 파일을 Base64로 변환
   * @param {File} file - 파일
   * @returns {Promise<string>} Base64 문자열
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // data:image/jpeg;base64, 부분 제거하고 순수 base64만 반환
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
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
    console.log('[Sender] sendToSignaling 호출:', type);
    const signalingRef = firebase.database().ref(`rooms/${this.roomId}/sender`);
    try {
      await signalingRef.push({
        type,
        data,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
      console.log('[Sender] 시그널 전송 성공:', type);
    } catch (error) {
      console.error('[Sender] 시그널 전송 실패:', error);
      throw error;
    }
  }

  /**
   * 시그널링 리스너
   */
  listenToSignaling() {
    console.log('[Sender] listenToSignaling 시작, receiver 경로 리스닝...');
    return new Promise((resolve, reject) => {
      const receiverRef = firebase.database().ref(`rooms/${this.roomId}/receiver`);
      console.log('[Sender] 리스닝 경로:', `rooms/${this.roomId}/receiver`);

      const timeout = setTimeout(() => {
        console.error('[Sender] 30초 타임아웃! PC로부터 응답 없음');
        receiverRef.off();
        reject(new Error('연결 시간 초과 - PC가 응답하지 않습니다. PC 확장프로그램이 열려있는지 확인하세요.'));
      }, 30000);

      receiverRef.on('child_added', async (snapshot) => {
        const message = snapshot.val();
        console.log('[Sender] receiver로부터 메시지 수신:', message.type);

        try {
          if (message.type === 'answer') {
            console.log('[Sender] Answer 수신, setRemoteDescription 호출');
            await this.pc.setRemoteDescription(new RTCSessionDescription(message.data));
            console.log('[Sender] setRemoteDescription 성공');
            clearTimeout(timeout);
            resolve();
          } else if (message.type === 'ice-candidate') {
            console.log('[Sender] ICE candidate 수신');
            if (message.data && this.pc.remoteDescription) {
              await this.pc.addIceCandidate(new RTCIceCandidate(message.data));
              console.log('[Sender] ICE candidate 추가 성공');
            }
          }
        } catch (error) {
          console.error('[Sender] 시그널 처리 실패:', error);
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
