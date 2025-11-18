/**
 * 调整 HEX 颜色的亮度/明度 (Value)，同时保持色相和饱和度。
 * 调整后的颜色不会轻易变成纯白色，除非原始颜色饱和度极低或 'amount' 极大。
 *
 * @param {string} hex - 原始 HEX 颜色字符串。
 * @param {number} amount - 明度调整百分比，范围 -100 到 100。
 * 正数使颜色变亮（V 增加），负数使颜色变暗（V 减少）。
 * @returns {string} 调整后的 HEX 颜色字符串。
 */
export const adjustColorBrightnessHSV = (hex, amount) => {
    // 1. 预处理 HEX 并转换为 RGB (0-255)
    hex = String(hex).replace(/[^0-9a-f]/gi, '');
    if (hex.length < 6) {
        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    
    const r_in = parseInt(hex.substring(0, 2), 16);
    const g_in = parseInt(hex.substring(2, 4), 16);
    const b_in = parseInt(hex.substring(4, 6), 16);

    // 2. RGB -> HSV
    const { h, s, v } = rgbToHsv(r_in, g_in, b_in);

    // 3. 调整 V (明度) 分量
    const v_adjustment = amount / 100; // 将百分比调整为 0-1 范围
    
    // 增加或减少 V，并确保 V 保持在 0 到 1 之间
    const new_v = Math.min(1, Math.max(0, v + v_adjustment));

    // 4. HSV -> RGB
    const [r_out, g_out, b_out] = hsvToRgb(h, s, new_v);

    // 5. RGB -> HEX
    const toHex = (c) => {
        const hex = c.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };

    return '#' + toHex(r_out) + toHex(g_out) + toHex(b_out);
};

/**
 * 更改 HEX 颜色的亮度。
 * @param {string} hex - 原始 HEX 颜色字符串（如 '#ff0000' 或 'ff0000'）。也支持简写（如 '#f00'）。
 * @param {number} lum - 亮度调整因子。范围通常在 -1 到 1 之间（-0.2 表示暗 20%，0.3 表示亮 30%）。
 * 这里我们使用一个更直接的 -255 到 255 的整数值，表示对 R、G、B 分量直接调整的量。
 * 正数使颜色变亮，负数使颜色变暗。
 * @returns {string} 调整后的 HEX 颜色字符串（例如 '#rrggbb'）。
 */
export const adjustColorBrightness = (hex, lum) => {
  // 1. 预处理 HEX 字符串
  hex = String(hex).replace(/[^0-9a-f]/gi, ''); // 移除 # 号等非十六进制字符

  // 处理简写形式，如 #f00 -> #ff0000
  if (hex.length < 6) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  // 确保亮度值是一个整数，并默认为 0
  lum = lum || 0;

  let rgb = '#', c, i;

  for (i = 0; i < 3; i++) {
    // 2. 将 HEX 分量转换为十进制
    c = parseInt(hex.substr(i * 2, 2), 16);

    // 3. 调整亮度并限制在 0-255 范围内
    c = Math.round(Math.min(Math.max(0, c + lum), 255));

    // 4. 将十进制转换回十六进制，并确保是两位数
    // 例如：15 转换为 'f'，需要补零变成 '0f'
    rgb += ('00' + c.toString(16)).substr(-2);
  }

  return rgb;
};

/**
 * 将 HEX 颜色代码转换为逗号分隔的 RGB 字符串 (例如: "255,102,0")。
 *
 * @param {string} hex - 原始 HEX 颜色字符串 (支持 "#rrggbb", "rrggbb", "#rgb", "rgb" 格式)。
 * @returns {string | null} 逗号分隔的 RGB 字符串，如果格式无效则返回 null。
 */
export const hexToRgbString = (hex) => {
    // 1. 清理输入并检查格式
    let color = String(hex).replace(/[^0-9a-f]/gi, '');

    // 处理 3 位简写形式 (例如: f00 -> ff0000)
    if (color.length === 3) {
        color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
    }

    // 格式校验：必须是 6 位
    if (color.length !== 6) {
        // console.error("Invalid HEX color format:", hex);
        return null; // 返回 null 或抛出错误，取决于你的错误处理偏好
    }

    // 2. 提取 R, G, B 分量并转换为十进制
    // R: 0, 1 位
    const r = parseInt(color.substring(0, 2), 16);
    // G: 2, 3 位
    const g = parseInt(color.substring(2, 4), 16);
    // B: 4, 5 位
    const b = parseInt(color.substring(4, 6), 16);

    // 3. 组合成 "123,123,123" 格式的字符串
    return `${r},${g},${b}`;
};

const rgbToHsv = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;

    const d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
        h = 0; // 灰色
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6; // 范围 0 - 1
    }

    return { h, s, v }; // h, s, v 范围 0-1
};


const hsvToRgb = (h, s, v) => {
    let r, g, b;

    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};