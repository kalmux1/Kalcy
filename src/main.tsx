import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import App from './App';
import './index.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

const OFFLINE_READY_SEEN_KEY = 'kalcy.offlineReadySeen';

const updateSW = registerSW({
  onNeedRefresh() {
    toast('New version available', {
      duration: Infinity,
      action: { label: 'Reload', onClick: () => updateSW(true) },
    });
  },
  onOfflineReady() {
    // onOfflineReady fires whenever the service worker finishes installing —
    // i.e. on the first visit and again after updates. That's not a "you're
    // offline" event, it just means the app can now work offline. We show the
    // notice at most once per browser so it doesn't nag returning users.
    try {
      if (localStorage.getItem(OFFLINE_READY_SEEN_KEY) === '1') return;
      localStorage.setItem(OFFLINE_READY_SEEN_KEY, '1');
    } catch {
      // localStorage unavailable (private mode, etc.) — fall through and show.
    }
    toast.success('Kalcy installed. You can now use it offline.', {
      duration: 4000,
    });
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    // Check for updates hourly. Silent — only the onNeedRefresh toast surfaces.
    setInterval(() => registration.update(), 60 * 60 * 1000);
  },
  onRegisterError(error) {
    // Previously unhandled. Log it so a broken SW doesn't fail silently.
    console.error('Service worker registration failed:', error);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
      <Toaster position="top-center" />
    </ThemeProvider>
  </React.StrictMode>
);