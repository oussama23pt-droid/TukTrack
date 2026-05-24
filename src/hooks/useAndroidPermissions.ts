/**
 * useAndroidPermissions.ts
 *
 * Works across ALL 3 platforms:
 *   1. Web (Vercel)        — no AndroidBridge, no Capacitor → shows manual instructions
 *   2. GitHub APK          — AndroidBridge injected by MainActivity
 *   3. Median APK          — AndroidBridge injected by Median's native layer
 *
 * KEY FIXES:
 *   - Detects platform correctly before requesting anything
 *   - On web: shows clear manual text instructions instead of failing silently
 *   - Notification permission: requested via Capacitor on APK, via browser API on web
 *   - Overlay permission: only requested on Android (meaningless on web)
 *   - Background location: only requested on Android; on web uses standard geolocation
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface AndroidBridgeType {
  openOverlaySettings: () => void;
  isOverlayGranted: () => boolean;
  requestBackgroundLocation: () => boolean;
  isBackgroundLocationGranted: () => boolean;
  openLocationSettings: () => void;
  openAppSettings: () => void;
}

// ─── Platform detection ───────────────────────────────────────────────────────

export function isAndroidApp(): boolean {
  // True for both GitHub APK (Capacitor) and Median APK
  return typeof (window as any).AndroidBridge !== 'undefined' ||
    typeof (window as any).webkit === 'undefined' && // not iOS
    /Android/i.test(navigator.userAgent) &&
    (typeof (window as any).Capacitor !== 'undefined' || typeof (window as any).median !== 'undefined');
}

export function isWeb(): boolean {
  return !isAndroidApp();
}

function getBridge(): AndroidBridgeType | null {
  return (window as any).AndroidBridge ?? null;
}

/** Waits up to timeoutMs for AndroidBridge to be injected */
function waitForBridge(timeoutMs = 6000): Promise<AndroidBridgeType | null> {
  return new Promise((resolve) => {
    const bridge = getBridge();
    if (bridge) { resolve(bridge); return; }

    // On web, don't wait — return null immediately
    if (isWeb()) { resolve(null); return; }

    const start = Date.now();
    const interval = setInterval(() => {
      const b = getBridge();
      if (b) { clearInterval(interval); resolve(b); return; }
      if (Date.now() - start > timeoutMs) { clearInterval(interval); resolve(null); }
    }, 150);

    window.addEventListener('androidBridgeReady', () => {
      clearInterval(interval);
      resolve(getBridge());
    }, { once: true });
  });
}

// ─── Notification helpers (work on all platforms) ────────────────────────────

const NOTIF_ID = 9001;
const SHIFT_NOTIF_ID = 9002;

async function ensureChannel(LocalNotifications: any) {
  try {
    await LocalNotifications.createChannel({
      id: 'tuktrack_foreground',
      name: 'TukTrack Serviço Ativo',
      description: 'Notificação persistente enquanto o motorista está online',
      importance: 4,
      visibility: 1,
      sound: null,
      vibration: false,
      lights: false,
    });
    await LocalNotifications.createChannel({
      id: 'tuktrack_alerts',
      name: 'TukTrack Alertas',
      description: 'Alertas de turno e eventos importantes',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
      lights: true,
    });
  } catch (_) { /* channel already exists — safe */ }
}

/**
 * Show the persistent "TukTrack — Online" status bar notification.
 * Works on GitHub APK and Median APK.
 * Silently skipped on web (no Capacitor LocalNotifications available).
 */
export async function showOnlineNotification(): Promise<void> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await ensureChannel(LocalNotifications);

    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') {
      console.warn('[Notif] POST_NOTIFICATIONS denied by user');
      return;
    }

    // Cancel existing to avoid duplicate
    try { await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] }); } catch (_) {}

    await LocalNotifications.schedule({
      notifications: [{
        id: NOTIF_ID,
        title: '🟢 TukTrack — Em Serviço',
        body: 'A partilhar localização em segundo plano. Toque para abrir.',
        ongoing: true,        // sticky — cannot be swiped away
        autoCancel: false,
        channelId: 'tuktrack_foreground',
        smallIcon: 'ic_stat_icon_default',  // uses the drawable we created
        iconColor: '#F59E0B',
        schedule: { at: new Date(Date.now() + 100) },
      }],
    });
    console.log('[Notif] Online notification shown');
  } catch (e) {
    // Web or Median without Capacitor — silently ignore
    console.info('[Notif] LocalNotifications not available on this platform:', e);
  }
}

export async function cancelOnlineNotification(): Promise<void> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID }] });
  } catch (_) { /* web — ignore */ }
}

export async function sendShiftStartNotification(shiftData?: any): Promise<void> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await ensureChannel(LocalNotifications);
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return;
    try { await LocalNotifications.cancel({ notifications: [{ id: SHIFT_NOTIF_ID }] }); } catch (_) {}
    await LocalNotifications.schedule({
      notifications: [{
        id: SHIFT_NOTIF_ID,
        title: '🚦 Turno Iniciado pelo Gestor!',
        body: 'O seu gestor iniciou um turno. Entre em serviço quando estiver pronto.',
        ongoing: false,
        autoCancel: true,
        channelId: 'tuktrack_alerts',
        smallIcon: 'ic_stat_icon_default',
        iconColor: '#F59E0B',
        schedule: { at: new Date(Date.now() + 200) },
      }],
    });
  } catch (_) { /* web — ignore */ }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface PermissionState {
  overlay: boolean;
  backgroundLocation: boolean;
  bridgeAvailable: boolean;
  isAndroid: boolean;
}

export function useAndroidPermissions() {
  const [state, setState] = useState<PermissionState>({
    overlay: false,
    backgroundLocation: false,
    bridgeAvailable: false,
    isAndroid: false,
  });

  const bridgeRef = useRef<AndroidBridgeType | null>(null);

  useEffect(() => {
    let cancelled = false;
    waitForBridge().then((bridge) => {
      if (cancelled) return;
      bridgeRef.current = bridge;

      if (bridge) {
        setState({
          bridgeAvailable: true,
          isAndroid: true,
          overlay: bridge.isOverlayGranted(),
          backgroundLocation: bridge.isBackgroundLocationGranted(),
        });
      } else {
        // Web — overlay not applicable, background location via browser API
        setState({
          bridgeAvailable: false,
          isAndroid: false,
          overlay: true,            // not needed on web
          backgroundLocation: true, // browser geolocation handles this
        });
      }
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(() => {
    const bridge = bridgeRef.current ?? getBridge();
    if (!bridge) return;
    setState((s) => ({
      ...s,
      overlay: bridge.isOverlayGranted(),
      backgroundLocation: bridge.isBackgroundLocationGranted(),
    }));
  }, []);

  /**
   * Request "Display over other apps" permission.
   * On web: skipped (not applicable).
   * On Android: opens system settings for TukTrack.
   */
  const requestOverlay = useCallback((onGranted?: () => void) => {
    const bridge = bridgeRef.current ?? getBridge();

    // Web — not needed, just call onGranted
    if (!bridge) {
      onGranted?.();
      return;
    }

    if (bridge.isOverlayGranted()) {
      setState((s) => ({ ...s, overlay: true }));
      onGranted?.();
      return;
    }

    bridge.openOverlaySettings();

    let checks = 0;
    const poll = setInterval(() => {
      checks++;
      if (bridge.isOverlayGranted()) {
        clearInterval(poll);
        setState((s) => ({ ...s, overlay: true }));
        onGranted?.();
      }
      if (checks >= 40) clearInterval(poll); // 20 seconds max
    }, 500);
  }, []);

  /**
   * Request background location ("Allow all the time").
   * On web: uses browser geolocation API directly (already "always on").
   * On Android: triggers the two-step native permission flow.
   */
  const requestBackgroundLocation = useCallback((onGranted?: () => void) => {
    const bridge = bridgeRef.current ?? getBridge();

    if (!bridge) {
      // Web — just verify geolocation access, then call onGranted
      navigator.geolocation.getCurrentPosition(
        () => { setState((s) => ({ ...s, backgroundLocation: true })); onGranted?.(); },
        () => { onGranted?.(); } // best-effort
      );
      return;
    }

    if (bridge.isBackgroundLocationGranted()) {
      setState((s) => ({ ...s, backgroundLocation: true }));
      onGranted?.();
      return;
    }

    bridge.requestBackgroundLocation();

    let checks = 0;
    const poll = setInterval(() => {
      checks++;
      if (bridge.isBackgroundLocationGranted()) {
        clearInterval(poll);
        setState((s) => ({ ...s, backgroundLocation: true }));
        onGranted?.();
        return;
      }
      if (checks >= 30) {
        clearInterval(poll);
        // Fallback: open app settings so user can grant manually
        if (typeof bridge.openLocationSettings === 'function') {
          bridge.openLocationSettings();
        } else {
          bridge.openAppSettings();
        }
      }
    }, 500);
  }, []);

  return { state, refresh, requestOverlay, requestBackgroundLocation };
}
