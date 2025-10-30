import { useState, useEffect } from 'react';
import { usePlayer } from '../../context/PlayerContext';
import { IoMdPerson, IoMdDisc } from 'react-icons/io';
import './SongInfo.css';

const alwaysDisplay = false;

function SongInfo() {
    const { playerState } = usePlayer();

    const { isPlaying } = playerState;

    const [isVisible, setIsVisible] = useState(isPlaying || alwaysDisplay);

    useEffect(() => {
        let timer;

        if (alwaysDisplay) {
            setIsVisible(true);
            return;
        }

        if (isPlaying) {
            setIsVisible(true);
        } else {
            timer = setTimeout(() => {
                setIsVisible(false);
            }, 0);
        }

        return () => {
            if (timer) {
                clearTimeout(timer);
            }
        };

    }, [isPlaying]);

    const containerClassName = `song-container ${isVisible ? 'visible' : 'hidden'}`;

    return (
        <div className={containerClassName}>
            <div className="song-container-box">
                <div className="song-cover">
                    <img
                        src={playerState.songCoverUrl}
                        style={{
                            display: (playerState.songCoverPmid ? 'block' : 'none')
                        }}
                        alt="Song Cover"
                    />
                </div>
                <div className="song-description">
                    <h1 className="song-name">{playerState.songName || "MeT-Music Player"}</h1>
                    <div className="song-info">
                        <div className="song-info-line"><IoMdPerson /> {playerState.songSinger}</div>
                        <div className="song-info-line"><IoMdDisc /> {playerState.songAlbum}</div>
                        <div className="song-info-line">
                            <span>{playerState.currentTime} / {playerState.duration}</span>
                            <span className='song-status'>{playerState.statusText}</span>
                        </div>
                    </div>
                </div>
            </div>
            {/* 进度条 */}
            <div className="progress-bar-container">
                <div
                    className="progress-bar"
                    style={{ width: `${(playerState.progressValue / playerState.progressMax) * 100}%` }}
                ></div>
            </div>
        </div>
    );
}

export default SongInfo;