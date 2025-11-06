import Background from './components/Background/Background';
import Visualizer from './components/Visualizer/Visualizer';
import MainText from './components/MainText/MainText';
import SongInfo from './components/SongInfo/SongInfo';

function Player() {
    return (
        <>
            <Background />
            <Visualizer />
            <MainText />
            <SongInfo />
        </>
    );
}

export default Player;