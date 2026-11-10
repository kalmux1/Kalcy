import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import App from './App';
import './index.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from '@/components/error-boundary';

const OFFLINE_READY_SEEN_KEY = 'kalcy.offlineReadySeen';

// Service-worker registration is only meaningful for the browser/PWA build.
// In a Capacitor native build the assets are served from the app bundle, the
// SW provides no caching benefit, and the "New version available → Reload"
// toast is misleading because store-shipped updates don't hot-swap a SW.
if (!Capacitor.isNativePlatform()) {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('New version available', {
        duration: Infinity,
        action: { label: 'Reload', onClick: () => updateSW(true) },
      });
    },
    onOfflineReady() {
      // Fires on first install and again after updates. Show at most once
      // per browser so returning users aren't nagged.
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
      // Hourly background check. Silent — only onNeedRefresh surfaces.
      setInterval(() => registration.update(), 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('Service worker registration failed:', error);
    },
  });
}

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