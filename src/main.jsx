import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { FlowProvider } from './context/FlowContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FlowProvider>
      <App />
    </FlowProvider>
  </React.StrictMode>,
)
