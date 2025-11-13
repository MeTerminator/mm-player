import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import './MainText.css';

// 检查是否全中文（用于换行）
const shouldReplaceSpaceWithNewline = (str) => {
    if (!str) return false;
    // 允许中文、空格、全角符号
    return /^[\u4e00-\u9fa5\s\uff01-\uff5e]*$/.test(str);
};

// 歌词处理函数
const processLyricContent = (lyric) => {
    if (!lyric) return '';
    return shouldReplaceSpaceWithNewline(lyric) ? lyric.replace(/ /g, '\n') : lyric;
};

// 预定义的动画数量
const ANIMATION_COUNT = 5;
// 动画持续时间（需要与 CSS 中的 duration 保持一致）
const ANIMATION_DURATION_MS = 600; 

function MainText() {
    const { playerState } = usePlayer();
    const { isPlaying } = playerState;
    
    // --- Refs 用于解决高度坍塌问题 ---
    const containerRef = useRef(null); // 指向父容器 .maintext-container
    // 指向歌词 buffer，用于测量其高度
    const lyricBufferRef = useRef(null); 
    
    // 'buffer1' 或 'buffer2'，表示当前正在显示 新歌词 的文本框
    const [activeBuffer, setActiveBuffer] = useState('buffer1');
    
    // 存储两个文本框的实际内容
    const [lyricText1, setLyricText1] = useState('');
    const [lyricText2, setLyricText2] = useState('');

    // 当前正在使用的动画索引
    const [randomAnimationIndex, setRandomAnimationIndex] = useState(0);

    // 引用存储
    const prevLyricsIndexRef = useRef(-1);

    // --- 歌词和双文本框切换逻辑 (保持不变) ---
    useEffect(() => {
        const currentLyricsIndex = playerState.currentLyricsIndex;
        const newLyric = playerState.songLyricsLines[currentLyricsIndex]?.text;
        
        let exitingBufferId = null;

        if (isPlaying && newLyric && currentLyricsIndex !== prevLyricsIndexRef.current) {
            
            prevLyricsIndexRef.current = currentLyricsIndex;
            
            // 每次切换歌词时，随机选择一个动画
            const newAnimationIndex = Math.floor(Math.random() * ANIMATION_COUNT);
            setRandomAnimationIndex(newAnimationIndex);

            const nextActiveBuffer = activeBuffer === 'buffer1' ? 'buffer2' : 'buffer1';
            exitingBufferId = activeBuffer;
            
            const processedContent = processLyricContent(newLyric);

            // 将新歌词内容设置给即将进场的 buffer
            if (nextActiveBuffer === 'buffer1') {
                setLyricText1(processedContent); 
            } else {
                setLyricText2(processedContent);
            }
            
            // 切换 activeBuffer，触发进场动画
            setActiveBuffer(nextActiveBuffer);
        } else if (!newLyric) {
            // 没有歌词时，清空内容
            prevLyricsIndexRef.current = -1;
            setLyricText1('');
            setLyricText2('');
        }
        
        let timeoutId;
        if (exitingBufferId) {
            // 在退出动画结束后，清空旧歌词 buffer 的内容
            timeoutId = setTimeout(() => {
                if (exitingBufferId === 'buffer1') {
                    setLyricText1('');
                } else {
                    setLyricText2('');
                }
            }, ANIMATION_DURATION_MS);
        }

        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };

    }, [playerState.currentLyricsIndex, playerState.songLyricsLines, isPlaying, activeBuffer]); 
    
    
    // --- 动态设置父元素高度 ---
    useEffect(() => {
        // 只有当正在播放歌词，并且测量 Ref 已成功绑定时才执行
        const isPlayingLyricsContent = isPlaying && (lyricText1 || lyricText2);

        if (isPlayingLyricsContent && containerRef.current && lyricBufferRef.current) {
            
            // 获取当前 active buffer 的实际高度
            const childHeight = lyricBufferRef.current.offsetHeight;
            
            // 将高度应用给父元素，解决高度坍塌
            containerRef.current.style.height = `${childHeight}px`;
            
        } else if (containerRef.current && !isPlayingLyricsContent) {
            // 当不播放歌词时，清除内联高度，让容器高度由非绝对定位元素自然撑起
            containerRef.current.style.height = ''; 
        }
        
        // 依赖项：歌词内容变化和播放状态
        // 歌词内容（lyricText1/lyricText2）变化是触发重新计算高度的核心信号
    }, [isPlaying, lyricText1, lyricText2]); 


    // --- 渲染逻辑 ---
    const isPlayingLyrics = isPlaying && (lyricText1 || lyricText2);

    const containerClassName = `maintext-container ${isPlayingLyrics ? 'maintext-container-playing' : ''}`;
    
    const animationEnterClassName = `maintext-lyrics-enter-${randomAnimationIndex}`;
    const animationExitClassName = `maintext-lyrics-exit-${randomAnimationIndex}`;

    return (
        // 绑定父容器 Ref
        <div className={containerClassName} ref={containerRef}>
            {isPlayingLyrics ? (
                <>
                    {/* Buffer 1 */}
                    <div 
                        id="lyric-buffer-buffer1" 
                        className={`maintext maintext-lyrics ${
                            activeBuffer === 'buffer1' ? animationEnterClassName : animationExitClassName
                        }`}
                        ref={activeBuffer === 'buffer1' ? lyricBufferRef : null} 
                    >
                        {lyricText1}
                    </div>
                    
                    {/* Buffer 2 */}
                    <div 
                         id="lyric-buffer-buffer2" 
                         className={`maintext maintext-lyrics ${
                            activeBuffer === 'buffer2' ? animationEnterClassName : animationExitClassName
                        }`}
                        ref={activeBuffer === 'buffer2' ? lyricBufferRef : null}
                    >
                        {lyricText2}
                    </div>
                </>
            ) : (
                // 非播放状态显示内容
                <div className="maintext"></div>
            )}
        </div>
    );
}

export default MainText;