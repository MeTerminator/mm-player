import { createRoot } from 'react-dom/client'
import Player from './Player.jsx'
import { PlayerProvider } from './context/PlayerProvider';
import './index.css'

createRoot(document.getElementById('root')).render(
    <PlayerProvider>
      <Player />
    </PlayerProvider>
)
