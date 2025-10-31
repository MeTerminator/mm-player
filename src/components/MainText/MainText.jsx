import { useState, useEffect } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import './MainText.css';

// 辅助函数：将时间格式化为 HH:MM (例如 09:05)
const formatTime = (date) => {
    // 使用 padStart 确保始终是两位数，不足的前面补 0
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

function MainText() {
    const { playerState } = usePlayer();
    const { isPlaying } = playerState;

    // 1. 新增：用于存储当前时间的 state
    const [currentTime, setCurrentTime] = useState(formatTime(new Date()));
    const [animationKey, setAnimationKey] = useState(0);

    // 2. 新增：用于在未播放音乐时更新时间的 effect
    useEffect(() => {
        let intervalId;

        if (!isPlaying) {
            // 设置一个每分钟更新一次的间隔，以保持精确度
            // 如果希望每秒更新以显示秒数，可以将 60000 更改为 1000
            intervalId = setInterval(() => {
                setCurrentTime(formatTime(new Date()));
            }, 60000); // 60000 毫秒 = 1 分钟
        } else {
            // 如果正在播放，清除计时器
            setCurrentTime(formatTime(new Date())); // 立即更新一次当前时间（可选）
            if (intervalId) {
                clearInterval(intervalId);
            }
        }

        // 清理函数：组件卸载或 isPlaying 改变时清除间隔
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [isPlaying]);

    // 原有的 effect：歌词变化时重置动画
    useEffect(() => {
        if (playerState.currentLyrics) {
            setAnimationKey(prevKey => prevKey + 1);
        }
    }, [playerState.currentLyrics]);

    const containerClassName = `maintext-container ${isPlaying ? 'maintext-container-playing' : ''}`;
    const layerClassName = `maintext ${isPlaying ? 'animation-lyrics' : ''}`;
    
    // 要显示的内容
    const content = isPlaying 
        ? playerState.currentLyrics 
        : currentTime;

    return (
        <div className={containerClassName}>
            <div
                className={layerClassName}
                key={animationKey}
            >
                {/* 4. 在 JSX 中显示内容 */}
                {content}
            </div>
        </div>
    );
}

export default MainText;