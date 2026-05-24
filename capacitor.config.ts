import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tuktrack.app',
  appName: 'TukTrack',
  webDir: 'dist',
  // NO server.url — app loads from bundled dist/ folder inside APK
  // This is required for Capacitor plugins (background location, notifications) to work
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#ffffff',
  },
  plugins: {
    BackgroundGeolocation: {
      locationAuthorizationRequest: 'Always',
      backgroundPermissionRationale: {
        title: 'TukTrack precisa da sua localizacao',
        message: 'Para partilhar a sua localizacao enquanto usa outras aplicacoes, ative a localizacao em segundo plano.',
        positiveAction: 'Permitir sempre',
        negativeAction: 'Cancelar',
      },
    },
  },
};

export default config;
