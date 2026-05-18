import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './lib/i18n';
import { testConnection } from './lib/firebase';

import { registerSW } from 'virtual:pwa-register';

// Register service worker for PWA support
registerSW({ immediate: true });

// Test Firebase connection on startup and then mount
const rootElement = document.getElementById('root')!;
const root = createRoot(rootElement);

// Launch connection test in background (non-blocking)
testConnection();

// Mount immediately
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Signal load completion
(window as any).tt_loaded = true;
(window as any).tt_app_ready = true;
sessionStorage.setItem('tt_load_retries', '0');

// Remove initial splash loader
const loader = document.getElementById('root-loading');
if (loader) {
  setTimeout(() => {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 500);
  }, 300);
}

// Explicit geolocation request for Android WebView/iOS Safari on app start
if ('geolocation' in navigator) {
  navigator.geolocation.getCurrentPosition(
    (position) => { 
      console.log('Location access granted on initialization', position.coords.latitude, position.coords.longitude); 
    },
    (error) => { 
      console.warn('Initial location access rejected or failed:', error.message); 
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}
