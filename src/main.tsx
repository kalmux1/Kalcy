import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import App from './App';
import './index.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/error-boundary';

const OFFLINE_READY_SEEN_KEY = 'kalcy.offlineReadySeen';

// Register the service worker unconditionally — this is now a pure PWA.
const updateSW = registerSW({
  onNeedRefresh() {
    toast('New version available', {
      duration: Infinity,
      action: { label: 'Reload', onClick: () => updateSW(true) },
    });
  },
  onOfflineReady() {
    try {
      if (localStorage.getItem(OFFLINE_READY_SEEN_KEY) === '1') return;
      localStorage.setItem(OFFLINE_READY_SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    toast.success('Kalcy installed. You can now use it offline.', {
      duration: 4000,
    });
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 60 * 1000);
  },
  onRegisterError(error) {
    console.error('Service worker registration failed:', error);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      <Toaster position="top-center" />
    </ThemeProvider>
  </React.StrictMode>
);