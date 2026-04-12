import { createRoot } from 'react-dom/client'
import { App } from './App'
import { MobileGate } from './components/MobileGate'

const root = createRoot(document.getElementById('root')!)
root.render(
  <MobileGate>
    <App />
  </MobileGate>,
)
