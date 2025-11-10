import { useState, useEffect, useRef } from 'react'; // 引入 useRef
import { usePlayer } from '../../context/PlayerContext';
import './MainText.css';

// 辅助函数：将时间格式化为 HH:MM (例如 09:05)
const formatTime = (date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getHours()).padStart(2, '0');
    return `${hours}:${minutes}`;
};

// 检查字符串是否只包含中文字符和空格
const shouldReplaceSpaceWithNewline = (str) => {
    if (!str) return false;
    return /^[\u4e00-\u9fa5\s]*$/.test(str);
};

// --- 主要组件 ---
function MainText() {
    const { playerState } = usePlayer();
    const { isPlaying } = playerState;

    const [currentTime, setCurrentTime] = useState(formatTime(new Date()));
    // 强制DOM重置的key
    const [animationKey, setAnimationKey] = useState(0);
    // 随机动画索引
    const [randomAnimationIndex, setRandomAnimationIndex] = useState(0); 

    // 使用 useRef 来追踪上一个歌词，避免不必要的 State 依赖和 Effect 循环
    const prevLyricsRef = useRef(null);

    useEffect(() => {
        let intervalId;
        if (!isPlaying) {
            intervalId = setInterval(() => {
                setCurrentTime(formatTime(new Date()));
            }, 60000); 
        } else {
            setCurrentTime(formatTime(new Date())); 
            if (intervalId) {
                clearInterval(intervalId);
            }
        }
        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
        };
    }, [isPlaying]);


    // 优化后的歌词切换 Effect
    useEffect(() => {
        const currentLyrics = playerState.currentLyrics;
        
        // 只有当歌词内容确实发生变化时才执行操作
        if (currentLyrics && currentLyrics !== prevLyricsRef.current) {
            
            // 步骤 1: 立即改变 key 和随机索引
            // 改变 key 会导致 <div key={animationKey}> 元素被销毁和重建。
            // 在销毁和重建的瞬间，DOM 元素会短暂消失（或重置），这替代了手动设置歌词为 null 的操作。
            setAnimationKey(prevKey => prevKey + 1);

            // 步骤 2: 立即设置新的随机类名
            const newRandomIndex = Math.floor(Math.random() * 5);
            setRandomAnimationIndex(newRandomIndex);
            
            // 步骤 3: 更新引用，用于下一次比较
            prevLyricsRef.current = currentLyrics;

            // 移除所有 setTimeout 延迟，让 React 在一次更新中处理所有状态变化。
            // 因为 key 变化，浏览器会同步处理 DOM 重置，避免频闪。
        } else if (!currentLyrics) {
            // 如果歌词被清空（例如歌曲结束），也重置引用
            prevLyricsRef.current = null;
        }

    }, [playerState.currentLyrics]); // 仅依赖于最新的歌词


    // 计算类名
    const layerAnimationClassName = `maintext-lyrics-animation-${randomAnimationIndex}`;

    const containerClassName = `maintext-container ${isPlaying ? 'maintext-container-playing' : ''}`;
    const layerClassName = `maintext ${isPlaying ? 'maintext-lyrics' : ''} ${isPlaying ? layerAnimationClassName : ''}`;

    // 计算要显示的内容
    let content;
    if (isPlaying && playerState.currentLyrics) {
        // 直接使用 playerState.currentLyrics 作为内容
        const lyrics = playerState.currentLyrics;
        if (shouldReplaceSpaceWithNewline(lyrics)) {
            content = lyrics.replace(/ /g, '\n');
        } else {
            content = lyrics;
        }
    } else {
        // 未播放时显示时间
        content = currentTime;
    }

    return (
        <div className={containerClassName}>
            <div
                className={layerClassName}
                // 当 animationKey 变化时，整个 div 被强制重置，并立即显示新的 content。
                // 这样避免了手动清空歌词带来的中间状态。
                key={animationKey} 
            >
                {content}
            </div>
        </div>
    );
}

export default MainText;