import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kalcy.app',
  appName: 'Kalcy',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;