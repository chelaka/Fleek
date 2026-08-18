import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './design/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('The renderer has no root element to mount into.')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
