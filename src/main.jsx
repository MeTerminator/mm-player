import { createRoot } from 'react-dom/client'
import Player from './views/Player/Player'
import { PlayerProvider } from './context/PlayerProvider';
import './index.css'

createRoot(document.getElementById('root')).render(
    <PlayerProvider>
      <Player />
    </PlayerProvider>
)
