import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tuktrack.app',
  appName: 'TukTrack',
  webDir: 'dist',

  // ✅ NO "server" block here — this was the root cause of ERR_CONNECTION_REFUSED.
  // A "server.url" pointing to a dev machine (e.g. http://192.168.x.x:5173)
  // works in development but breaks the APK for all other users.
  // Removing it makes Capacitor serve the bundled assets from assets/public/ correctly.

  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false, // keep false for production
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
