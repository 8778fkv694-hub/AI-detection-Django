import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wyl.inspection.mobile',
  appName: 'AI检测系统',
  webDir: 'www/dist',
  android: {
    minWebViewVersion: 60,
    allowMixedContent: true,
    buildOptions: {
      releaseType: 'APK'
    }
  },
  server: {
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: [
      '127.0.0.1',
      'localhost',
      '*.local'
    ],
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0b0f19',
      showSpinner: true,
      androidSpinnerStyle: 'large'
    }
  }
};

export default config;
