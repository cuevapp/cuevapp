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
    // Route fetch/XHR through the native HTTP stack so API calls to api.cuevapp.com
    // aren't subject to the webview's CORS (native requests have no browser origin).
    CapacitorHttp: { enabled: true },
    SplashScreen: {
      backgroundColor: '#0c0a09',
      showSpinner: false,
      launchAutoHide: true,
    },
  },
};

export default config;
