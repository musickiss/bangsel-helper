/**
 * WebRTC 수신자 (PC 크롬 확장에서 실행)
 * 모바일로부터 사진을 수신하는 역할
 */

(function() {
  'use strict';

  // ICE 서버 설정 (STUN 서버 - 무료)
  var ICE_SERVERS = {
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
  function PhotoReceiver(roomId, onPhotoReceived, onStatusChange) {
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
   * 수신자 초기화 (방 생성 포함 - 독립 사용 시)
   */
  PhotoReceiver.prototype.initialize = async function() {
    var self = this;

    try {
      // Firebase 초기화
      if (!window.BangselFirebase) {
        throw new Error('Firebase 모듈이 로드되지 않았습니다.');
      }
      window.BangselFirebase.initializeFirebase();

      // 방 생성
      await window.BangselFirebase.createRoom(this.roomId);

      // 리스닝 시작
      await this.startListening();

      console.log('[Receiver] initialized with room:', this.roomId);
    } catch (error) {
      console.error('[Receiver] initialization failed:', error);
      this.onStatusChange('failed');
      throw error;
    }
  };

  /**
   * 시그널링 리스닝 시작 (방이 이미 생성된 경우)
   */
  PhotoReceiver.prototype.startListening = function() {
    var self = this;
    console.log('[Receiver] startListening 호출, roomId:', this.roomId);

    try {
      // RTCPeerConnection 설정
      this.pc = new RTCPeerConnection(ICE_SERVERS);
      console.log('[Receiver] RTCPeerConnection 생성됨');

      // ICE candidate 처리
      this.pc.onicecandidate = function(event) {
        if (event.candidate) {
          console.log('[Receiver] ICE candidate 생성됨, 전송 중...');
          self.sendToSignaling('ice-candidate', event.candidate.toJSON());
        }
      };

      // 연결 상태 변화 감지
      this.pc.onconnectionstatechange = function() {
        console.log('[Receiver] Connection state:', self.pc.connectionState);
        self.onStatusChange(self.pc.connectionState);

        if (self.pc.connectionState === 'failed') {
          self.handleConnectionFailure();
        }
      };

      // ICE 연결 상태 변화
      this.pc.oniceconnectionstatechange = function() {
        console.log('[Receiver] ICE connection state:', self.pc.iceConnectionState);
      };

      // 데이터 채널 수신 대기 (송신측에서 생성)
      this.pc.ondatachannel = function(event) {
        console.log('[Receiver] Data channel received');
        self.setupDataChannel(event.channel);
      };

      // 시그널링 리스너 시작
      this.listenToSignaling();
      console.log('[Receiver] 시그널링 리스너 시작됨, sender 경로 대기 중...');

    } catch (error) {
      console.error('[Receiver] startListening 실패:', error);
      this.onStatusChange('failed');
      throw error;
    }
  };

  /**
   * 데이터 채널 설정
   */
  PhotoReceiver.prototype.setupDataChannel = function(channel) {
    var self = this;

    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = function() {
      console.log('Data channel opened');
      self.onStatusChange('connected');
    };

    this.dataChannel.onclose = function() {
      console.log('Data channel closed');
      self.onStatusChange('disconnected');
    };

    this.dataChannel.onerror = function(error) {
      console.error('Data channel error:', error);
      self.onStatusChange('failed');
    };

    this.dataChannel.onmessage = function(event) {
      self.handleMessage(event.data);
    };
  };

  /**
   * 수신된 메시지 처리
   */
  PhotoReceiver.prototype.handleMessage = function(data) {
    // JSON 메시지 (파일 정보)
    if (typeof data === 'string') {
      try {
        var message = JSON.parse(data);

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
    }
  };

  /**
   * 수신된 청크들을 파일로 조립
   */
  PhotoReceiver.prototype.assembleFile = function() {
    if (!this.currentFileInfo || this.receivedChunks.length === 0) {
      console.error('No file data to assemble');
      return;
    }

    try {
      // Blob 생성
      var blob = new Blob(this.receivedChunks, {
        type: this.currentFileInfo.mimeType || 'image/jpeg'
      });

      console.log('File assembled:', this.currentFileInfo.name, '(' + blob.size + ' bytes)');

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
  };

  /**
   * 시그널링 데이터 전송
   */
  PhotoReceiver.prototype.sendToSignaling = async function(type, data) {
    try {
      await window.BangselFirebase.sendSignal(this.roomId, 'receiver', { type: type, data: data });
    } catch (error) {
      console.error('Failed to send signal:', error);
    }
  };

  /**
   * 시그널링 리스너 시작
   */
  PhotoReceiver.prototype.listenToSignaling = function() {
    var self = this;
    console.log('[Receiver] listenToSignaling 호출, 경로: rooms/' + this.roomId + '/sender');

    this.unsubscribeSignaling = window.BangselFirebase.listenToSignals(
      this.roomId,
      'sender',
      async function(message) {
        console.log('[Receiver] sender로부터 메시지 수신:', message.type);
        try {
          if (message.type === 'offer') {
            console.log('[Receiver] Offer 수신, 처리 시작...');
            await self.handleOffer(message.data);
          } else if (message.type === 'ice-candidate') {
            console.log('[Receiver] ICE candidate 수신');
            await self.handleIceCandidate(message.data);
          }
        } catch (error) {
          console.error('[Receiver] 시그널 처리 실패:', error);
        }
      }
    );
  };

  /**
   * Offer 처리
   */
  PhotoReceiver.prototype.handleOffer = async function(offer) {
    console.log('[Receiver] handleOffer 시작');

    try {
      console.log('[Receiver] setRemoteDescription 호출...');
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[Receiver] setRemoteDescription 완료');

      console.log('[Receiver] createAnswer 호출...');
      var answer = await this.pc.createAnswer();
      console.log('[Receiver] createAnswer 완료');

      console.log('[Receiver] setLocalDescription 호출...');
      await this.pc.setLocalDescription(answer);
      console.log('[Receiver] setLocalDescription 완료');

      console.log('[Receiver] Answer 시그널 전송...');
      await this.sendToSignaling('answer', answer);
      console.log('[Receiver] Answer 전송 완료!');
    } catch (error) {
      console.error('[Receiver] handleOffer 실패:', error);
      throw error;
    }
  };

  /**
   * ICE Candidate 처리
   */
  PhotoReceiver.prototype.handleIceCandidate = async function(candidate) {
    try {
      if (candidate && this.pc.remoteDescription) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
    }
  };

  /**
   * 연결 실패 처리
   */
  PhotoReceiver.prototype.handleConnectionFailure = function() {
    console.log('Connection failed, cleaning up...');
    this.disconnect();
  };

  /**
   * 연결 해제
   */
  PhotoReceiver.prototype.disconnect = function() {
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
    if (window.BangselFirebase) {
      window.BangselFirebase.deleteRoom(this.roomId).catch(function() {});
    }

    // 상태 초기화
    this.receivedChunks = [];
    this.currentFileInfo = null;
    this.totalReceivedSize = 0;

    this.onStatusChange('disconnected');
  };

  /**
   * 현재 연결 상태 확인
   */
  PhotoReceiver.prototype.isConnected = function() {
    return this.pc && this.pc.connectionState === 'connected';
  };

  // 전역 변수로 노출
  window.PhotoReceiver = PhotoReceiver;

  console.log('[방셀 헬퍼] WebRTC Receiver 모듈 로드 완료');
})();
