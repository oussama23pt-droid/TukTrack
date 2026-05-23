package com.tuktrack.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    companion object {
        private const val REQUEST_BACKGROUND_LOCATION = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    override fun onStart() {
        super.onStart()

        // Inject AndroidBridge into the WebView so JavaScript can call native
        // Android Settings intents directly. This is the only reliable way to:
        //   1. Open "Display over other apps" (SYSTEM_ALERT_WINDOW) settings
        //   2. Open app detail settings (for "Allow all the time" location)
        //   3. Request ACCESS_BACKGROUND_LOCATION at runtime (Android 10+)
        bridge.webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
    }

    inner class AndroidBridge {

        /**
         * Opens Settings → Apps → Special app access → Display over other apps → TukTrack
         * This is the screen where the driver enables "Appear on top of other apps".
         * ACTION_MANAGE_OVERLAY_PERMISSION with the package URI is the ONLY way to
         * open this page for a specific app — no intent:// shortcut works from WebView.
         */
        @JavascriptInterface
        fun openOverlaySettings() {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        }

        /**
         * Opens Settings → Apps → TukTrack → Permissions → Location
         * From there the driver selects "Allow all the time".
         * We use ACTION_APPLICATION_DETAILS_SETTINGS which lands on the app's
         * full info page — the driver taps Permissions → Location → Allow all the time.
         */
        @JavascriptInterface
        fun openAppSettings() {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        }

        /**
         * Requests ACCESS_BACKGROUND_LOCATION at runtime.
         * On Android 10+ (API 29+) this permission MUST be requested separately,
         * AFTER ACCESS_FINE_LOCATION is already granted. Requesting it together
         * with fine location silently fails and hides "Allow all the time".
         * Returns true if already granted, false if the dialog will be shown.
         */
        @JavascriptInterface
        fun requestBackgroundLocation(): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                // Pre-Android 10: background location is included with fine location
                return true
            }
            val granted = ContextCompat.checkSelfPermission(
                this@MainActivity,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED

            if (!granted) {
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                    REQUEST_BACKGROUND_LOCATION
                )
            }
            return granted
        }

        /**
         * Returns true if ACCESS_BACKGROUND_LOCATION is already granted.
         * JS can poll this after the driver returns from settings.
         */
        @JavascriptInterface
        fun isBackgroundLocationGranted(): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
            return ContextCompat.checkSelfPermission(
                this@MainActivity,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }

        /**
         * Returns true if SYSTEM_ALERT_WINDOW (overlay) is already granted.
         */
        @JavascriptInterface
        fun isOverlayGranted(): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(this@MainActivity)
            } else {
                true
            }
        }
    }
}
