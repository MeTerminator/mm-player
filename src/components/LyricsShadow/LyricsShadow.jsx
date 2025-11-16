import { usePlayer } from '../../context/PlayerContext';
import './LyricsShadow.css';

// ---------------------------------------------------
// 核心词汇列表
// ---------------------------------------------------
const SPECIAL_WORDS = [
    'ecstasy', 'bliss', 'euphoria', 'overjoy', 'elate', 'jubilant', 'rapture', 'thrilled', 
    'love', 'adore', 'beloved', 'darling', 'honey', 'sweetheart', 'cherish', 'tender', 
    'passion', 'desire', 'yearn', 'intimacy', 'devotion', 'infatuation', 'crush', 'warmth', 
    'affect', 'kiss', 'hug', 'embrace', 'soulmate', 'cuddle', 'swoon', 'dazzl',
    'happy', 'joy', 'hope', 'peace', 'calm', 'serene', 'content', 'grateful', 'thankful', 
    'proud', 'excite', 'eager', 'relief', 'comfort', 'uplift', 'optimism', 'bright', 
    'sunshine', 'dream', 'freedom', 'inspire', 'miracle', 'wonder', 'glorious', 'sparkl',
    'laugh', 'smile', 'cheer', 'lucky', 'better', 'healing', 'kindness', 'grace',
    'sad', 'sorrow', 'grief', 'pain', 'hurt', 'ache', 'broken', 'heartbreak', 'tears', 
    'cry', 'weep', 'sob', 'miserable', 'unhappy', 'despair', 'wretch', 'woe', 'agony', 
    'anguish', 'bleed', 'wound', 'suffer', 'loss', 'lost', 'empty', 'hollow', 
    'void', 'shatter', 'crumble', 'shame', 'guilt', 'fault', 'burden', 'heavy',
    'hate', 'anger', 'fury', 'rage', 'wrath', 'madness', 'scream', 'yell', 'furious', 
    'afraid', 'scared', 'fear', 'terror', 'horror', 'dread', 'panic', 'anxiety', 
    'nervous', 'tremble', 'shake', 'paralyze', 'danger', 'threat', 'enemy', 'devil',
    'lonely', 'alone', 'isolation', 'solitude', 'abandon', 'desert', 'forgotten', 
    'miss', 'missing', 'goodbye', 'farewell', 'drift', 'distant', 'stranger', 'ghost',
    'shadow', 'echo', 'whisper', 'memory', 'past', 'gone', 'never', 'silence',
    'struggle', 'fight', 'warrior', 'battle', 'try', 'courage', 'brave', 'defiance', 
    'betray', 'lie', 'deceive', 'truth', 'sincere', 'honest', 'secret', 'mystery', 
    'confuse', 'puzzle', 'disarray', 'mess', 'chaos', 'tired', 'weary', 'exhaust',
    'forever', 'always', 'sometime', 'when', 'if', 'why', 'how', 'maybe', 'question',
    'reborn', 'change', 'grow', 'die', 'live', 'alive', 'tomorrow', 'yesterday',
    'strong', 'weak', 'master', 'slave', 'king', 'queen', 'prince', 'princess', 'angel', 'demon',
    'chance', 'world', 'star', 'fire', 'rain', 'storm', 'ocean', 'river', 'sky', 'wall',
    'door', 'road', 'time', 'tonight', 'morning', 'nothin', 'gonna', 'wanna', 'gimme',
    'gotta', 'yeah', 'oh', 'baby', 'lady', 'man', 'woman', 'story', 'moment', 'destiny'
];

// ---------------------------------------------------
// 排除词汇列表 (功能性/非核心词汇)
// ---------------------------------------------------
const EXCLUDED_WORDS = [
    // 冠词
    'a', 'an', 'the',
    // 人称代词/物主代词/反身代词/指示代词/不定代词 (常见)
    'i', 'me', 'my', 'mine', 'myself', 
    'you', 'your', 'yours', 'yourself', 'yourselves', 
    'he', 'him', 'his', 'himself', 
    'she', 'her', 'hers', 'herself', 
    'it', 'its', 'itself', 
    'we', 'us', 'our', 'ours', 'ourselves', 
    'they', 'them', 'their', 'theirs', 'themselves',
    'this', 'that', 'these', 'those',
    'one', 'some', 'any', 'all', 'every', 'other', 'another', 'nothing', 'something',
    // 助动词/情态动词
    'do', 'did', 'does', 'don\'t', 'doesn\'t', 'didn\'t',
    'have', 'has', 'had', 'haven\'t', 'hasn\'t', 'hadn\'t',
    'am', 'is', 'are', 'was', 'were', 'be', 'being', 'been',
    'will', 'would', 'can', 'could', 'may', 'might', 'must', 'shall', 'should', 'need', 'dare',
    // 介词
    'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'up', 'down', 'out', 'into', 'over', 'under', 'through', 'about', 'before', 'after', 'since', 'until', 'among', 'across', 'behind', 'beside', 'between', 'except', 'without',
    // 连词
    'and', 'but', 'or', 'nor', 'so', 'yet', 'if', 'because', 'though', 'although', 'while', 'when', 'where',
    // 常用副词
    'just', 'only', 'too', 'very', 'not', 'no', 'then', 'now', 'well', 'how', 'why',
];

/**
 * 检查单词是否为排除词汇
 */
function isExcludedWord(word) {
    // 排除词汇列表是小写的，所以 word 必须是小写
    return EXCLUDED_WORDS.includes(word);
}

/**
 * 将字符串的首字母转换为大写。
 */
function toTitleCase(str) {
    if (!str) return '';
    // 确保返回的字符串除了首字母，其余都是小写
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * 检查字符串是否为“纯英文”（即不包含中文、韩文、日文等非拉丁字母文字）。
 */
function isPureEnglish(text) {
    if (!text || text.trim() === '') return false;
    // 匹配主流东亚文字 (CJK, 假名, 韩文)
    const nonLatinRegex = /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/;
    return !nonLatinRegex.test(text);
}

/**
 * 根据逻辑获取用于 Shadow 的词汇或字母，并确保首字母大写。
 * 包含词根匹配、排除词汇、取最长词逻辑。
 */
function getShadowWord(currentLyrics) {
    if (!currentLyrics) {
        return ''; 
    }

    let shadowCandidate = '';
    const trimmedLyrics = currentLyrics.trim();

    if (isPureEnglish(trimmedLyrics)) {
        // 1. 分割并预处理单词
        const words = trimmedLyrics
            .toLowerCase()
            .split(/[^a-z0-9']/g) // 分割，允许 ' 作为单词的一部分
            .filter(word => word.length > 0 && word !== "'"); // 过滤空串和单独的撇号

        if (words.length === 0) {
            return ''; // 没有有效单词
        }
        
        let foundEmotionalWord = null;

        // 2. 词根匹配：检查歌词中的单词是否以任一情感词根开头 (最高优先级)
        for (const word of words) {
            // 排除长度小于3的词汇进行词根匹配，避免 'i', 'my', 'me' 等被误判
            if (word.length < 3) continue; 

            const rootMatch = SPECIAL_WORDS.find(root => word.startsWith(root));
            if (rootMatch) {
                foundEmotionalWord = word; // 返回歌词中实际的单词 (如 'lovers', 'loving')
                break;
            }
        }
        
        if (foundEmotionalWord) {
            shadowCandidate = foundEmotionalWord; 
        } else {
            // 3. 正常流程：排除词汇后取第一个非排除词 (次高优先级)
            let firstNonExcludedWord = null;
            for (const word of words) {
                if (!isExcludedWord(word)) {
                    firstNonExcludedWord = word;
                    break;
                }
            }

            if (firstNonExcludedWord) {
                shadowCandidate = firstNonExcludedWord;
            } else {
                // 4. 所有单词都被排除：取最长的单词 (最低优先级)
                
                // 排除一些常见的缩写，因为它们可能很长但没有意义 (如 'don\'t', 'I\'m' 等)
                const candidateWords = words.filter(word => 
                    word.length > 0 && 
                    !['i\'m', 'you\'re', 'it\'s', 'we\'re', 'they\'re', 'i\'ll', 'you\'ll', 'we\'ll', 'they\'ll', 'i\'ve', 'you\'ve', 'we\'ve', 'they\'ve'].includes(word)
                );

                if (candidateWords.length > 0) {
                    // 使用 reduce 找出最长的单词
                    shadowCandidate = candidateWords.reduce((a, b) => (a.length >= b.length ? a : b));
                }
            }
        }
    } else if (trimmedLyrics.length > 0) {
        // 非纯英文，取第一个字符 (保持不变)
        shadowCandidate = trimmedLyrics[0];
    }
    
    // 5. 格式化并返回
    return toTitleCase(shadowCandidate);
}

function LyricsShadow() {
    const { playerState } = usePlayer();
    
    const currentLyricText = playerState.currentLyrics || ''; 
    const shadowText = getShadowWord(currentLyricText); 
    const isVisible = playerState.isPlaying && !!shadowText;

    return (
        <div 
            className="lyrics-shadow-container" 
            key={shadowText}
            data-visible={isVisible}
        >
            <div className="lyrics-shadow">
                {shadowText}
            </div>
        </div>
    )
}

export default LyricsShadow;