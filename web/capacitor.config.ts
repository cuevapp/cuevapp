import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cuevapp.app',
  appName: 'Cueva',
  webDir: 'dist',
  backgroundColor: '#0c0a09',
  ios: {
    backgroundColor: '#0c0a09',
    contentInset: 'always',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0c0a09',
      showSpinner: false,
      launchAutoHide: true,
    },
  },
};

export default config;
