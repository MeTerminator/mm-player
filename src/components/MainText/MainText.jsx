import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import './MainText.css';

// 辅助函数：将时间格式化为 HH:MM
const formatTime = (date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

// 检查是否全中文（用于换行）
const shouldReplaceSpaceWithNewline = (str) => {
    if (!str) return false;
    return /^[\u4e00-\u9fa5\s]*$/.test(str);
};

function MainText() {
    const { playerState } = usePlayer();
    const { isPlaying } = playerState;

    const [currentTime, setCurrentTime] = useState(formatTime(new Date()));
    const [animationKey, setAnimationKey] = useState(0);
    const [randomAnimationIndex, setRandomAnimationIndex] = useState(0);

    const prevLyricsRef = useRef(null);
    const rafRef = useRef(null); // 保存 requestAnimationFrame ID
    const pendingUpdateRef = useRef(false); // 防止重复调度

    // 更新时间逻辑
    useEffect(() => {
        let intervalId;
        if (!isPlaying) {
            intervalId = setInterval(() => {
                setCurrentTime(formatTime(new Date()));
            }, 60000);
        } else {
            setCurrentTime(formatTime(new Date()));
            if (intervalId) clearInterval(intervalId);
        }
        return () => clearInterval(intervalId);
    }, [isPlaying]);

    // 让歌词和动画在同一帧同步更新
    useEffect(() => {
        const currentLyrics = playerState.currentLyrics;

        // 只在歌词变化时触发
        if (currentLyrics && currentLyrics !== prevLyricsRef.current) {
            if (!pendingUpdateRef.current) {
                pendingUpdateRef.current = true;

                // 在下一帧执行 DOM 同步更新
                rafRef.current = requestAnimationFrame(() => {
                    // 强制重建 DOM 元素
                    setAnimationKey(prev => prev + 1);

                    // 同步切换动画类（同一帧内执行）
                    setRandomAnimationIndex(Math.floor(Math.random() * 5));

                    // 更新引用，防止重复触发
                    prevLyricsRef.current = currentLyrics;
                    pendingUpdateRef.current = false;
                });
            }
        } else if (!currentLyrics) {
            prevLyricsRef.current = null;
        }

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [playerState.currentLyrics]);

    const layerAnimationClassName = `maintext-lyrics-animation-${randomAnimationIndex}`;
    const containerClassName = `maintext-container ${isPlaying ? 'maintext-container-playing' : ''}`;
    const layerClassName = `maintext ${isPlaying ? 'maintext-lyrics' : ''} ${isPlaying ? layerAnimationClassName : ''}`;

    // 内容渲染逻辑
    let content;
    if (isPlaying && playerState.currentLyrics) {
        const lyrics = playerState.currentLyrics;
        content = shouldReplaceSpaceWithNewline(lyrics) ? lyrics.replace(/ /g, '\n') : lyrics;
    } else {
        content = currentTime;
    }

    return (
        <div className={containerClassName}>
            <div key={animationKey} className={layerClassName}>
                {content}
            </div>
        </div>
    );
}

export default MainText;
