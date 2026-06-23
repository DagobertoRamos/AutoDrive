import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.autodrive.app',
  appName: 'AutoDrive',
  webDir: 'public',
  server: {
    url: 'https://auto-drive-mocha.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
