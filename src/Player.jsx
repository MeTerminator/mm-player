import Background from './components/Background/Background';
import Visualizer from './components/Visualizer/Visualizer';
import Lyrics from './components/Lyrics/Lyrics';
import SongInfo from './components/SongInfo/SongInfo';



function Player() {


    return (
        <>
            <Background />
            <Visualizer />
            <Lyrics />
            <SongInfo />
        </>
    );
}

export default Player;