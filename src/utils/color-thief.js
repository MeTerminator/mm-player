import quantize from '@lokesh.dhakar/quantize';
import { useState, useEffect, useCallback } from 'react';

/**
 * @typedef {number[]} RGBColor
 */

// -------------------------------------------------------------
// 🛠️ 辅助函数 (与原代码类似，但像素读取方式不同)
// -------------------------------------------------------------

/**
 * 从 Canvas ImageData 创建像素数组。
 * @param {Uint8ClampedArray} pixels 像素数据 (r, g, b, a...)
 * @param {number} pixelCount 像素总数
 * @param {number} quality 采样质量 (跳过的像素数)
 * @returns {RGBColor[]} RGB 颜色数组
 */
function createPixelArray(pixels, pixelCount, quality) {
    const pixelArray = [];

    // 假设是 RGBA 格式，每 4 个元素代表一个像素
    for (let i = 0, offset, r, g, b, a; i < pixelCount; i += quality) {
        offset = i * 4;
        r = pixels[offset];
        g = pixels[offset + 1];
        b = pixels[offset + 2];
        a = pixels[offset + 3];

        // 如果像素大部分不透明且不是白色
        if ((typeof a === 'undefined' || a >= 125) && !(r > 250 && g > 250 && b > 250)) {
            pixelArray.push([r, g, b]);
        }
    }

    return pixelArray;
}

/**
 * 验证并规范化选项。
 */
function validateOptions(options) {
    let { colorCount, quality } = options;

    if (typeof colorCount === 'undefined' || !Number.isInteger(colorCount)) {
        colorCount = 10;
    } else if (colorCount === 1) {
        throw new Error('`colorCount` should be between 2 and 20. To get one color, call `getColor()` instead of `getPalette()`');
    } else {
        colorCount = Math.max(colorCount, 2);
        colorCount = Math.min(colorCount, 20);
    }

    if (typeof quality === 'undefined' || !Number.isInteger(quality) || quality < 1) quality = 10;

    return { colorCount, quality };
}

/**
 * 🎨 浏览器加载图像并获取像素数据 (核心变化)
 * 使用 Canvas API 替换 sharp/ndarray-pixels。
 * @param {string | File} imgSource 图像 URL 或 File 对象
 * @returns {Promise<ImageData>}
 */
const loadImgData = (imgSource) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous'; // 处理跨域图像，需要服务器设置 CORS
        img.onerror = reject;

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error("Could not get canvas context."));
                }
                
                ctx.drawImage(img, 0, 0);
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                resolve(imageData);
            } catch (error) {
                reject(error);
            }
        };

        // 如果是 File 对象，创建 Object URL
        if (imgSource instanceof File) {
             img.src = URL.createObjectURL(imgSource);
        } else if (typeof imgSource === 'string') {
             img.src = imgSource;
        } else {
             reject(new Error("Invalid image source type."));
        }
    });
};

// -------------------------------------------------------------
// 🖼️ 主要逻辑函数
// -------------------------------------------------------------

/**
 * 从图像源获取调色板。
 * @param {string | File} imgSource 图像 URL 或 File 对象
 * @param {number} colorCount 想要的颜色数量 (2-20)
 * @param {number} quality 采样质量 (1-100)
 * @returns {Promise<RGBColor[] | null>} RGB 颜色数组，例如 [[255, 0, 0], [0, 0, 255]]
 */
export async function getPalette(imgSource, colorCount = 10, quality = 10) {
    const options = validateOptions({ colorCount, quality });

    try {
        const imgData = await loadImgData(imgSource);
        
        const pixelCount = imgData.width * imgData.height;
        // imgData.data 是一个 Uint8ClampedArray (r, g, b, a, r, g, b, a...)
        const pixelArray = createPixelArray(imgData.data, pixelCount, options.quality);

        if (pixelArray.length === 0) {
            console.warn("No suitable pixels found for color analysis.");
            return null;
        }

        const cmap = quantize(pixelArray, options.colorCount);
        // palette 返回的是 [[r, g, b], [r, g, b], ...] 格式
        const palette = cmap ? cmap.palette() : null; 

        // 如果是 File 对象创建的 URL，记得释放
        if (imgSource instanceof File) {
             URL.revokeObjectURL(imgSource);
        }

        return palette;
    } catch (error) {
        // 如果是 File 对象创建的 URL，即使出错也要释放
        if (imgSource instanceof File) {
             URL.revokeObjectURL(imgSource);
        }
        console.error("Error processing image:", error);
        return null;
    }
}

/**
 * 从图像源获取主色调。
 * @param {string | File} imgSource 图像 URL 或 File 对象
 * @param {number} quality 采样质量 (1-100)
 * @returns {Promise<RGBColor | null>} 主色调 RGB 数组
 */
export async function getColor(imgSource, quality = 10) {
    // 调用 getPalette 获取前 5 个颜色，并返回第一个
    const palette = await getPalette(imgSource, 5, quality);
    return palette ? palette[0] : null;
}

// -------------------------------------------------------------
// ⚛️ React Hook 示例
// -------------------------------------------------------------

/**
 * 用于在 React 组件中获取图像调色板的 Hook。
 * @param {string | File | null} imgSource 图像 URL 或 File 对象
 * @param {number} colorCount 想要的颜色数量 (2-20)
 * @param {number} quality 采样质量 (1-100)
 * @returns {{ palette: RGBColor[] | null, loading: boolean, error: Error | null }}
 */
export function useImagePalette(imgSource, colorCount = 10, quality = 10) {
    /** @type {[RGBColor[] | null, (palette: RGBColor[] | null) => void]} */
    const [palette, setPalette] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const processImage = useCallback(async (source) => {
        if (!source) {
            setPalette(null);
            return;
        }

        setLoading(true);
        setError(null);
        setPalette(null);

        try {
            const result = await getPalette(source, colorCount, quality);
            setPalette(result);
        } catch (err) {
            setError(err);
            setPalette(null);
        } finally {
            setLoading(false);
        }
    }, [colorCount, quality]);

    useEffect(() => {
        processImage(imgSource);
    }, [imgSource, processImage]);

    return { palette, loading, error };
}

