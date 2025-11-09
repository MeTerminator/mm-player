import { createContext, useContext } from 'react';

export const PlayerContext = createContext(undefined);

export const usePlayer = () => {
    const context = useContext(PlayerContext);
    if (context === undefined) {
        throw new Error('usePlayer must be used within a PlayerProvider');
    }
    return context;
};