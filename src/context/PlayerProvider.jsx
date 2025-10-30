import React, { useState, useRef, useCallback, useEffect } from 'react';
// 从新文件导入 Context
import { PlayerContext } from './PlayerContext';
import MeTMusicPlayer from '../utils/metmusic-player-esm';
import { parseLrc } from '../utils/lrc-parser';

const SESSION_ID = "bd33aedc-72b8-4f3b-b5a6-1c1bccd9f0f0";

// 3. 创建 Provider Component
export const PlayerProvider = ({ children }) => {
    const audioRef = useRef(null);
    const playerRef = useRef(null);
    const parsedLyricsRef = useRef([]);

    // 使用一个 ref 来保存最新的 playerState，以便在不依赖 playerState 的 useCallback 中访问它
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
    });

    // 保持最新状态的引用
    useEffect(() => {
        playerStateRef.current = playerState;
    }, [playerState]);


    // ==================== 核心状态更新逻辑 (稳定化) ====================

    const handlePlayerStateChange = useCallback((playerInstance) => {
        if (!playerInstance || !playerInstance.audioPlayer) return;

        const state = playerInstance.getPlayerStatus();
        const audioEl = playerInstance.audioPlayer;

        const currentPlayerRef = playerRef.current;
        const songCoverPmid = currentPlayerRef?.songData?.data?.[0]?.track_info?.album?.pmid;

        // 仅在歌曲/歌词数据改变时才重新解析 LRC
        const newSongLrc = currentPlayerRef?.songData?.lyrics || '';
        const prevSongLrc = playerStateRef.current?.songLrc || '';

        if (newSongLrc !== prevSongLrc) {
            parsedLyricsRef.current = parseLrc(newSongLrc);
        }

        setPlayerState(prevState => ({
            ...prevState,
            isPlaying: state.isPlaying,
            songName: currentPlayerRef?.songData?.data?.[0]?.track_info?.title || '',
            songSinger: currentPlayerRef?.songData?.data?.[0]?.track_info?.singer?.map(s => s.title).join(' / ') || '-',
            songAlbum: currentPlayerRef?.songData?.data?.[0]?.track_info?.album.title || '-',
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


    // ==================== Audio 时间事件监听 (高频更新) ====================

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleTimeUpdate = () => {
            if (!playerRef.current || !audio.currentTime) return;

            const currentTime = audio.currentTime;
            const formattedTime = playerRef.current?._formatTime(currentTime) || '0:00';
            let currentLineText = '';
            const lyrics = parsedLyricsRef.current;

            if (lyrics.length > 0) {
                let foundLine = lyrics[lyrics.length - 1];
                for (let i = 0; i < lyrics.length; i++) {
                    if ((currentTime + 0.3) >= lyrics[i].time) {
                        foundLine = lyrics[i];
                    } else {
                        break;
                    }
                }
                currentLineText = foundLine.text;
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
        const isPlaying = playerStateRef.current?.isPlaying;

        if (!isWsOpen && !isPlaying) return;

        playerRef.current?.togglePlayPause();
    }, []);

    const seekTo = useCallback((time) => {
        if (audioRef.current && playerRef.current) {
            audioRef.current.currentTime = time;
        }
    }, []);

    const contextValue = {
        playerState,
        playerRef,
        audioRef,
        togglePlayback,
        seekTo,
    };

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