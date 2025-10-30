import React, { useEffect, useRef } from 'react';
import { usePlayer } from '../../context/PlayerContext';
// 假设您还需要这个 CSS 文件
import "./Visualizer.css";

function Visualizer() {
    const { audioRef } = usePlayer();

    // Refs for managing state that shouldn't trigger re-renders
    // 修复：确保所有必要的状态管理Refs都被声明
    const audioContextRef = useRef(null);
    const animationRef = useRef(null);
    const canvasRef = useRef(null);
    // dataArrayRef 在这个版本中不再需要，因为 dataArray 可以在 initVisualizer 内部正确声明和使用


    useEffect(() => {
        const audio = audioRef.current;
        // 修复：使用 canvasRef 获取 Canvas DOM 元素
        const canvas = canvasRef.current;
        if (!audio || !canvas) return;

        const ctx = canvas.getContext("2d");
        let analyser, source;
        let dataArray, bufferLength;

        // --- Canvas 尺寸调整 ---
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = 120; // 固定高度
        };
        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);

        // --- 初始化可视化 ---
        const initVisualizer = () => {
            // 使用 Ref 检查是否已初始化
            if (audioContextRef.current) return;

            // 初始化 Web Audio Context
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioCtx; // 存储 Audio Context

            // 创建分析器
            analyser = audioCtx.createAnalyser();
            source = audioCtx.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);

            analyser.fftSize = 256;
            bufferLength = analyser.frequencyBinCount;

            dataArray = new Uint8Array(bufferLength);

            // --- 绘制函数 (已包含对数缩放) ---
            const draw = () => {
                // 修复：使用 animationRef.current 存储 ID，以便在清理时访问
                animationRef.current = requestAnimationFrame(draw);
                analyser.getByteFrequencyData(dataArray);

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                const barWidth = (canvas.width / bufferLength) * 1.2;
                let x = 0;

                for (let i = 0; i < bufferLength; i++) {
                    const y = dataArray[i] * 0.3;

                    // 创建单条渐变 —— 顶部亮，底部逐渐透明
                    const gradient = ctx.createLinearGradient(x, 0, x, y);
                    gradient.addColorStop(0, "rgba(255,255,255,0.6)"); // 顶部亮
                    gradient.addColorStop(0.7, "rgba(255,255,255,0.3)"); // 中间柔光
                    gradient.addColorStop(1, "rgba(255,255,255,0)"); // 底部透明（阴影效果）

                    ctx.fillStyle = gradient;

                    // 圆顶半径
                    const radius = barWidth / 2;

                    // 绘制顶部圆弧 (注意：由于 Canvas Y轴向下，我们在这里是从 Y=0 开始绘制)
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.arc(x + barWidth / 2, 0, radius, Math.PI, 0, false);
                    ctx.fill();

                    // 绘制矩形部分（倒立）
                    ctx.fillRect(x, 0, barWidth, y - radius);

                    x += barWidth + 0.5;
                }
            };
            draw();
        };

        // --- 监听播放事件，确保 Web Audio API 在用户交互后启动 ---
        const handlePlay = () => {
            // 使用 audioContextRef.current 检查是否已创建
            if (!audioContextRef.current) {
                initVisualizer();
            } else if (audioContextRef.current.state === "suspended") {
                audioContextRef.current.resume();
            }
        };

        audio.addEventListener("play", handlePlay);

        // --- 清理函数：在组件卸载时清除所有资源 ---
        return () => {
            cancelAnimationFrame(animationRef.current);
            window.removeEventListener("resize", resizeCanvas);
            audio.removeEventListener("play", handlePlay);

            // 修复：使用 audioContextRef.current 来关闭 Audio Context
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
        };
    }, [audioRef]); // 依赖 audioRef


    return (
        // 修复：绑定 canvasRef 到 Canvas 元素
        <canvas ref={canvasRef} id="audio-visualizer" className="audio-visualizer"></canvas>
    );
}

export default Visualizer;
