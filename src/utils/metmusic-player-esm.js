
class MeTMusicPlayer {
    /**
     * @param {HTMLAudioElement} audioElement - 需要绑定的 HTMLAudioElement 实例。
     * @param {string} sessionId - 用于 WebSocket 连接的会话 ID。
     * @param {object} [options] - 可选配置项。
     * @param {Function} [options.onChange] - 状态变化时的回调函数，传入当前播放器实例。
     */
    constructor(audioElement, sessionId, options = {}) {
        if (!audioElement) {
            console.error("需要提供一个有效的 <audio> 元素。");
            return;
        }

        this.audioPlayer = audioElement;
        this.SID = sessionId;
        this.options = options;
        this.onChangeCallback = options.onChange || null;
        this.ws = null;
        this.currentServerStartTime = 0;
        this.midUrlCache = {};
        this.midLyricsCache = {};
        this.isSeekPending = false;
        this.musicStatus = false;
        this.musicMid = "";
        this.lastUpdateTs = 0;
        this.lastMusicMid = "";
        this.lastMusicStartTs = 0;
        this.syncInterval = null;
        this.songData = null;
        this.songLyrics = null;
        this.isBuffering = false;
        this.serverLocalTimeDiff = 0;
        this.loadingTimes = [];
        this.loadingStartTime = 0;
        this.averageLoadingTime = 1000;
        this.minPreloadTime = 500;

        this._init();
    }

    _init() {
        this._bindEvents();
        this._initMediaSession();
    }

    _triggerOnChange() {
        if (this.onChangeCallback && typeof this.onChangeCallback === 'function') {
            this.onChangeCallback(this);
        }
    }

    _formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }

    _bindEvents() {
        this.audioPlayer.addEventListener('canplay', () => {
            this.isBuffering = false;
            const loadingTime = Date.now() - this.loadingStartTime;
            if (loadingTime > 0) {
                this._addLoadingTime(loadingTime);
            }
            if (this.isSeekPending) {
                const expectedServerPlayTimeMs = (Date.now() + this.serverLocalTimeDiff) - this.currentServerStartTime;
                const accurateSeekTime = Math.max(0, expectedServerPlayTimeMs / 1000);

                this.audioPlayer.currentTime = accurateSeekTime;
                this.isSeekPending = false;
            }

            this.audioPlayer.play().catch(error => {
                console.error("播放失败:", error);
            });

            this._triggerOnChange();
        });

        this.audioPlayer.addEventListener('play', () => {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            this._triggerOnChange();
        });
        this.audioPlayer.addEventListener('pause', () => {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
            this._triggerOnChange();
        });
        this.audioPlayer.addEventListener('waiting', () => {
            this.isBuffering = true;
        });
        this.audioPlayer.addEventListener('ended', () => {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            this._triggerOnChange();
        });

        this.audioPlayer.addEventListener('timeupdate', () => {
            this._updateMediaSessionPositionState();
            this._triggerOnChange();
        });

        this.audioPlayer.addEventListener('durationchange', () => {
            this._updateMediaSessionPositionState();
            this._triggerOnChange();
        });
    }

    _initMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => {
                this.audioPlayer.play().catch(e => console.error("MediaSession Play Error:", e));
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                this.audioPlayer.pause();
            });
        }
    }

    _updateMediaSessionMetadata(trackInfo) {
        if ('mediaSession' in navigator && trackInfo) {
            let artworkUrl = trackInfo.album?.coverUrl || '';

            navigator.mediaSession.metadata = new MediaMetadata({
                title: trackInfo.title || '未知歌曲',
                artist: trackInfo.singer?.map(s => s.name).join(', ') || '未知歌手',
                album: trackInfo.album?.name || '未知专辑',
                artwork: [
                    { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }
                ]
            });
        }
    }

    _updateMediaSessionPositionState() {
        if ('mediaSession' in navigator) {
            if (this.audioPlayer.duration > 0 && this.audioPlayer.currentTime > 0) {
                navigator.mediaSession.setPositionState({
                    duration: this.audioPlayer.duration,
                    playbackRate: this.audioPlayer.playbackRate,
                    position: this.audioPlayer.currentTime
                });
            }
        }
    }

    getPlayerStatus() {
        const isAudioPlaying = !this.audioPlayer.paused && !this.audioPlayer.ended;
        let statusText = '正在初始化...';

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            statusText = '未连接';
        } else if (this.isBuffering) {
            statusText = '加载中';
        } else if (isAudioPlaying) {
            statusText = '播放中';
        } else if (this.audioPlayer.ended) {
            statusText = '已停止';
        } else {
            statusText = '已暂停';
        }

        return {
            isPlaying: isAudioPlaying,
            songMid: this.musicMid,
            startTime: this.currentServerStartTime,
            songDetails: this.songData,
            currentTime: this.audioPlayer.currentTime,
            duration: this.audioPlayer.duration,
            volume: this.audioPlayer.volume,
            serverLocalTimeDiff: this.serverLocalTimeDiff,
            isBuffering: this.isBuffering,
            formattedCurrentTime: this._formatTime(this.audioPlayer.currentTime),
            formattedDuration: this._formatTime(this.audioPlayer.duration),
            statusText: statusText
        };
    }

    _addLoadingTime(timeInMs) {
        this.loadingTimes.push(timeInMs);
        if (this.loadingTimes.length > 5) {
            this.loadingTimes.shift();
        }
        const sum = this.loadingTimes.reduce((a, b) => a + b, 0);
        this.averageLoadingTime = sum / this.loadingTimes.length;
        console.log(`平均加载时间: ${this.averageLoadingTime.toFixed(2)}ms`);
    }

    connectWebSocket() {
        const wsUrl = "wss://music.met6.top:444/api-client/ws/listen";
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.ws.send(JSON.stringify({ type: "time" }));
            this.ws.send(JSON.stringify({ type: "listen", SessionId: [this.SID] }));
            if (!this.syncInterval) {
                this.syncInterval = setInterval(() => this._statusCheck(), 1000);
            }
            this._triggerOnChange();
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === "time" && data.status === "ok" && typeof data.timestamp === 'number') {
                    const serverTimeMs = data.timestamp;
                    const localTimeMs = Date.now();
                    this.serverLocalTimeDiff = serverTimeMs - localTimeMs;
                    console.log(`时间同步成功。服务器时间与本地时间偏差: ${this.serverLocalTimeDiff}ms`);
                }

                if (data.type === "feedback" && data.SessionId === this.SID) {
                    this.musicStatus = data.data.status;
                    this.musicMid = data.data.songMid;
                    const musicStartTs = data.data.systemTime - data.data.currentTime * 1000;
                    this.lastUpdateTs = Date.now();

                    this._updateMusicStatus(this.musicStatus, this.musicMid, musicStartTs);
                }
            } catch (e) {
                console.error("解析消息失败:", e);
            }
        };

        this.ws.onclose = () => {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            setTimeout(() => this.connectWebSocket(), 5000);
            this._triggerOnChange();
        };

        this.ws.onerror = (error) => {
            console.error("WebSocket Error:", error);
            this._triggerOnChange();
        };
    }

    _updateMusicStatus(currentStatus, currentMid, currentStartTs) {
        if (currentStatus) {
            const isNewSong = currentMid !== this.lastMusicMid;
            const isTimeDrifted = Math.abs(currentStartTs - this.lastMusicStartTs) > 500;

            this.lastMusicStartTs = currentStartTs;
            this.lastMusicMid = currentMid;

            if (isNewSong || isTimeDrifted) {
                const shouldPlayTime = currentStartTs;
                const preloadTime = Math.max(this.averageLoadingTime, this.minPreloadTime);
                const targetLoadFinishTimeServer = shouldPlayTime - this.minPreloadTime;
                const delay = Math.max(0, (targetLoadFinishTimeServer - this.serverLocalTimeDiff) - Date.now());

                console.log(`[预加载] 目标服务器播放时间: ${shouldPlayTime}ms, 预加载时长 ${preloadTime.toFixed(0)}ms, 计划本地延迟加载: ${delay.toFixed(0)}ms`);

                setTimeout(() => {
                    this._prepareToPlay(currentMid, currentStartTs);
                }, delay);
            }
        } else {
            this._handlePause();
        }
        this._triggerOnChange();
    }

    _statusCheck() {
        if (this.musicStatus && (Date.now() - this.lastUpdateTs > 12000)) {
            this.musicStatus = false;
            this._updateMusicStatus(false, "", 0);
        }
        this._triggerOnChange();
    }

    _updateSongInfo(trackInfo) {
        if (trackInfo) {
            this._updateMediaSessionMetadata(trackInfo);
        } else {
            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = null;
            }
        }
        this._triggerOnChange();
    }

    async _getSongUrl(mid) {
        if (this.midLyricsCache[mid]) return this.midLyricsCache[mid];
        try {
            const response = await fetch(`https://music.met6.top:444/api/song/url/v1/?id=${mid}&level=hq`);
            const data = await response.json();
            this.songData = data;
            const url = data.data[0]?.url;
            if (url) {
                this.midUrlCache[mid] = {
                    url: url,
                    track_info: data.data[0]?.track_info
                };
                return url;
            }
            return "";
        } catch (e) {
            console.error("获取歌曲链接失败:", e);
            return "";
        }
    }

    async _getSongLyrics(mid) {
        if (this.midLyricsCache[mid]) return this.midLyricsCache[mid].url;
        try {
            const response = await fetch(`https://music.met6.top:444/api/songlyric_get.php?show=lyric&mid=${mid}`);
            const lyrics = await response.text();
            this.songLyrics = lyrics;
            this.midLyricsCache[mid] = lyrics;
            return lyrics;
        } catch (e) {
            console.error("获取歌曲歌词失败:", e);
            this.songLyrics = "";
            return "";
        }
    }

    async _prepareToPlay(mid, startTime) {
        this.isBuffering = true;

        const cachedData = this.midUrlCache[mid];
        let songUrl;
        let trackInfo;

        if (cachedData) {
            songUrl = cachedData.url;
            trackInfo = cachedData.track_info;
        } else {
            const fetchedUrl = await this._getSongUrl(mid);
            songUrl = fetchedUrl;
            trackInfo = this.midUrlCache[mid]?.track_info;
            this.songData.lyrics = await this._getSongLyrics(mid);
        }

        if (songUrl) {
            this.audioPlayer.pause();
            this.audioPlayer.src = songUrl;
            this.audioPlayer.load();

            this.currentServerStartTime = startTime;
            this._updateSongInfo(trackInfo);

            this.isSeekPending = true;
            this.loadingStartTime = Date.now();

            clearInterval(this.syncInterval);
            this.syncInterval = setInterval(() => this._checkAndSync(), 1000);
        } else {
            this.isBuffering = false;
            this._updateSongInfo(null);
        }
        this._triggerOnChange();
    }

    _handlePause() {
        this.audioPlayer.pause();
        this.isBuffering = false;
        this.audioPlayer.src = "";
        this.audioPlayer.load();

        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.playbackState = 'paused';
        }

        clearInterval(this.syncInterval);
        this.syncInterval = null;
        this._triggerOnChange();
    }

    _checkAndSync() {
        if (!this.musicStatus || !this.audioPlayer.src || this.audioPlayer.paused || this.audioPlayer.ended || this.isBuffering) {
            return;
        }

        const expectedServerPlayTimeMs = (Date.now() + this.serverLocalTimeDiff) - this.currentServerStartTime;
        const expectedTimeSeconds = Math.max(0, expectedServerPlayTimeMs / 1000);

        const actualTime = this.audioPlayer.currentTime;
        const timeDiff = Math.abs(expectedTimeSeconds - actualTime);

        if (timeDiff > 0.5) {
            console.warn(`检测到时间偏差：${timeDiff.toFixed(2)}s。正在重新同步。`);
            this.audioPlayer.currentTime = expectedTimeSeconds;
        }
        this._triggerOnChange();
    }

    // --- 导出方法 ---

    /** 启动播放器，连接 WebSocket */
    start() {
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
            this.connectWebSocket();
        }
    }

    /** 停止播放并断开连接 */
    stop() {
        this._handlePause();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        clearInterval(this.syncInterval);
        this.syncInterval = null;
    }

    /** 供外部控制播放/暂停 */
    togglePlayPause() {
        if (this.audioPlayer.paused) {
            this.audioPlayer.play().catch(e => console.error("Play failed:", e));
        } else {
            this.audioPlayer.pause();
        }
        this._triggerOnChange();
    }

    /** 供外部控制音量 */
    setVolume(volume) {
        this.audioPlayer.volume = volume;
        if (volume > 0) { this.audioPlayer.muted = false; }
        this._triggerOnChange();
    }

    /** 供外部控制进度条拖拽 */
    seekTo(timeInSeconds) {
        this.audioPlayer.currentTime = timeInSeconds;
        this._triggerOnChange();
    }
}

export default MeTMusicPlayer;