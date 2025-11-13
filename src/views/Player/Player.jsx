import Background from '../../components/Background/Background';
import Visualizer from '../../components/Visualizer/Visualizer';
import MainText from '../../components/MainText/MainText';
import SongInfo from '../../components/SongInfo/SongInfo';
import './Player.css';

function Player() {
    return (
        <>
            <Background />
            <Visualizer />
            <div className="player-container">
                <MainText />
                <SongInfo />
            </div>
        </>
    );
}

export default Player;