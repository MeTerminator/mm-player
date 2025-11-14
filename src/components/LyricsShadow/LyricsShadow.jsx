import { usePlayer } from '../../context/PlayerContext';
import './LyricsShadow.css';

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


/**
 * 将字符串的首字母转换为大写。
 */
function toTitleCase(str) {
    if (!str) return '';
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
 * 包含词根匹配逻辑。
 */
function getShadowWord(currentLyrics) {
    if (!currentLyrics) {
        return ''; 
    }

    let shadowCandidate = '';
    const trimmedLyrics = currentLyrics.trim();

    if (isPureEnglish(trimmedLyrics)) {
        // 分割单词，允许 ' 作为单词的一部分
        const words = trimmedLyrics
            .toLowerCase()
            .split(/[^a-z0-9']/g) 
            .filter(word => word.length > 0); 

        let foundEmotionalWord = null;

        // 词根匹配：检查歌词中的单词是否以任一情感词根开头
        for (const word of words) {
            const rootMatch = SPECIAL_WORDS.find(root => word.startsWith(root));
            if (rootMatch) {
                foundEmotionalWord = word; // 返回歌词中实际的单词 (如 'lovers', 'loving')
                break;
            }
        }
        
        if (foundEmotionalWord) {
            shadowCandidate = foundEmotionalWord; 
        } else {
            shadowCandidate = words.length > 0 ? words[0] : '';
        }
    } else if (trimmedLyrics.length > 0) {
        // 非纯英文，取第一个字符
        shadowCandidate = trimmedLyrics[0];
    }
    
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