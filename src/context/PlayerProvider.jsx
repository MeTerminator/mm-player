import { useState, useRef, useCallback, useEffect } from 'react';
import { PlayerContext } from './PlayerContext';
import MeTMusicPlayer from '../utils/metmusic-player-esm';
import { parseLrc } from '../utils/lrc-parser';
import { getLocalStorageItem } from '../utils/localstorage-utils';

// 获取 Session ID
const SESSION_ID = getLocalStorageItem('sid') || "";

// 自动播放
const alwaysPlaying = true;

export const PlayerProvider = ({ children }) => {
    const audioRef = useRef(null);
    const playerRef = useRef(null);
    const parsedLyricsRef = useRef([]);
    const playerStateRef = useRef(null);

    const [playerState, setPlayerState] = useState({
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
        progressMax: 100,
        progressValue: 0,
        isWsOpen: false,
        alwaysPlaying: alwaysPlaying,
    });

    // ==================== 核心状态更新逻辑 (稳定化) ====================
    const handlePlayerStateChange = useCallback((playerInstance) => {
        if (!playerInstance || !playerInstance.audioPlayer) return;

        const state = playerInstance.getPlayerStatus();
        const audioEl = playerInstance.audioPlayer;

        const currentPlayerRef = playerRef.current;
        // 优先使用 playerInstance.songLyrics（prepareToPlay 会设置），否则回退到 songData.lyrics
        const lyricFromPlayer = currentPlayerRef?.songLyrics || currentPlayerRef?.songData?.lyrics || '';
        const songCoverPmid = currentPlayerRef?.songData?.track_info?.album?.pmid || '';

        // 仅在歌曲/歌词数据改变时才重新解析 LRC
        const newSongLrc = lyricFromPlayer;
        const prevSongLrc = playerStateRef.current?.songLrc || '';

        if (newSongLrc !== prevSongLrc) {
            parsedLyricsRef.current = parseLrc(newSongLrc || '');
        }

        setPlayerState(prevState => ({
            ...prevState,
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
            progressMax: audioEl.duration || prevState.progressMax,
            progressValue: audioEl.currentTime || prevState.progressValue,
            isWsOpen: playerInstance.ws?.readyState === WebSocket.OPEN
        }));
    }, []); // 无外部依赖，因为它使用了 ref 和稳定的 setPlayerState

    // ==================== 播放器初始化 (确保只执行一次) ====================
    useEffect(() => {
        const audioElement = audioRef.current;

        if (audioElement) {
            // 确保播放器实例只创建一次，这是保证 WS 客户端唯一性的关键。
            if (playerRef.current) return;

            const player = new MeTMusicPlayer(audioElement, SESSION_ID, {
                onChange: handlePlayerStateChange,
            });
            playerRef.current = player;

            handlePlayerStateChange(player);
            player.start();

            // 组件卸载时清理
            return () => {
                player.stop(); // 清理 WebSocket 和 Interval
            };
        }
    }, [handlePlayerStateChange]); // 依赖 handlePlayerStateChange

    // 把最新 playerState 同步到 ref（非常重要）
    useEffect(() => {
        playerStateRef.current = playerState;
    }, [playerState]);

    // ==================== 当 songMid 变化时，主动获取歌词（若缓存未命中则调用实例方法） ====================
    useEffect(() => {
        const mid = playerState.songMid;
        if (!mid || !playerRef.current) return;

        let cancelled = false;
        const player = playerRef.current;

        // 优先使用播放器内部缓存（midLyricsCache）或 player.songLyrics
        const cached = (player.midLyricsCache && player.midLyricsCache[mid]) || player.songLyrics;
        if (cached) {
            const ly = typeof cached === 'string' ? cached : String(cached);
            parsedLyricsRef.current = parseLrc(ly || '');
            // 更新 state 中的 songLrc（保证界面有歌词文本）
            setPlayerState(prev => ({ ...prev, songLrc: ly }));
            return;
        }

        // 否则调用实例的 _getSongLyrics（它返回 Promise）
        // 注意：_getSongLyrics 是私有方法，但在当前上下文可用，我们调用它以确保歌词获取
        player._getSongLyrics(mid).then(ly => {
            if (cancelled) return;
            const txt = ly || '';
            parsedLyricsRef.current = parseLrc(txt);
            setPlayerState(prev => ({ ...prev, songLrc: txt }));
        }).catch(e => {
            // 忽略错误，但记录日志（若 player 有日志方法可用）
            try { player._wsLog && player._wsLog('warn', 'LYRIC', '获取歌词失败', e); } catch {}
        });

        return () => { cancelled = true; };
    }, [playerState.songMid]);

    // ==================== Audio 时间事件监听 (高频更新) ====================
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
    }, []); // 依赖空数组，只在挂载/卸载时执行

    // ==================== 暴露给外部的函数/值 ====================
    const togglePlayback = useCallback(() => {
        const isWsOpen = playerRef.current?.ws?.readyState === WebSocket.OPEN;
        const currentState = playerStateRef.current;
        const isCurrentlyPlaying = currentState?.isPlaying;
        const isAlwaysPlaying = currentState?.alwaysPlaying;

        if (!isWsOpen && !isCurrentlyPlaying) return;

        if (isAlwaysPlaying && !isCurrentlyPlaying) {
            // 在 MeTMusicPlayer 中可能没有 play 方法（保持向后兼容）
            if (typeof playerRef.current.play === 'function') {
                playerRef.current.play();
            } else {
                playerRef.current?.audioPlayer?.play?.().catch(() => {});
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
            } catch (e) {
                // 某些浏览器/时序下会抛错，忽略
            }
        }
    }, []);

    const contextValue = {
        playerState,
        playerRef,
        audioRef,
        togglePlayback,
        seekTo,
    };

    useEffect(() => {
        const handleDocumentClick = () => {
            const audio = audioRef.current;
            const currentState = playerStateRef.current;

            if (audio && audio.paused && currentState?.songMid) {
                console.log('检测到用户点击，尝试恢复播放...');
                audio.play().catch(() => {});
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
