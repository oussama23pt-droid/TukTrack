/**
 * useAndroidPermissions.ts
 *
 * Centralises all AndroidBridge permission calls so DriverDashboard doesn't
 * need to scatter bridge logic everywhere.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * The original code called AndroidBridge methods inline, which failed silently
 * because:
 *   a) The bridge is injected asynchronously by MainActivity — it may not exist
 *      yet when the component mounts.
 *   b) The old openOverlaySettings() used FLAG_ACTIVITY_NEW_TASK which opened
 *      the generic overlay list, not TukTrack's entry.
 *   c) requestBackgroundLocation() jumped straight to ACCESS_BACKGROUND_LOCATION
 *      without first confirming ACCESS_FINE_LOCATION — Android 11+ silently
 *      drops this, so "Allow all the time" never appeared.
 *
 * This hook waits for the bridge to be ready before doing anything, then
 * exposes clean async helpers.
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

function getBridge(): AndroidBridgeType | null {
  return (window as any).AndroidBridge ?? null;
}

/** Resolves as soon as AndroidBridge is injected (or immediately if already there). */
function waitForBridge(timeoutMs = 5000): Promise<AndroidBridgeType | null> {
  return new Promise((resolve) => {
    const bridge = getBridge();
    if (bridge) { resolve(bridge); return; }

    const start = Date.now();
    const interval = setInterval(() => {
      const b = getBridge();
      if (b) { clearInterval(interval); resolve(b); return; }
      if (Date.now() - start > timeoutMs) { clearInterval(interval); resolve(null); }
    }, 150);

    // Also listen for the event fired by MainActivity's onPageFinished hook
    const handler = () => {
      clearInterval(interval);
      resolve(getBridge());
    };
    window.addEventListener('androidBridgeReady', handler, { once: true });
  });
}

export interface PermissionState {
  overlay: boolean;
  backgroundLocation: boolean;
  bridgeAvailable: boolean;
}

export function useAndroidPermissions() {
  const [state, setState] = useState<PermissionState>({
    overlay: false,
    backgroundLocation: false,
    bridgeAvailable: false,
  });

  const bridgeRef = useRef<AndroidBridgeType | null>(null);

  // On mount, wait for the bridge then read initial permission state
  useEffect(() => {
    let cancelled = false;
    waitForBridge().then((bridge) => {
      if (cancelled || !bridge) return;
      bridgeRef.current = bridge;
      setState({
        bridgeAvailable: true,
        overlay: bridge.isOverlayGranted(),
        backgroundLocation: bridge.isBackgroundLocationGranted(),
      });
    });
    return () => { cancelled = true; };
  }, []);

  /** Refresh permission state — call after user returns from Settings. */
  const refresh = useCallback(() => {
    const bridge = bridgeRef.current ?? getBridge();
    if (!bridge) return;
    setState({
      bridgeAvailable: true,
      overlay: bridge.isOverlayGranted(),
      backgroundLocation: bridge.isBackgroundLocationGranted(),
    });
  }, []);

  /**
   * Open the "Display over other apps" screen for TukTrack.
   * Returns a polling cleanup to detect when the user grants it.
   */
  const requestOverlay = useCallback((onGranted?: () => void) => {
    const bridge = bridgeRef.current ?? getBridge();
    if (!bridge) {
      alert(
        'Vá a: Definições → Aplicações → TukTrack → Permissões especiais → Aparecer por cima de outras apps → Ativar'
      );
      return;
    }

    if (bridge.isOverlayGranted()) {
      setState((s) => ({ ...s, overlay: true }));
      onGranted?.();
      return;
    }

    bridge.openOverlaySettings();

    // Poll until granted (user is in Settings now)
    let checks = 0;
    const poll = setInterval(() => {
      checks++;
      if (bridge.isOverlayGranted()) {
        clearInterval(poll);
        setState((s) => ({ ...s, overlay: true }));
        onGranted?.();
      }
      if (checks >= 40) clearInterval(poll); // 40 × 500 ms = 20 s
    }, 500);
  }, []);

  /**
   * Request background location ("Allow all the time").
   *
   * The fixed MainActivity enforces the two-step flow:
   *   1. Grant ACCESS_FINE_LOCATION (foreground) if needed
   *   2. Then request ACCESS_BACKGROUND_LOCATION
   *
   * We poll on the JS side until the bridge confirms it's granted,
   * then fall back to opening App Settings if the user took too long.
   */
  const requestBackgroundLocation = useCallback((onGranted?: () => void) => {
    const bridge = bridgeRef.current ?? getBridge();

    if (!bridge) {
      // Non-Android / web: show manual instructions
      alert(
        'Vá a: Definições → Aplicações → TukTrack → Permissões → Localização → Permitir sempre'
      );
      return;
    }

    if (bridge.isBackgroundLocationGranted()) {
      setState((s) => ({ ...s, backgroundLocation: true }));
      onGranted?.();
      return;
    }

    // Trigger the two-step native permission flow
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
      // After 15 s with no grant, open App Settings as fallback
      if (checks >= 30) {
        clearInterval(poll);
        if (!bridge.isBackgroundLocationGranted()) {
          // openLocationSettings() opens the app detail page; driver taps
          // Permissions → Location → Allow all the time manually.
          if (typeof bridge.openLocationSettings === 'function') {
            bridge.openLocationSettings();
          } else {
            bridge.openAppSettings();
          }
        }
      }
    }, 500);
  }, []);

  return { state, refresh, requestOverlay, requestBackgroundLocation };
}

