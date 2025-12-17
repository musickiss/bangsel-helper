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
    this.unsubscribePhotos = null; // Firebase 사진 리스너 해제 함수

    // 파일 수신 상태 (WebRTC 수신용 - 레거시)
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

      // Firebase 사진 리스너 시작
      this.startPhotoListener();

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

      // 연결 상태 변화 감지 (로깅용 - P2P 실패해도 Firebase로 수신 가능)
      this.pc.onconnectionstatechange = function() {
        console.log('[Receiver] WebRTC connection state:', self.pc.connectionState);
        // P2P 연결 성공 시에만 connected 상태 알림
        if (self.pc.connectionState === 'connected') {
          console.log('[Receiver] P2P 연결 성공!');
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

      // Firebase 사진 리스너 시작
      this.startPhotoListener();

    } catch (error) {
      console.error('[Receiver] startListening 실패:', error);
      this.onStatusChange('failed');
      throw error;
    }
  };

  /**
   * Firebase 사진 리스너 시작 (Firebase를 통한 사진 수신)
   */
  PhotoReceiver.prototype.startPhotoListener = function() {
    var self = this;
    console.log('[Receiver] Firebase 사진 리스너 시작, 경로: rooms/' + this.roomId + '/photos');

    var photosRef = window.BangselFirebase.getRef('rooms/' + this.roomId + '/photos');

    this.unsubscribePhotos = function() {
      photosRef.off('child_added');
      photosRef.off('child_changed');
    };

    // 사진 처리 함수
    var processPhoto = async function(snapshot) {
      var photoData = snapshot.val();
      var photoId = snapshot.key;

      console.log('[Receiver] 사진 데이터 수신:', photoId, photoData);

      // ready 플래그가 없으면 아직 전송 중이므로 무시
      if (!photoData || !photoData.ready) {
        console.log('[Receiver] 아직 준비되지 않은 사진, 대기 중...');
        return;
      }

      if (!photoData.name) {
        console.log('[Receiver] 유효하지 않은 사진 데이터 (name 없음), 무시');
        return;
      }

      console.log('[Receiver] Firebase에서 사진 수신:', photoData.name, 'isChunked:', photoData.isChunked);

      // 연결 상태를 connected로 변경 (사진 수신 시)
      self.onStatusChange('connected');

      try {
        var base64Data;

        if (photoData.isChunked) {
          // 청크로 나뉜 큰 파일 처리
          console.log('[Receiver] 청크 파일 조립 중, 총 청크:', photoData.totalChunks);
          var chunks = [];

          for (var i = 0; i < photoData.totalChunks; i++) {
            var chunkSnapshot = await window.BangselFirebase.getRef(
              'rooms/' + self.roomId + '/photos/' + photoId + '/chunks/' + i
            ).once('value');
            var chunkData = chunkSnapshot.val();
            console.log('[Receiver] 청크', i, '읽음, 크기:', chunkData ? chunkData.length : 'null');
            chunks.push(chunkData || '');
          }

          base64Data = chunks.join('');
          console.log('[Receiver] 청크 조립 완료, 총 크기:', base64Data.length, 'chars');
        } else {
          // 단일 데이터
          base64Data = photoData.data;
          console.log('[Receiver] 단일 데이터 사용, 크기:', base64Data ? base64Data.length : 'null/undefined');
        }

        // Base64 데이터 검증
        if (!base64Data || base64Data.length === 0) {
          console.error('[Receiver] Base64 데이터가 비어있음!');
          return;
        }

        // Base64를 Blob으로 변환
        var blob = self.base64ToBlob(base64Data, photoData.mimeType || 'image/jpeg');

        console.log('[Receiver] 사진 변환 완료:', photoData.name, '(' + blob.size + ' bytes)');

        // 콜백 호출
        self.onPhotoReceived({
          name: photoData.name,
          type: photoData.mimeType,
          size: blob.size,
          data: blob
        });

        // Firebase에서 사진 데이터 삭제 (수신 완료 후)
        console.log('[Receiver] Firebase에서 사진 데이터 삭제:', photoId);
        await window.BangselFirebase.getRef('rooms/' + self.roomId + '/photos/' + photoId).remove();

      } catch (error) {
        console.error('[Receiver] 사진 처리 실패:', error);
      }
    };

    // child_added: 새 사진 추가 시 (ready 플래그가 있으면 처리)
    photosRef.on('child_added', processPhoto);

    // child_changed: 청크 전송 완료 후 ready 플래그 추가 시
    photosRef.on('child_changed', processPhoto);
  };

  /**
   * Base64를 Blob으로 변환
   */
  PhotoReceiver.prototype.base64ToBlob = function(base64, mimeType) {
    var byteCharacters = atob(base64);
    var byteArrays = [];

    for (var offset = 0; offset < byteCharacters.length; offset += 512) {
      var slice = byteCharacters.slice(offset, offset + 512);

      var byteNumbers = new Array(slice.length);
      for (var i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      var byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: mimeType });
  };

  /**
   * 데이터 채널 설정
   */
  PhotoReceiver.prototype.setupDataChannel = function(channel) {
    var self = this;
    console.log('[Receiver] setupDataChannel 호출');
    console.log('[Receiver] channel.label:', channel.label);
    console.log('[Receiver] channel.readyState:', channel.readyState);

    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = function() {
      console.log('[Receiver] Data channel opened!');
      console.log('[Receiver] dataChannel.readyState:', self.dataChannel.readyState);
      self.onStatusChange('connected');
    };

    this.dataChannel.onclose = function() {
      console.log('[Receiver] Data channel closed');
      self.onStatusChange('disconnected');
    };

    this.dataChannel.onerror = function(error) {
      console.error('[Receiver] Data channel error:', error);
      self.onStatusChange('failed');
    };

    this.dataChannel.onmessage = function(event) {
      console.log('[Receiver] onmessage 이벤트 발생, 데이터 타입:', typeof event.data);
      if (typeof event.data !== 'string') {
        console.log('[Receiver] 바이너리 데이터 수신, 크기:', event.data.byteLength, 'bytes');
      }
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
        console.log('[Receiver] JSON 메시지 수신:', message.type);

        if (message.type === 'file-start') {
          // 새 파일 수신 시작
          console.log('[Receiver] 파일 전송 시작:', message.name, '크기:', message.size, 'bytes', '청크수:', message.totalChunks);
          this.currentFileInfo = message;
          this.receivedChunks = [];
          this.totalReceivedSize = 0;
        } else if (message.type === 'file-end') {
          // 파일 수신 완료
          console.log('[Receiver] 파일 전송 완료 신호 수신, 청크 개수:', this.receivedChunks.length, '총 크기:', this.totalReceivedSize);
          this.assembleFile();
        } else if (message.type === 'ping') {
          // 연결 유지 핑
          console.log('[Receiver] ping 수신, pong 응답');
          this.dataChannel.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {
        console.error('[Receiver] JSON 파싱 실패:', e);
      }
    } else {
      // 바이너리 데이터 (파일 청크)
      this.receivedChunks.push(data);
      this.totalReceivedSize += data.byteLength;
      if (this.receivedChunks.length % 10 === 0) {
        console.log('[Receiver] 청크 수신 중...', this.receivedChunks.length, '개,', this.totalReceivedSize, 'bytes');
      }
    }
  };

  /**
   * 수신된 청크들을 파일로 조립
   */
  PhotoReceiver.prototype.assembleFile = function() {
    console.log('[Receiver] assembleFile 호출');
    console.log('[Receiver] currentFileInfo:', this.currentFileInfo ? this.currentFileInfo.name : 'null');
    console.log('[Receiver] receivedChunks.length:', this.receivedChunks.length);

    if (!this.currentFileInfo || this.receivedChunks.length === 0) {
      console.error('[Receiver] 조립할 파일 데이터가 없음');
      return;
    }

    try {
      // Blob 생성
      var blob = new Blob(this.receivedChunks, {
        type: this.currentFileInfo.mimeType || 'image/jpeg'
      });

      console.log('[Receiver] 파일 조립 완료:', this.currentFileInfo.name, '(' + blob.size + ' bytes)');

      // 콜백 호출
      console.log('[Receiver] onPhotoReceived 콜백 호출...');
      this.onPhotoReceived({
        name: this.currentFileInfo.name,
        type: this.currentFileInfo.mimeType,
        size: blob.size,
        data: blob
      });
      console.log('[Receiver] onPhotoReceived 콜백 완료');

      // 상태 초기화
      this.receivedChunks = [];
      this.currentFileInfo = null;
      this.totalReceivedSize = 0;

      // 수신 확인 전송
      if (this.dataChannel && this.dataChannel.readyState === 'open') {
        this.dataChannel.send(JSON.stringify({ type: 'file-ack' }));
        console.log('[Receiver] file-ack 전송 완료');
      }
    } catch (error) {
      console.error('[Receiver] 파일 조립 실패:', error);
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

    // Firebase 사진 리스너 해제
    if (this.unsubscribePhotos) {
      this.unsubscribePhotos();
      this.unsubscribePhotos = null;
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
