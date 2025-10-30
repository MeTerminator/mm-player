import { createContext, useContext } from 'react';

// 1. 创建 Context，用于存储播放器状态和控制函数
export const PlayerContext = createContext(undefined);

// 2. 创建自定义 Hook 供组件使用
export const usePlayer = () => {
    const context = useContext(PlayerContext);
    if (context === undefined) {
        // 确保在被 PlayerProvider 包裹的范围内使用
        throw new Error('usePlayer must be used within a PlayerProvider');
    }
    return context;
};