import { usePlayer } from '../../context/PlayerContext';
import './PlaceholderText.css';

function PlaceholderText() {
    const { playerState } = usePlayer();
    const { isPlaying } = playerState;

    const isPlayingClass = isPlaying ? 'hidden' : 'visible';

    return (
        <div
            className="placeholder-text"
            data-visible={isPlayingClass}
        >
            MeT-Music Player
        </div>
    );
}

export default PlaceholderText;