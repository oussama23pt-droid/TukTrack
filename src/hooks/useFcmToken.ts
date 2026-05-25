/**
 * useFcmToken.ts
 *
 * Registers the device FCM token with Firestore so Firebase Functions
 * can send push notifications to this device.
 *
 * HOW IT WORKS:
 * 1. The Capacitor FCM plugin (or web Push API) provides a device token.
 * 2. We save it to the user's Firestore document under `fcmToken`.
 * 3. Firebase Functions read `fcmToken` when sending pushes.
 *
 * SETUP REQUIRED (one-time):
 * - Add firebase-messaging to your capacitor project
 * - Add google-services.json in android/app/
 * - The VITE_FIREBASE_VAPID_KEY env var for web push (optional for APK)
 */

import { useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useFcmToken(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;

    const registerToken = async () => {
      try {
        // ── Capacitor FCM (used in APK) ──────────────────────────────────────
        const CapFCM = (window as any)?.Capacitor?.Plugins?.FirebaseMessaging;
        if (CapFCM) {
          // Request permission first
          const { receive } = await CapFCM.requestPermissions();
          if (receive !== 'granted') return;

          const { token } = await CapFCM.getToken();
          if (!token) return;

          await updateDoc(doc(db, 'users', userId), { fcmToken: token });
          console.log('[FCM] Token registered:', token.slice(0, 20) + '...');

          // Listen for foreground messages
          CapFCM.addListener('notificationReceived', (notification: any) => {
            console.log('[FCM] Foreground notification:', notification);
            // AndroidBridge can show an alert notification
            try {
              const bridge = (window as any).AndroidBridge;
              if (bridge?.showAlertNotification) {
                bridge.showAlertNotification(
                  notification.notification?.title || 'TukTrack',
                  notification.notification?.body || '',
                  Date.now() % 9000 + 1000
                );
              }
            } catch (_) {}
          });
          return;
        }

        // ── AndroidBridge FCM token (injected by native layer) ───────────────
        const bridge = (window as any).AndroidBridge;
        if (bridge?.getFcmToken) {
          const token = bridge.getFcmToken();
          if (token) {
            await updateDoc(doc(db, 'users', userId), { fcmToken: token });
            console.log('[FCM] AndroidBridge token registered');
          }
          return;
        }

        // ── Web Push API (PWA / development) ─────────────────────────────────
        if ('Notification' in window && 'serviceWorker' in navigator) {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
          // Web push token handled separately via firebase/messaging if needed
        }
      } catch (err) {
        console.warn('[FCM] Token registration failed:', err);
      }
    };

    // Delay slightly so Capacitor plugins are fully initialized
    const timer = setTimeout(registerToken, 2000);
    return () => clearTimeout(timer);
  }, [userId]);
}
