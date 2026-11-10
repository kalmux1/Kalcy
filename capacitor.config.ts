import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kalcy.app',
  appName: 'Kalcy',
  webDir: 'dist',
  server: {
    // 'https' is required for Firebase Auth's secure-context guarantees and
    // for the biometric plugin's WebView bridge.
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      // Do not let the WebView bleed under the status bar. This avoids the
      // need for env(safe-area-inset-top) in every top-level container.
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#ffffff',
    },
  },
};

export default config;