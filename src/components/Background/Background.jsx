import { usePlayer } from '../../context/PlayerContext';
import './Background.css';

function Background() {
    const { playerState } = usePlayer();
    const { isPlaying, songCoverUrl } = playerState;

    const backgraoundTopStyle = {};

    if (isPlaying && songCoverUrl) {
        backgraoundTopStyle.backgroundColor = `transparent`;
    } else {
        backgraoundTopStyle.backgroundColor = `#000000`;
    }

    return (
        <>
            <div
                className="backgraound-top-layer"
                style={backgraoundTopStyle}
            ></div>
            <div
                className="background-layer"
                style={{ backgroundImage: `url(${songCoverUrl})` }}
            >
            </div>
        </>
    );
}

export default Background;