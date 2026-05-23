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
        private const val REQUEST_FINE_LOCATION       = 1000
        private const val REQUEST_BACKGROUND_LOCATION = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    override fun onStart() {
        super.onStart()
        injectBridge()
    }

    private fun injectBridge() {
        try {
            val webView: WebView = bridge.webView
            webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

            val originalClient = webView.webViewClient
            webView.webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    view?.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
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
            // Bridge not yet ready
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    inner class AndroidBridge {

        // ── Foreground Service (the KEY new methods) ──────────────────────────

        /**
         * Start the foreground service → shows sticky notification immediately,
         * keeps process alive in background. Call this when driver goes Online.
         */
        @JavascriptInterface
        fun startForegroundTracking() {
            val intent = Intent(this@MainActivity, ForegroundLocationService::class.java)
                .setAction(ForegroundLocationService.ACTION_START)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
        }

        /**
         * Stop the foreground service → removes the notification, allows the
         * OS to reclaim resources. Call this when driver goes Offline.
         */
        @JavascriptInterface
        fun stopForegroundTracking() {
            val intent = Intent(this@MainActivity, ForegroundLocationService::class.java)
                .setAction(ForegroundLocationService.ACTION_STOP)
            startService(intent)
        }

        // ── Overlay ("Display over other apps") ───────────────────────────────
        @JavascriptInterface
        fun openOverlaySettings() {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${packageName}")
            )
            startActivity(intent)
        }

        @JavascriptInterface
        fun isOverlayGranted(): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(this@MainActivity)
            } else true
        }

        // ── Background location ("Allow all the time") ────────────────────────
        @JavascriptInterface
        fun requestBackgroundLocation(): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true

            val fineGranted = ContextCompat.checkSelfPermission(
                this@MainActivity,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!fineGranted) {
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ),
                    REQUEST_FINE_LOCATION
                )
                return false
            }

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

        // ── Settings shortcuts ────────────────────────────────────────────────
        @JavascriptInterface
        fun openLocationSettings() {
            startActivity(Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")
            ))
        }

        @JavascriptInterface
        fun openAppSettings() {
            startActivity(Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")
            ))
        }
    }
}
