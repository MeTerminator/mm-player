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
    songLrc: '',
    statusText: '未连接',
    currentTime: '0:00',
    duration: '0:00',
    currentLyrics: '',
    volume: 1.0,
    isBuffering: false,
    progressMax: 100, // 默认值
    progressValue: 0, // 默认值
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
            songLrc: newSongLrc,
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

    useEffect(() => {
        const audioElement = audioRef.current;

        if (audioElement) {
            if (playerRef.current) return;

            let analyser, source, audioCtx;
            let dataArray, bufferLength;

            const player = new MeTMusicPlayer(audioElement, SESSION_ID, {
                onChange: handlePlayerStateChange,
            });
            playerRef.current = player;

            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }

                analyser = audioCtx.createAnalyser();
                source = audioCtx.createMediaElementSource(audioElement);
                source.connect(analyser);
                analyser.connect(audioCtx.destination);

                // 增加 FFT size 获取更多频率数据
                analyser.fftSize = 2048;
                bufferLength = analyser.frequencyBinCount;

                dataArray = new Uint8Array(bufferLength);
                audioDataArrayRef.current = dataArray;
                analyserRef.current = analyser;
                audioCtxRef.current = audioCtx;

            } catch (e) {
                console.error("Web Audio API setup error during initialization:", e);
                // 清理所有已创建的资源
                if (source) source.disconnect();
                if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
                analyserRef.current = null;
                audioDataArrayRef.current = null;
                audioCtxRef.current = null;
            }


            handlePlayerStateChange(player);
            player.start();

            // 组件卸载时清理
            return () => {
                player.stop(); // 清理 WebSocket 和 Interval

                // 异步清理 Web Audio 资源，解决 InvalidStateError
                setTimeout(() => {
                    if (source) source.disconnect();
                    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
                    // 在清理函数中清空 Ref，确保下次挂载时能重新初始化
                    analyserRef.current = null;
                    audioCtxRef.current = null;
                    audioDataArrayRef.current = null;
                }, 0);
            };
        }
    }, [handlePlayerStateChange]);


    // ==================== Audio 数据高频读取 (RequestAnimationFrame 循环) ====================
    useEffect(() => {
        let frameId;
        // 直接从 useRef 中读取值
        const analyser = analyserRef.current;
        const dataArray = audioDataArrayRef.current;

        // 如果 analyser 或 dataArray 不存在，说明 Web Audio 初始化失败或还未完成，直接退出
        if (!analyser || !dataArray) {
            return;
        }

        const updateAudioData = () => {
            // 将当前音频的频率数据复制到 dataArray 中
            analyser.getByteFrequencyData(dataArray);

            // 循环调用
            frameId = requestAnimationFrame(updateAudioData);
        };

        updateAudioData();

        // 清理函数：停止 requestAnimationFrame 循环
        return () => {
            if (frameId) {
                cancelAnimationFrame(frameId);
            }
        };
    }, []);

    useEffect(() => {
        playerStateRef.current = playerState;
        setupMediaSession(playerState, playerRef.current);
    }, [playerState]);

    useEffect(() => {
        const mid = playerState.songMid;
        if (!mid || !playerRef.current) return;

        let cancelled = false;
        const player = playerRef.current;

        const cached = (player.midLyricsCache && player.midLyricsCache[mid]) || player.songLyrics;
        if (cached) {
            const ly = typeof cached === 'string' ? cached : String(cached);
            parsedLyricsRef.current = parseLrc(ly || '');
            setPlayerState(prev => ({ ...prev, songLrc: ly }));
            return;
        }

        player._getSongLyrics(mid).then(ly => {
            if (cancelled) return;
            const txt = ly || '';
            parsedLyricsRef.current = parseLrc(txt);
            setPlayerState(prev => ({ ...prev, songLrc: txt }));
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

            if (lyrics.length > 0) {
                let foundLine = lyrics[0] || { text: '' };
                for (let i = 0; i < lyrics.length; i++) {
                    if ((currentTime + 0.3) >= lyrics[i].time) {
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

    // 文档点击事件处理
    useEffect(() => {
        const handleDocumentClick = () => {
            const audio = audioRef.current;
            const currentState = playerStateRef.current;

            if (audio && audio.paused && currentState?.songMid) {
                console.log('检测到用户点击，尝试恢复播放...');
                audio.play().catch(() => { });
            }
        };

        document.body.addEventListener('click', handleDocumentClick, true);

        return () => {
            document.body.removeEventListener('click', handleDocumentClick, true);
        };
    }, []);

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