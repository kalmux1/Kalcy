import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

type BackHandler = () => boolean;
const handlers: BackHandler[] = [];

export function useBackButton(handler: BackHandler) {
  // No dependency array — this runs on every render to ensure
  // the handler always has access to the freshest state variables.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    handlers.push(handler);
    return () => {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    };
  });
}

export function registerGlobalBackButton() {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(null);
  
  return App.addListener('backButton', () => {
    // Execute handlers from top-most (last added) to bottom-most
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i]()) return;
    }
    // If no handler caught it, minimize the app
    void App.minimizeApp();
  });
}