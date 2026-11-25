import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Ignore registration error in restricted preview frames
    });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
