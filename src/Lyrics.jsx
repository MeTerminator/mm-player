import { useRef, useState, useEffect, useCallback } from 'react';
import MeTMusicPlayer from './utils/metmusic-player-esm';
import { IoMdPerson, IoMdDisc } from "react-icons/io";
import { parseLrc } from './utils/lrc-parser';
import './Lyrics.css'

const SESSION_ID = "bd33aedc-72b8-4f3b-b5a6-1c1bccd9f0f0";

function Lyrics() {
    const audioRef = useRef(null);
    const playerRef = useRef(null);
    const [animationKey, setAnimationKey] = useState(0);

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

    const parsedLyricsRef = useRef([]);

    // 状态更新回调：由 MeTMusicPlayer 实例调用
    const handlePlayerStateChange = useCallback((playerInstance) => {
        if (!playerInstance) return;

        const state = playerInstance.getPlayerStatus();
        const audioEl = playerInstance.audioPlayer;

        const songCoverPmid = playerRef.current?.songData?.data?.[0]?.track_info?.album?.pmid;

        // 仅在歌曲/歌词数据改变时才重新解析 LRC
        const newSongLrc = playerRef.current?.songData?.lyrics || '';
        const prevSongLrc = playerState.songLrc;

        if (newSongLrc !== prevSongLrc) {
            parsedLyricsRef.current = parseLrc(newSongLrc);
        }

        setPlayerState(prevState => ({
            ...prevState,
            isPlaying: state.isPlaying,
            songName: playerRef.current?.songData?.data?.[0]?.track_info?.title || '',
            songSinger: playerRef.current?.songData?.data?.[0]?.track_info?.singer?.map(s => s.title).join(' / ') || '-',
            songAlbum: playerRef.current?.songData?.data?.[0]?.track_info?.album.title || '-',
            songCoverPmid: songCoverPmid,
            songCoverUrl: songCoverPmid ? `https://y.qq.com/music/photo_new/T002R800x800M000${songCoverPmid}.jpg` : '',
            // songCoverUrl: songCoverPmid ? `https://music.met6.top:444/api/get_cover.php?pic=T002R300x300M000${playerState.songCoverPmid}.jpg` : '',
            songMid: state.songMid,
            songLrc: playerRef.current?.songData?.lyrics || '',
            statusText: state.statusText,
            currentTime: state.formattedCurrentTime,
            duration: state.formattedDuration,
            volume: state.volume,
            isBuffering: state.isBuffering,
            progressMax: audioEl.duration || prevState.progressMax,
            progressValue: audioEl.currentTime || prevState.progressValue,
            isWsOpen: playerInstance.ws?.readyState === WebSocket.OPEN
        }));
    }, []);

    // 播放器初始化和生命周期管理
    useEffect(() => {
        const audioElement = audioRef.current;

        if (audioElement) {
            // 实例化播放器
            const player = new MeTMusicPlayer(audioElement, SESSION_ID, {
                onChange: handlePlayerStateChange,
            });
            playerRef.current = player;

            // 组件挂载时，先更新状态，因为 player.start() 会在内部触发第一次 onChange
            handlePlayerStateChange(player);

            playerRef.current?.start()

            // 组件卸载时清理
            return () => {
                player.stop(); // 清理 WebSocket 和 Interval
            };
        }
    }, [handlePlayerStateChange]);

    // 播放/暂停按钮控制
    const togglePlayback = () => {
        if (playerRef.current?.ws?.readyState !== WebSocket.OPEN && !playerState.isPlaying) return;
        if (playerRef.current) {
            playerRef.current.togglePlayPause();
        }
    };

    // 监听 audio 元素的事件以实时更新进度条，因为 timeupdate 比 player.onChange 触发更频繁
    const handleTimeUpdate = () => {
        if (audioRef.current) {
            const currentTime = audioRef.current.currentTime;
            const formattedTime = playerRef.current?._formatTime(currentTime) || playerState.currentTime;

            let currentLineText = '';
            const lyrics = parsedLyricsRef.current;

            if (lyrics.length > 0) {
                // 查找当前时间对应的歌词行
                let foundLine = lyrics[lyrics.length - 1]; // 默认设为最后一行（防止时间超过最后一行的末尾）

                for (let i = 0; i < lyrics.length; i++) {
                    // 玄学问题，QQ音乐的 lrc 比 qrc 要慢一点
                    // 0.25 秒的误差补偿
                    if ((currentTime + 0.3) >= lyrics[i].time) {
                        foundLine = lyrics[i];
                    } else {
                        // 一旦发现当前时间小于某一行的时间，说明前一行就是我们要找的
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

    // 2. 监听歌词更新，并更新 key
    useEffect(() => {
        // 监听 playerState.currentLyrics 的变化
        if (playerState.currentLyrics) {
            // 每次歌词变化时，增加 key 的值
            setAnimationKey(prevKey => prevKey + 1);
        }
    }, [playerState.currentLyrics]); // 关键依赖：只有歌词变了才运行

    // 渲染 JSX 结构
    return (
        <>
            <div
                className="background-layer"
                style={{
                    backgroundImage: `url(${playerState.songCoverUrl})`,
                }}
            ></div>

            {/* Audio 标签 */}
            <audio
                ref={audioRef}
                id="audio-player"
                onTimeUpdate={handleTimeUpdate}
                onDurationChange={handleDurationChange}
                preload="auto"
            />

            {/* 进度条 */}
            <div className="progress-bar-container">
                <div
                    className="progress-bar"
                    style={{ width: `${(playerState.progressValue / playerState.progressMax) * 100}%` }}
                ></div>
            </div>
            {/* 歌曲信息 */}
            <div className="song-container">
                <div className="song-cover">
                    <img
                        src={playerState.songCoverUrl}
                        style={{
                            display: (playerState.songCoverPmid ? 'block' : 'none')
                        }}
                    />
                </div>
                <div className="song-description">
                    <h1 className="song-name">{playerState.songName || "MeT-Music Player"}</h1>
                    <div className="song-info">
                        <div className="song-info-line"><IoMdPerson /> {playerState.songSinger}</div>
                        <div className="song-info-line"><IoMdDisc /> {playerState.songAlbum}</div>
                        <div className="song-info-line">
                            <span>{playerState.currentTime} / {playerState.duration}</span>
                            <span className='song-status' onClick={togglePlayback}>{playerState.statusText}</span>
                        </div>

                    </div>
                </div>
            </div>

            <div className="lyrics-container">
                <div className="lyrics-content">
                    <div
                        className="lyrics-animation-layer"
                        key={animationKey}
                    >
                        {playerState.currentLyrics || "MeT-Music Player"}
                    </div>
                </div>
            </div>

        </>
    );
}

export default Lyrics;