package com.tuktrack.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    companion object {
        private const val REQUEST_FINE_LOCATION    = 1000
        private const val REQUEST_BACKGROUND_LOCATION = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    // ── Inject the bridge as early as possible, and again on every page load ──
    // Capacitor's WebView is not available until after super.onCreate(), so we
    // hook onStart() AND override onPageFinished via a WebViewClient so the
    // bridge survives page navigations (e.g. Vercel redirects after login).
    override fun onStart() {
        super.onStart()
        injectBridge()
    }

    private fun injectBridge() {
        try {
            val webView: WebView = bridge.webView
            webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

            // Also inject a small JS shim so the web side can detect the bridge
            // immediately on DOMContentLoaded without a race condition.
            val originalClient = webView.webViewClient
            webView.webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    // Re-inject after every navigation to survive SPA route changes
                    view?.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
                    // Signal to the React app that the bridge is ready
                    view?.evaluateJavascript(
                        "window.__ANDROID_BRIDGE_READY__ = true; " +
                        "window.dispatchEvent(new Event('androidBridgeReady'));",
                        null
                    )
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: android.webkit.WebResourceRequest?
                ): Boolean {
                    return originalClient?.shouldOverrideUrlLoading(view, request) ?: false
                }
            }
        } catch (e: Exception) {
            // Bridge not yet ready — onStart() will retry
        }
    }

    // ────────────────────────────────────────────────────────────────────────────
    inner class AndroidBridge {

        // ── 1. "Display over other apps" ────────────────────────────────────────
        // FIX: FLAG_ACTIVITY_NEW_TASK was causing Android to open the *generic*
        // overlay list instead of navigating to TukTrack's own entry — which also
        // meant TukTrack was invisible in the list on Android 12+.
        @JavascriptInterface
        fun openOverlaySettings() {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${packageName}")
            )
            // No FLAG_ACTIVITY_NEW_TASK — let it stack on top of MainActivity
            startActivity(intent)
        }

        @JavascriptInterface
        fun isOverlayGranted(): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(this@MainActivity)
            } else {
                true // below API 23 the permission is granted by default
            }
        }

        // ── 2. Background location ("Allow all the time") ───────────────────────
        // FIX: Android 11+ (API 30+) FORBIDS requesting ACCESS_BACKGROUND_LOCATION
        // together with foreground location in a single requestPermissions() call.
        // The system silently drops it, so "Allow all the time" never appears.
        // Correct flow: grant fine/coarse first → THEN request background in a
        // separate call. This method enforces the two-step sequence.
        @JavascriptInterface
        fun requestBackgroundLocation(): Boolean {
            // Below Android 10 background location doesn't exist as a separate permission
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true

            val fineGranted = ContextCompat.checkSelfPermission(
                this@MainActivity,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!fineGranted) {
                // Step 1 — ask for foreground location first
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ),
                    REQUEST_FINE_LOCATION
                )
                return false // web side must call again after user responds
            }

            // Step 2 — foreground is granted, now ask for background
            val bgGranted = ContextCompat.checkSelfPermission(
                this@MainActivity,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!bgGranted) {
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                    REQUEST_BACKGROUND_LOCATION
                )
            }

            return bgGranted
        }

        @JavascriptInterface
        fun isBackgroundLocationGranted(): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
            return ContextCompat.checkSelfPermission(
                this@MainActivity,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }

        // ── 3. Fallback — open app's own permission page in Settings ────────────
        // Use this when the system dialog was already dismissed: driver taps
        // Permissions → Location → Allow all the time themselves.
        @JavascriptInterface
        fun openLocationSettings() {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")
            )
            startActivity(intent)
        }

        // ── 4. General app settings (unchanged, kept for compatibility) ──────────
        @JavascriptInterface
        fun openAppSettings() {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")
            )
            startActivity(intent)
        }
    }
}
