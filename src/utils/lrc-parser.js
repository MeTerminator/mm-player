// --- LRC 解析工具函数 ---
/**
 * 将 LRC 格式的字符串解析为时间戳和歌词对象的数组
 * @param {string} lrcString 
 * @returns {Array<{time: number, text: string}>}
 */
export const parseLrc = (lrcString) => {
    if (!lrcString) return [];
    const lines = lrcString.split('\n');
    const lyricArray = [];

    // 正则表达式匹配 [mm:ss.xx] 格式的时间戳
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

    lines.forEach(line => {
        // 提取时间戳部分和歌词文本部分
        const timeMatch = [...line.matchAll(timeRegex)];
        
        if (timeMatch.length > 0) {
            // 最后一个匹配项（或唯一的匹配项）是时间戳
            const lastMatch = timeMatch[timeMatch.length - 1];
            const minutes = parseInt(lastMatch[1], 10);
            const seconds = parseInt(lastMatch[2], 10);
            const milliseconds = parseInt(lastMatch[3], 10) * (lastMatch[3].length === 2 ? 10 : 1); // 修正毫秒处理
            
            const timeInSeconds = minutes * 60 + seconds + milliseconds / 1000;
            
            // 歌词文本是去除所有时间戳标签后的剩余部分
            const text = line.replace(timeRegex, '').trim();

            if (text) {
                lyricArray.push({ time: timeInSeconds, text: text });
            }
        }
    });

    // 按时间戳排序，确保顺序正确 (虽然大多数LRC是顺序的，但解析后应再次确认)
    lyricArray.sort((a, b) => a.time - b.time);
    
    return lyricArray;
};
