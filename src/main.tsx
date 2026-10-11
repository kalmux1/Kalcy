import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { toast } from 'sonner';
import App from './App';
import './index.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';

const updateSW = registerSW({
  onNeedRefresh() {
    toast('New version available', {
      duration: Infinity,
      action: { label: 'Reload', onClick: () => updateSW(true) },
    });
  },
  onOfflineReady() {
    toast.success('Kalcy is ready to work offline');
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 60 * 1000);
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