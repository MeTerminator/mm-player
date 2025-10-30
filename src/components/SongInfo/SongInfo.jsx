import { usePlayer } from '../../context/PlayerContext';
import { IoMdPerson, IoMdDisc } from 'react-icons/io';
import './SongInfo.css';

function SongInfo() {
    const { playerState, togglePlayback } = usePlayer();

    return (

        <div className="song-container">
            {/* ... 歌曲信息展示，直接使用 playerState */}
            <div className="song-container-box">
                <div className="song-cover">
                    <img
                        src={playerState.songCoverUrl}
                        style={{
                            display: (playerState.songCoverPmid ? 'block' : 'none')
                        }}
                    />
                </div>
                <div className="song-description">
                    <h1 className="song-name">{playerState.songName || "MeT-Music Player"}</h1>
                    <div className="song-info">
                        <div className="song-info-line"><IoMdPerson /> {playerState.songSinger}</div>
                        <div className="song-info-line"><IoMdDisc /> {playerState.songAlbum}</div>
                        <div className="song-info-line">
                            <span>{playerState.currentTime} / {playerState.duration}</span>
                            <span className='song-status' onClick={() => togglePlayback()}>{playerState.statusText}</span>
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