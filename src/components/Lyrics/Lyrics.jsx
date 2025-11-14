import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import './Lyrics.css';

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

function Lyrics() {
    const { playerState } = usePlayer();
    const { isPlaying } = playerState;

    // --- Refs 用于解决高度坍塌问题 ---
    const containerRef = useRef(null); // 指向父容器 .maintext-container
    // 分别指向两个歌词 buffer，用于测量各自的高度
    const lyricBuffer1Ref = useRef(null);
    const lyricBuffer2Ref = useRef(null);

    // 'buffer1' 或 'buffer2'，表示当前正在显示 新歌词 的文本框
    const [activeBuffer, setActiveBuffer] = useState('buffer1');

    // 存储两个文本框的实际内容
    const [lyricText1, setLyricText1] = useState('');
    const [lyricText2, setLyricText2] = useState('');

    // 当前正在使用的动画索引
    const [randomAnimationIndex, setRandomAnimationIndex] = useState(0);

    // 引用存储
    const prevLyricsIndexRef = useRef(-1);

    // 用于存储窗口宽度，并作为依赖项触发高度重新计算
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);

    // 监听窗口大小变化
    useEffect(() => {
        const handleResize = () => {
            // 只更新宽度，触发依赖于 windowWidth 的 useEffect
            setWindowWidth(window.innerWidth);
        };

        window.addEventListener('resize', handleResize);

        // 清理函数：在组件卸载时移除监听器
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []); // 仅在挂载和卸载时执行

    // --- 歌词和双文本框切换逻辑 ---
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
                    // 当 lyricText1 被清空时，它会触发高度重新计算 (useEffect)
                    setLyricText1('');
                } else {
                    // 当 lyricText2 被清空时，它会触发高度重新计算 (useEffect)
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


    // --- 动态设置父元素高度 (新增 windowWidth 依赖项) ---
    useEffect(() => {
        // 只有当正在播放歌词，并且至少有一个测量 Ref 已成功绑定时才执行
        const isPlayingLyricsContent = isPlaying && (lyricText1 || lyricText2);

        // **注意：** 即使没有歌词内容，当窗口大小变化时，也需要重新执行清理高度的逻辑，
        // 所以我们让这个 effect 总是执行，但只在有内容时计算高度。

        if (isPlayingLyricsContent && containerRef.current) {

            // 获取两个 buffer 的实际高度，如果 ref 不存在则高度为 0
            const height1 = lyricBuffer1Ref.current?.offsetHeight || 0;
            const height2 = lyricBuffer2Ref.current?.offsetHeight || 0;

            // 计算最大高度
            const maxHeight = Math.max(height1, height2);

            // 将最大高度应用给父元素
            containerRef.current.style.height = `${maxHeight}px`;

        } else if (containerRef.current && !isPlayingLyricsContent) {
            // 当不播放歌词时，或窗口大小变化但无内容时，清除内联高度
            containerRef.current.style.height = '';
        }

        // 依赖项：歌词内容变化 (lyricText1/lyricText2) 会触发重新渲染，从而更新 ref 的 offsetHeight
    }, [isPlaying, lyricText1, lyricText2, windowWidth]);


    // --- 渲染逻辑 ---
    const isPlayingLyrics = isPlaying && (lyricText1 || lyricText2);

    const containerClassName = `lyrics-container ${isPlayingLyrics ? 'lyrics-container-playing' : ''}`;

    const animationEnterClassName = `lyrics-enter-${randomAnimationIndex}`;
    const animationExitClassName = `lyrics-exit-${randomAnimationIndex}`;

    return (
        <>
            {isPlayingLyrics ? (
                <>
                    <div className={containerClassName} ref={containerRef}>

                        {/* Buffer 1 */}
                        <div
                            id="lyric-buffer-buffer1"
                            className={`lyrics lyrics-buffer ${activeBuffer === 'buffer1' ? animationEnterClassName : animationExitClassName
                                }`}
                            ref={lyricBuffer1Ref}
                        >
                            {lyricText1}
                        </div>

                        {/* Buffer 2 */}
                        <div
                            id="lyric-buffer-buffer2"
                            className={`lyrics lyrics-buffer ${activeBuffer === 'buffer2' ? animationEnterClassName : animationExitClassName
                                }`}
                            ref={lyricBuffer2Ref}
                        >
                            {lyricText2}
                        </div>

                    </div>
                </>
            ) : (<div className={containerClassName} ref={containerRef}></div>)}
        </>
    );
}

export default Lyrics;