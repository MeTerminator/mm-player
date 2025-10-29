import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Lyrics from './Lyrics.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Lyrics />
  </StrictMode>,
)
