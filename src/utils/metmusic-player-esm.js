class MeTMusicPlayer {
    /**
     * @param {HTMLAudioElement} audioElement
     * @param {string} sessionId
     * @param {object} [options]
     * @param {Function} [options.onChange]
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

        // 时间与播放相关
        this.currentServerStartTime = 0; // ms
        this.serverLocalTimeDiff = 0; // serverTimeMs - localTimeMs

        // 缓存
        this.midUrlCache = {};     // { mid: { url, track_info } }
        this.midLyricsCache = {};  // { mid: lyricsText }

        // 状态
        this.isSeekPending = false;
        this.musicStatus = false;  // 是否在播放状态（来自 ws）
        this.musicMid = "";
        this.lastUpdateTs = 0; // 本地最后收到反馈时间
        this.lastMusicMid = "";
        this.lastMusicStartTs = 0;

        // loading metrics
        this.loadingTimes = [];
        this.loadingStartTime = 0;
        this.averageLoadingTime = 1000;
        this.minPreloadTime = 500;

        // intervals
        this.statusInterval = null; // 用于 ws 状态检查（heartbeat-like）
        this.syncInterval = null;   // 用于播放期间的时间对齐检测

        // song info
        this.songData = null;
        this.songLyrics = null;
        this.isBuffering = false;

        // throttle trigger onChange
        this._lastTriggerTs = 0;
        this._triggerThrottleMs = 200;

        this._init();
    }

    _init() {
        this._bindEvents();
        this._initMediaSession();
    }

    // ---------- Logging ----------
    _wsLog(level = 'log', tag = 'WS', msg = '', data = null) {
        const time = new Date().toISOString();
        const base = `[${time}] [${tag}] ${msg}`;
        const css = 'padding:2px 6px; border-radius:3px;';

        if (level === 'log') {
            console.log(`%c${base}`, `${css}background:#eef; color:#036;`, data ?? '');
        } else if (level === 'info') {
            console.info(`%c${base}`, `${css}background:#def; color:#045;`, data ?? '');
        } else if (level === 'warn') {
            console.warn(`%c${base}`, `${css}background:#ffd; color:#865200;`, data ?? '');
        } else if (level === 'error') {
            console.error(`%c${base}`, `${css}background:#fdd; color:#900;`, data ?? '');
        } else {
            console.log(`%c${base}`, `${css}`, data ?? '');
        }
    }

    // ---------- onChange 节流触发 ----------
    _triggerOnChange(force = false) {
        if (!this.onChangeCallback || typeof this.onChangeCallback !== 'function') return;
        const now = Date.now();
        if (force || now - this._lastTriggerTs >= this._triggerThrottleMs) {
            this._lastTriggerTs = now;
            try {
                this.onChangeCallback(this);
            } catch (e) {
                console.error("onChange 回调异常:", e);
            }
        }
    }

    // ---------- 时间格式 ----------
    _formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "0:00";
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    }

    // ---------- DOM Audio 事件 ----------
    _bindEvents() {
        // canplay: 播放器有数据可播放 -> 处理 pending seek 和开始播放
        this.audioPlayer.addEventListener('canplay', () => {
            this.isBuffering = false;
            const loadingTime = Date.now() - this.loadingStartTime;
            if (loadingTime > 0) this._addLoadingTime(loadingTime);

            if (this.isSeekPending) {
                // 根据服务器-本地时间差和 currentServerStartTime 计算应该 seek 到的时间（秒）
                const expectedServerPlayTimeMs = (Date.now() + this.serverLocalTimeDiff) - this.currentServerStartTime;
                const accurateSeekTime = Math.max(0, expectedServerPlayTimeMs / 1000);
                // 保证不超过 duration（如果有）
                if (!isNaN(this.audioPlayer.duration) && this.audioPlayer.duration > 0) {
                    this.audioPlayer.currentTime = Math.min(accurateSeekTime, this.audioPlayer.duration);
                } else {
                    this.audioPlayer.currentTime = accurateSeekTime;
                }
                this.isSeekPending = false;
            }

            // 自动尝试播放（任何自动播放错误都记录）
            this.audioPlayer.play().catch(error => {
                this._wsLog('warn', 'AUDIO', '播放尝试失败（可能受浏览器策略限制）', error);
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
            this._triggerOnChange();
        });

        this.audioPlayer.addEventListener('ended', () => {
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
            this._triggerOnChange();
        });

        this.audioPlayer.addEventListener('timeupdate', () => {
            // 每次 timeupdate 更新 media session position（节制）
            this._updateMediaSessionPositionState();
            this._triggerOnChange();
        });

        this.audioPlayer.addEventListener('durationchange', () => {
            this._updateMediaSessionPositionState();
            this._triggerOnChange();
        });

        // 可选：监听错误以便更好地定位问题
        this.audioPlayer.addEventListener('error', (e) => {
            this._wsLog('error', 'AUDIO', 'audio element error', e);
        });
    }

    // ---------- Media Session ----------
    _initMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => {
                this.audioPlayer.play().catch(e => this._wsLog('error', 'MediaSession', 'Play Error', e));
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                this.audioPlayer.pause();
            });
        }
    }

    _updateMediaSessionMetadata(trackInfo) {
        if (!('mediaSession' in navigator)) return;

        if (trackInfo) {
            let artworkUrl = trackInfo.album?.coverUrl || trackInfo.album?.pic || '';
            navigator.mediaSession.metadata = new MediaMetadata({
                title: trackInfo.title || '未知歌曲',
                artist: trackInfo.singer?.map(s => s.name).join(', ') || '未知歌手',
                album: trackInfo.album?.name || '未知专辑',
                artwork: artworkUrl ? [{ src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : []
            });
        } else {
            navigator.mediaSession.metadata = null;
        }
    }

    _updateMediaSessionPositionState() {
        if ('mediaSession' in navigator) {
            const dur = this.audioPlayer.duration;
            const pos = this.audioPlayer.currentTime;
            if (isFinite(dur) && dur > 0 && isFinite(pos)) {
                try {
                    navigator.mediaSession.setPositionState({
                        duration: dur,
                        playbackRate: this.audioPlayer.playbackRate,
                        position: pos
                    });
                } catch (e) {
                    // 某些浏览器对 positionState 有限制，静默处理
                }
            }
        }
    }

    // ---------- 状态导出 ----------
    getPlayerStatus() {
        const isAudioPlaying = !this.audioPlayer.paused && !this.audioPlayer.ended && !this.isBuffering;
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
            startTime: this.currentServerStartTime, // ms
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

    // ---------- loading time avg ----------
    _addLoadingTime(timeInMs) {
        this.loadingTimes.push(timeInMs);
        if (this.loadingTimes.length > 8) this.loadingTimes.shift();
        const sum = this.loadingTimes.reduce((a, b) => a + b, 0);
        this.averageLoadingTime = sum / this.loadingTimes.length;
        this._wsLog('info', 'METRIC', `平均加载时间: ${this.averageLoadingTime.toFixed(0)}ms`);
    }

    // ---------- WebSocket 管理 ----------
    connectWebSocket() {
        const wsUrl = "wss://music.met6.top:444/api-client/ws/listen";
        try {
            this.ws = new WebSocket(wsUrl);
        } catch (e) {
            this._wsLog('error', 'WS', 'WebSocket 构造失败', e);
            return;
        }

        this.ws.onopen = () => {
            this._wsLog('info', 'WS', '连接已打开', { url: wsUrl });
            this._sendWs({ type: "time" });
            this._sendWs({ type: "listen", SessionId: [this.SID] });

            // statusInterval 用于定期检查是否超时（如超过 12s 无更新则认为暂停）
            if (!this.statusInterval) {
                this.statusInterval = setInterval(() => this._statusCheck(), 1000);
            }
            this._triggerOnChange(true);
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this._wsLog('log', 'WS:R', '收到消息', data);

                if (data.type === "time" && data.status === "ok" && typeof data.timestamp === 'number') {
                    const serverTimeMs = data.timestamp;
                    const localTimeMs = Date.now();
                    this.serverLocalTimeDiff = serverTimeMs - localTimeMs;
                    this._wsLog('info', 'SYNC', `时间同步成功，server-local diff: ${this.serverLocalTimeDiff}ms`);
                }

                if (data.type === "feedback" && data.SessionId === this.SID && data.data) {
                    // 更新 lastUpdateTs
                    this.lastUpdateTs = Date.now();

                    const payload = data.data;
                    const newStatus = payload.status;
                    const newMid = payload.songMid || "";
                    const musicStartTs = payload.systemTime - (payload.currentTime || 0) * 1000;

                    this.musicStatus = newStatus;
                    this.musicMid = newMid;

                    // 更新播放状态
                    this._updateMusicStatus(newStatus, newMid, musicStartTs);

                    // 自动开始播放音乐（仅当收到反馈并处于播放状态时）
                    if (newStatus && this.audioPlayer.paused) {
                        this.audioPlayer.play().catch(err => {
                            this._wsLog('warn', 'AUTO-PLAY', '接收到 feedback 后自动播放失败', err);
                        });
                    }
                }

            } catch (e) {
                this._wsLog('error', 'WS', '解析消息失败', { error: e, raw: event.data });
            }
        };

        this.ws.onclose = (ev) => {
            this._wsLog('warn', 'WS', '连接已关闭，尝试重连', ev);
            // 清理 interval
            if (this.statusInterval) {
                clearInterval(this.statusInterval);
                this.statusInterval = null;
            }
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
                this.syncInterval = null;
            }
            // 重连（指数退避等可按需加入）
            setTimeout(() => this.connectWebSocket(), 3000);
            this._triggerOnChange(true);
        };

        this.ws.onerror = (error) => {
            this._wsLog('error', 'WS', 'WebSocket 错误', error);
            this._triggerOnChange();
        };
    }

    _sendWs(obj) {
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify(obj));
                this._wsLog('log', 'WS:S', '发送消息', obj);
            }
        } catch (e) {
            this._wsLog('error', 'WS', '发送消息失败', e);
        }
    }

    // ---------- 处理播放状态变更 ----------
    _updateMusicStatus(currentStatus, currentMid, currentStartTs) {
        // currentStartTs 单位：ms
        if (currentStatus) {
            const isNewSong = currentMid !== this.lastMusicMid;
            const isTimeDrifted = Math.abs(currentStartTs - this.lastMusicStartTs) > 500;

            this.lastMusicStartTs = currentStartTs;
            this.lastMusicMid = currentMid;

            if (isNewSong || isTimeDrifted) {
                // 计算预加载与延迟（尽量在歌曲播放前加载完）
                const preloadTime = Math.max(this.averageLoadingTime, this.minPreloadTime);
                const targetLoadFinishTimeServer = currentStartTs - preloadTime;
                // 目标本地时间 = targetLoadFinishTimeServer - serverLocalTimeDiff
                const targetLocalFinish = targetLoadFinishTimeServer - this.serverLocalTimeDiff;
                const delay = Math.max(0, targetLocalFinish - Date.now());

                this._wsLog('info', 'PRELOAD', `新歌或时间变化：mid=${currentMid}, startTs=${currentStartTs}, preload=${preloadTime}ms, delayLocal=${Math.round(delay)}ms`);

                // 延迟执行预加载（延迟为 0 时立刻执行）
                setTimeout(() => this._prepareToPlay(currentMid, currentStartTs), delay);
            }
        } else {
            // 暂停/停止
            this._handlePause();
        }

        this._triggerOnChange(true);
    }

    _statusCheck() {
        // 若超过 12s 未收到服务器反馈，则判定停止播放状态
        if (this.musicStatus && (Date.now() - this.lastUpdateTs > 12000)) {
            this._wsLog('warn', 'STATUS', '超过 12s 未收到更新，设为暂停状态');
            this.musicStatus = false;
            this._updateMusicStatus(false, "", 0);
        }
        this._triggerOnChange();
    }

    // ---------- 获取歌曲 URL / 歌词（含缓存） ----------
    async _getSongUrl(mid) {
        if (!mid) return "";
        if (this.midUrlCache[mid] && this.midUrlCache[mid].url) {
            return this.midUrlCache[mid].url;
        }
        try {
            const response = await fetch(`https://music.met6.top:444/api/song/url/v1/?id=${mid}&level=hq`);
            const data = await response.json();
            // data.data[0] 包含 url 与 track_info
            const entry = data.data?.[0] || null;
            const url = entry?.url || "";
            const track_info = entry?.track_info || entry?.track || null;
            this.midUrlCache[mid] = {
                url: url,
                track_info: track_info
            };
            // 保持 songData 的基本信息（不覆盖现有 lyrics）
            if (!this.songData || this.songData.mid !== mid) {
                this.songData = { mid, ...entry };
            } else {
                // 合并避免覆盖 lyrics
                this.songData = Object.assign({}, this.songData, entry);
            }
            return url;
        } catch (e) {
            this._wsLog('error', 'FETCH', '获取歌曲链接失败', e);
            return "";
        }
    }

    async _getSongLyrics(mid) {
        if (!mid) return "";
        if (this.midLyricsCache[mid]) return this.midLyricsCache[mid];
        try {
            const response = await fetch(`https://music.met6.top:444/api/songlyric_get.php?show=lyric&mid=${mid}`);
            const lyrics = await response.text();
            this.midLyricsCache[mid] = lyrics;
            // 也更新当前 songData（如果匹配）
            if (this.songData && this.songData.mid === mid) {
                this.songData.lyrics = lyrics;
            }
            return lyrics;
        } catch (e) {
            this._wsLog('error', 'FETCH', '获取歌词失败', e);
            return "";
        }
    }

    // ---------- 预加载并准备播放 ----------
    async _prepareToPlay(mid, startTimeMs) {
        if (!mid) {
            this._wsLog('warn', 'PREPARE', '没有提供 mid，取消准备播放');
            return;
        }

        this.isBuffering = true;
        this.loadingStartTime = Date.now();

        // 先尝试从缓存或网络获取 url 与 track info
        let cached = this.midUrlCache[mid];
        let songUrl = cached?.url || "";
        let trackInfo = cached?.track_info || null;

        if (!songUrl) {
            songUrl = await this._getSongUrl(mid);
            // trackInfo 可能已经被写入 cache
            trackInfo = this.midUrlCache[mid]?.track_info || trackInfo;
        }

        // 并行请求歌词（非阻塞）
        this._getSongLyrics(mid).then(ly => {
            this.songLyrics = ly;
            this._triggerOnChange();
        });

        if (!songUrl) {
            this.isBuffering = false;
            this._wsLog('error', 'PREPARE', `无法获取歌曲 URL，mid=${mid}`);
            this._updateSongInfo(null);
            return;
        }

        // 变更音源，load -> canplay 会触发 seek/play
        try {
            // 暂停并替换 src
            this.audioPlayer.pause();
            // 避免重复赋值导致 load 触发问题
            if (this.audioPlayer.src !== songUrl) {
                this.audioPlayer.src = songUrl;
            }
            this.audioPlayer.load();

            // 更新 server-start-time（ms）
            this.currentServerStartTime = startTimeMs;
            this.musicMid = mid;

            // 更新 media session metadata（只在 trackInfo 可用时）
            if (trackInfo) {
                this._updateSongInfo(trackInfo);
            } else {
                // 若还没 trackInfo，也可以尝试在 cache 中查找
                const cached2 = this.midUrlCache[mid];
                if (cached2?.track_info) {
                    this._updateSongInfo(cached2.track_info);
                } else {
                    // 清空 metadata（若没有信息）
                    this._updateSongInfo(null);
                }
            }

            // 标记需要在 canplay 时 seek
            this.isSeekPending = true;

            // 重置并启动播放时的同步检测 interval（syncInterval）
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
                this.syncInterval = null;
            }
            this.syncInterval = setInterval(() => this._checkAndSync(), 1000);
        } catch (e) {
            this._wsLog('error', 'PREPARE', '设置音源或加载失败', e);
            this.isBuffering = false;
            this._triggerOnChange();
        }

        this._triggerOnChange();
    }

    _updateSongInfo(trackInfo) {
        // trackInfo 可能为 null（清除 metadata）
        this.songData = Object.assign({}, this.songData || {}, trackInfo ? { track_info: trackInfo } : {});
        this._updateMediaSessionMetadata(trackInfo);
        this._triggerOnChange();
    }

    // ---------- 处理暂停/停止 ----------
    _handlePause() {
        try {
            this.audioPlayer.pause();
            this.isBuffering = false;
            // 清除 src（避免继续占用网络）
            if (this.audioPlayer.src) {
                this.audioPlayer.src = "";
                this.audioPlayer.load();
            }

            if ('mediaSession' in navigator) {
                navigator.mediaSession.metadata = null;
                navigator.mediaSession.playbackState = 'paused';
            }
        } catch (e) {
            this._wsLog('error', 'PAUSE', '暂停处理异常', e);
        }

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        // statusInterval 不在这里清除，保持 ws 状态检查继续运行
        this._triggerOnChange();
    }

    // ---------- 播放时校准 ----------
    _checkAndSync() {
        // 仅当确实在播放且已加载好音源时才校准
        if (!this.musicStatus || !this.audioPlayer.src || this.audioPlayer.paused || this.audioPlayer.ended || this.isBuffering) {
            return;
        }

        const expectedServerPlayTimeMs = (Date.now() + this.serverLocalTimeDiff) - this.currentServerStartTime;
        const expectedTimeSeconds = Math.max(0, expectedServerPlayTimeMs / 1000);

        const actualTime = this.audioPlayer.currentTime;
        const timeDiff = Math.abs(expectedTimeSeconds - actualTime);

        if (timeDiff > 0.5) {
            this._wsLog('warn', 'SYNC', `检测到时间差 ${timeDiff.toFixed(2)}s，正在同步到 ${expectedTimeSeconds.toFixed(2)}s`);
            try {
                // 尝试平滑跳转：当偏差很大直接设置
                this.audioPlayer.currentTime = expectedTimeSeconds;
            } catch (e) {
                this._wsLog('error', 'SYNC', '调整 currentTime 失败', e);
            }
        }
        this._triggerOnChange();
    }

    // ---------- 外部方法 ----------
    start() {
        if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
            this.connectWebSocket();
        } else {
            this._wsLog('info', 'START', 'WebSocket 已处于打开状态');
        }
    }

    stop() {
        this._handlePause();
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {
                // ignore
            }
            this.ws = null;
        }
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this._triggerOnChange(true);
    }

    togglePlayPause() {
        if (this.audioPlayer.paused) {
            this.audioPlayer.play().catch(e => this._wsLog('error', 'PLAY', 'Play failed', e));
        } else {
            this.audioPlayer.pause();
        }
        this._triggerOnChange();
    }

    setVolume(volume) {
        this.audioPlayer.volume = Math.max(0, Math.min(1, volume));
        if (volume > 0) { this.audioPlayer.muted = false; }
        this._triggerOnChange();
    }

    seekTo(timeInSeconds) {
        try {
            // 手动 seek 时清除 isSeekPending
            this.isSeekPending = false;
            this.audioPlayer.currentTime = Math.max(0, timeInSeconds);
        } catch (e) {
            this._wsLog('error', 'SEEK', '手动 seek 失败', e);
        }
        this._triggerOnChange();
    }
}

export default MeTMusicPlayer;
