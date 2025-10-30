import { useState, useEffect } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import './Lyrics.css';

function Lyrics() {
    const { playerState } = usePlayer();

    useEffect(() => {
        if (playerState.currentLyrics) {
            setAnimationKey(prevKey => prevKey + 1);
        }
    }, [playerState.currentLyrics]);

    const [animationKey, setAnimationKey] = useState(0);


    return (
        <div className="lyrics-container">
            <div className="lyrics-content">
                <div
                    className="lyrics-animation-layer"
                    key={animationKey}
                >
                    {playerState.currentLyrics || "MeT-Music Player"}
                </div>
            </div>
        </div>
    );
}

export default Lyrics;