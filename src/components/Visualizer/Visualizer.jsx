import { useEffect, useRef } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import "./Visualizer.css";

function Visualizer() {
    const { audioDataArrayRef } = usePlayer();

    const animationRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");

        // --- Canvas 尺寸调整 ---
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = 120;
        };

        resizeCanvas();
        window.addEventListener("resize", resizeCanvas);

        const draw = () => {
            let dataArray = audioDataArrayRef.current;

            if (!dataArray || !(dataArray instanceof Uint8Array)) {
                animationRef.current = requestAnimationFrame(draw);
                return;
            }

            const bufferLength = dataArray.length;

            animationRef.current = requestAnimationFrame(draw);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 柱子宽度基于原始数据长度计算
            const barWidth = (canvas.width / bufferLength) * 1.2;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const y = dataArray[i] * 0.3;

                // 绘制逻辑（渐变和圆顶）
                const gradient = ctx.createLinearGradient(x, 0, x, y);
                gradient.addColorStop(0, "rgba(255,255,255,0.6)");
                gradient.addColorStop(0.7, "rgba(255,255,255,0.2)");
                gradient.addColorStop(1, "rgba(255,255,255,0)");

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.moveTo(x + barWidth / 2, 0);
                ctx.fill();

                ctx.fillRect(x, 0, barWidth, y);

                // 柱子间隔
                x += barWidth;
            }
        };

        draw();

        return () => {
            window.removeEventListener("resize", resizeCanvas);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [audioDataArrayRef]);


    return (
        <canvas ref={canvasRef} id="audio-visualizer" className="audio-visualizer"></canvas>
    );
}

export default Visualizer;