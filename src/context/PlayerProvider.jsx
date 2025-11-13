import { useState, useRef, useCallback, useEffect } from 'react';
import { PlayerContext } from './PlayerContext';
import MeTMusicPlayer from '../utils/metmusic-player-esm';
import { parseLrc } from '../utils/lrc-parser';
import { getLocalStorageItem } from '../utils/localstorage-utils';

// 获取 Session ID
const SESSION_ID = getLocalStorageItem('sid') || "";

// 自动播放
const alwaysPlaying = true;

const INITIAL_PLAYER_STATE = {
    isPlaying: false,
    songName: '',
    songSinger: '',
    songAlbum: '',
    songCoverPmid: '',
    songCoverUrl: '',
    songMid: '',
    songLyricsLines: [],
    statusText: '未连接',
    currentTime: '0:00',
    duration: '0:00',
    currentLyrics: '',
    currentLyricsIndex: 0,
    volume: 1.0,
    isBuffering: false,
    progressMax: 100,
    progressValue: 0,
    isWsOpen: false,
    alwaysPlaying: alwaysPlaying,
};

// **==================== Media Session ====================**
const setupMediaSession = (state, player) => {
    if ('mediaSession' in navigator) {
        const { songName, songSinger, songAlbum, songCoverUrl, isPlaying } = state;

        if (songName) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: songName || '未知歌曲',
                artist: songSinger || '未知歌手',
                album: songAlbum || '未知专辑',
                artwork: songCoverUrl ? [{ src: songCoverUrl, sizes: '512x512', type: 'image/jpeg' }] : [],
            });
        }

        if (navigator.mediaSession.playbackState) {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        }

        const actions = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'];
        actions.forEach(action => {
            try {
                navigator.mediaSession.setActionHandler(action, null);
            } catch {
                // 忽略不支持的操作类型
            }
        });

        navigator.mediaSession.setActionHandler('play', () => {
            player?.audioPlayer?.play?.().catch(() => { });
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            player?.audioPlayer?.pause?.();
        });

        if (player) {
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                player.prev?.();
            });

            navigator.mediaSession.setActionHandler('nexttrack', () => {
                player.next?.();
            });
        }

        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            const seekTime = (details.seekOffset || 10);
            const audio = player?.audioPlayer;
            if (audio) {
                audio.currentTime = Math.max(0, audio.currentTime - seekTime);
            }
        });

        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            const seekTime = (details.seekOffset || 10);
            const audio = player?.audioPlayer;
            if (audio) {
                audio.currentTime = Math.min(audio.duration, audio.currentTime + seekTime);
            }
        });

        navigator.mediaSession.setActionHandler('seekto', (details) => {
            const audio = player?.audioPlayer;
            if (audio && details.seekTime !== undefined) {
                audio.currentTime = details.seekTime;
            }
        });

        const audio = player?.audioPlayer;
        const isValidDuration = audio?.duration > 0;

        if (audio && 'setPositionState' in navigator.mediaSession && isValidDuration) {
            navigator.mediaSession.setPositionState({
                duration: audio.duration,
                playbackRate: audio.playbackRate,
                position: audio.currentTime,
            });
        }
    }
};

export const PlayerProvider = ({ children }) => {
    const audioRef = useRef(null);
    const audioDataArrayRef = useRef(null);
    const analyserRef = useRef(null);
    const audioCtxRef = useRef(null);
    const playerRef = useRef(null);
    const parsedLyricsRef = useRef([]);
    const playerStateRef = useRef(null);

    const [playerState, setPlayerState] = useState(INITIAL_PLAYER_STATE);
    const [isAudioInitialized, setIsAudioInitialized] = useState(false);
    
    // 跟踪是否已经尝试过首次用户交互
    const [hasUserInteracted, setHasUserInteracted] = useState(false);

    /**
     * @description Web Audio API 初始化函数。
     */
    const initWebAudio = useCallback(() => {
        const audioElement = audioRef.current;
        // 如果已初始化或音频元素不存在，则退出
        if (!audioElement || analyserRef.current) return;

        let analyser, source, audioCtx;
        let dataArray, bufferLength;

        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtxRef.current = audioCtx; 
            
            // 确保 context 已连接
            if (audioCtx.state !== 'closed') {
                analyser = audioCtx.createAnalyser();
                source = audioCtx.createMediaElementSource(audioElement);
                source.connect(analyser);
                analyser.connect(audioCtx.destination);

                analyser.fftSize = 256;
                bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);

                audioDataArrayRef.current = dataArray;
                analyserRef.current = analyser;
                
                setIsAudioInitialized(true); 
                console.log("Web Audio API initialized and connected.");
            } else {
                 console.warn("Web Audio API failed to initialize: context closed.");
            }

        } catch (e) {
            console.error("Web Audio API setup error during runtime:", e);
            if (source) source.disconnect();
            if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
            analyserRef.current = null;
            audioDataArrayRef.current = null;
            audioCtxRef.current = null;
            setIsAudioInitialized(false); 
        }
    }, [setIsAudioInitialized]); 

    const handlePlayerStateChange = useCallback((playerInstance) => {
        if (!playerInstance || !playerInstance.audioPlayer) return;

        const state = playerInstance.getPlayerStatus();
        const audioEl = playerInstance.audioPlayer;

        const currentPlayerRef = playerRef.current;
        const lyricFromPlayer = currentPlayerRef?.songLyrics || currentPlayerRef?.songData?.lyrics || '';
        const songCoverPmid = currentPlayerRef?.songData?.track_info?.album?.pmid || '';

        const newSongLrc = lyricFromPlayer;
        const prevSongLrc = playerStateRef.current?.songLrc || '';

        if (newSongLrc !== prevSongLrc) {
            parsedLyricsRef.current = parseLrc(newSongLrc || '');
        }

        const fallbackProgressMax = playerStateRef.current?.progressMax ?? INITIAL_PLAYER_STATE.progressMax;
        const fallbackProgressValue = playerStateRef.current?.progressValue ?? INITIAL_PLAYER_STATE.progressValue;

        const newPlayerState = {
            isPlaying: state.isPlaying,
            songName: currentPlayerRef?.songData?.track_info?.title || '',
            songSinger: currentPlayerRef?.songData?.track_info?.singer?.map(s => s.name || s.title).join(' / ') || '-',
            songAlbum: currentPlayerRef?.songData?.track_info?.album?.name || '-',
            songCoverPmid: songCoverPmid,
            songCoverUrl: songCoverPmid ? `https://y.qq.com/music/photo_new/T002R800x800M000${songCoverPmid}.jpg` : '',
            songMid: state.songMid,
            songLyricsLines: parsedLyricsRef.current,
            statusText: state.statusText,
            currentTime: state.formattedCurrentTime,
            duration: state.formattedDuration,
            volume: state.volume,
            isBuffering: state.isBuffering,
            progressMax: audioEl.duration || fallbackProgressMax,
            progressValue: audioEl.currentTime || fallbackProgressValue,
            isWsOpen: playerInstance.ws?.readyState === WebSocket.OPEN
        };

        setPlayerState(prevState => ({
            ...prevState,
            ...newPlayerState,
            alwaysPlaying: alwaysPlaying,
        }));
    }, []);

    // Player 初始化
    useEffect(() => {
        const audioElement = audioRef.current;

        if (audioElement) {
            if (playerRef.current) return;

            // 初始化 MeTMusicPlayer
            const player = new MeTMusicPlayer(audioElement, SESSION_ID, {
                onChange: handlePlayerStateChange,
            });
            playerRef.current = player;
            
            handlePlayerStateChange(player);
            player.start();

            // 组件卸载时清理
            return () => {
                player.stop(); // 清理 WebSocket 和 Interval

                // 异步清理 Web Audio 资源
                setTimeout(() => {
                    const audioCtx = audioCtxRef.current;
                    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
                    analyserRef.current = null;
                    audioCtxRef.current = null;
                    audioDataArrayRef.current = null;
                    setIsAudioInitialized(false);
                }, 0);
            };
        }
    }, [handlePlayerStateChange]);

    // Audio 数据高频读取 (RequestAnimationFrame 循环)
    useEffect(() => {
        let frameId;
        
        if (!isAudioInitialized) {
            return;
        }

        const analyser = analyserRef.current;
        const dataArray = audioDataArrayRef.current;

        if (!analyser || !dataArray) {
            return; 
        }

        const updateAudioData = () => {
            analyser.getByteFrequencyData(dataArray);
            frameId = requestAnimationFrame(updateAudioData);
        };

        updateAudioData();

        return () => {
            if (frameId) {
                cancelAnimationFrame(frameId);
            }
        };
    }, [isAudioInitialized]); 

    useEffect(() => {
        playerStateRef.current = playerState;
        setupMediaSession(playerState, playerRef.current);
    }, [playerState]);

    useEffect(() => {
        const mid = playerState.songMid;
        if (!mid || !playerRef.current) return;

        let cancelled = false;
        const player = playerRef.current;

        playerState.currentLyricsIndex = -1;
        playerState.currentLyrics = '';
        playerState.songLyricsLines = [];

        const cached = (player.midLyricsCache && player.midLyricsCache[mid]) || player.songLyrics;
        if (cached) {
            const ly = typeof cached === 'string' ? cached : String(cached);
            parsedLyricsRef.current = parseLrc(ly || '');
            setPlayerState(prev => ({ ...prev, songLyricsLines: parsedLyricsRef.current }));
            return;
        }

        player._getSongLyrics(mid).then(ly => {
            if (cancelled) return;
            const txt = ly || '';
            parsedLyricsRef.current = parseLrc(txt);
            setPlayerState(prev => ({ ...prev, songLyricsLines: parsedLyricsRef.current }));
        }).catch(e => {
            try { player._wsLog && player._wsLog('warn', 'LYRIC', '获取歌词失败', e); } catch {
                // 忽略错误
            }
        });

        return () => { cancelled = true; };
    }, [playerState.songMid]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            if (!playerRef.current) return;

            const currentTime = audio.currentTime || 0;
            const formattedTime = playerRef.current?._formatTime(currentTime) || '0:00';
            let currentLineText = '';
            const lyrics = parsedLyricsRef.current || [];
            let currentLyricsIndex = -1;

            if (lyrics.length > 0) {
                let foundLine = lyrics[0] || { text: '' };
                for (let i = 0; i < lyrics.length; i++) {
                    if ((currentTime + 0.3) >= lyrics[i].time) {
                        currentLyricsIndex = i;
                        foundLine = lyrics[i];
                    } else {
                        break;
                    }
                }
                currentLineText = foundLine.text || '';
            }

            setPlayerState(prev => ({
                ...prev,
                progressValue: currentTime,
                currentTime: formattedTime,
                currentLyrics: currentLineText,
                currentLyricsIndex: currentLyricsIndex,
            }));

            const isValidDuration = audio?.duration > 0;

            if (audio && 'mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && isValidDuration) {
                navigator.mediaSession.setPositionState({
                    duration: audio.duration,
                    playbackRate: audio.playbackRate,
                    position: currentTime,
                });
            }
        };

        const handleDurationChange = () => {
            if (audioRef.current) {
                setPlayerState(prev => ({
                    ...prev,
                    progressMax: audioRef.current.duration || prev.progressMax,
                    duration: playerRef.current?._formatTime(audioRef.current.duration) || prev.duration,
                }));
            }
        };

        audio.addEventListener("timeupdate", handleTimeUpdate);
        audio.addEventListener("durationchange", handleDurationChange);

        return () => {
            audio.removeEventListener("timeupdate", handleTimeUpdate);
            audio.removeEventListener("durationchange", handleDurationChange);
        };
    }, []);

    const togglePlayback = useCallback(() => {
        const isWsOpen = playerRef.current?.ws?.readyState === WebSocket.OPEN;
        const currentState = playerStateRef.current;
        const isCurrentlyPlaying = currentState?.isPlaying;
        const isAlwaysPlaying = currentState?.alwaysPlaying;

        if (!isWsOpen && !isCurrentlyPlaying) return;

        if (isAlwaysPlaying && !isCurrentlyPlaying) {
            if (typeof playerRef.current.play === 'function') {
                playerRef.current.play();
            } else {
                playerRef.current?.audioPlayer?.play?.().catch(() => { });
            }
        } else if (isAlwaysPlaying && isCurrentlyPlaying) {
            console.log('持续播放已启用，无法暂停');
        }
        else {
            playerRef.current?.togglePlayPause();
        }
    }, []);

    const seekTo = useCallback((time) => {
        if (audioRef.current && playerRef.current) {
            try {
                audioRef.current.currentTime = time;

                if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
                    navigator.mediaSession.setPositionState({
                        position: time,
                    });
                }

            } catch {
                // 忽略
            }
        }
    }, []);

    const contextValue = {
        playerState,
        playerRef,
        audioRef,
        togglePlayback,
        seekTo,
        audioDataArrayRef,
    };

    // 文档点击事件处理 (用于触发 Web Audio 初始化和播放)
    useEffect(() => {
        const handleDocumentClick = () => {
            const audio = audioRef.current;
            const audioCtx = audioCtxRef.current;
            const playerState = playerStateRef.current;

            if (!analyserRef.current) {
                initWebAudio();
            }
            
            if (audioCtx && audioCtx.state === 'suspended') {
                 audioCtx.resume().catch(e => console.error("AudioContext resume failed on click:", e));
            }

            // 3. 强制尝试播放 <audio> 元素
            if (audio && playerState.songMid !== '') {
                console.log('检测到用户点击，强制尝试恢复播放...');
                // 确保我们设置了交互状态，以便其他逻辑（如播放器内部）可以判断
                if (!hasUserInteracted) {
                    setHasUserInteracted(true);
                }
                
                audio.play().catch(error => {
                    // 记录错误，通常是 NotAllowedError 或等待歌曲数据加载
                    console.warn("播放尝试失败:", error.message);
                });
            }
        };

        // 监听 body 上的点击和触摸事件，确保捕获到用户交互
        document.body.addEventListener('click', handleDocumentClick, { capture: true });
        document.body.addEventListener('touchstart', handleDocumentClick, { capture: true });


        return () => {
            document.body.removeEventListener('click', handleDocumentClick, { capture: true });
            document.body.removeEventListener('touchstart', handleDocumentClick, { capture: true });
        };
    }, [initWebAudio, hasUserInteracted]);

    return (
        <PlayerContext.Provider value={contextValue}>
            <audio
                ref={audioRef}
                id="global-audio-player"
                crossOrigin="anonymous"
                preload="auto"
            />
            {children}
        </PlayerContext.Provider>
    );
};