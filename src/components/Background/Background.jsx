import { usePlayer } from '../../context/PlayerContext';
import './Background.css';

function Background() {
    const { playerState } = usePlayer();

    return (
        <div
            className="background-layer"
            style={{
                backgroundImage: `url(${playerState.songCoverUrl})`,
            }}
        ></div>
    );
}

export default Background;