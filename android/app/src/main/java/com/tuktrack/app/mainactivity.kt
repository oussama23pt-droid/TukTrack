package com.tuktrack.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import com.getcapacitor.BridgeActivity
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * MainActivity — extends BridgeActivity so Capacitor auto-registers
 * all plugins that were added via `npx cap sync`.
 *
 * We override openUrl to intercept two special scheme URIs and fire
 * the correct Android Settings intents that cannot be fired via a
 * plain Intent(ACTION_VIEW) or WebView navigation:
 *
 *   manage-overlay://  → ACTION_MANAGE_OVERLAY_PERMISSION  (Display over other apps)
 *   app-settings://    → ACTION_APPLICATION_DETAILS_SETTINGS (App info > Permissions > Location)
 */
class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
    }

    /**
     * Capacitor's App plugin calls bridge.openUrl(url) which eventually
     * reaches startActivity(Intent(ACTION_VIEW, uri)).
     * We intercept before that for our two special URIs.
     */
    override fun onStart() {
        super.onStart()

        // Register a handler so JS can call window.AndroidBridge.openOverlaySettings()
        // and window.AndroidBridge.openAppSettings() directly from the WebView.
        bridge.webView.addJavascriptInterface(object : Any() {

            @android.webkit.JavascriptInterface
            fun openOverlaySettings() {
                val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:${packageName}")
                    )
                } else {
                    // Pre-M: open general app settings
                    Intent(
                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:${packageName}")
                    )
                }
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
            }

            @android.webkit.JavascriptInterface
            fun openAppSettings() {
                val intent = Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${packageName}")
                )
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
            }

        }, "AndroidBridge")
    }
}
