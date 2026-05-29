import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tuktrack.app',
  appName: 'TukTrack',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0f172a',
  },
  plugins: {
    BackgroundGeolocation: {
      locationAuthorizationRequest: 'Always',
      backgroundPermissionRationale: {
        title: 'TukTrack precisa da sua localizacao',
        message:
          'Para partilhar a sua localizacao enquanto usa outras aplicacoes, ative a localizacao em segundo plano.',
        positiveAction: 'Permitir sempre',
        negativeAction: 'Cancelar',
      },
    },
  },
};

export default config;
