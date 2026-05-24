package com.tuktrack.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    companion object {
        private const val REQUEST_FINE_LOCATION       = 1000
        private const val REQUEST_BACKGROUND_LOCATION = 1001
        private const val REQUEST_NOTIFICATION        = 1002
        private const val CHANNEL_ONLINE              = "tuktrack_online"
        private const val CHANNEL_ALERTS              = "tuktrack_alerts"
        private const val NOTIFICATION_ONLINE_ID      = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannels()

        // Request POST_NOTIFICATIONS immediately on Android 13+ so LocalNotifications
        // and our AndroidBridge notifications both work without extra prompts
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATION)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        injectBridge()
    }

    // After any permission dialog closes, fire a JS event so the UI can re-check state
    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        try {
            bridge.webView.evaluateJavascript(
                "window.dispatchEvent(new Event('permissionResult'));", null)
        } catch (_: Exception) {}
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)

            // Channel 1: persistent "driver is online" — no sound, non-dismissable
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ONLINE, "TukTrack Online Status",
                    NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Mostra enquanto o motorista partilha localização"
                    setShowBadge(false)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
            )

            // Channel 2: alert notifications (SOS, shift, GPS, messages)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ALERTS, "TukTrack Alertas",
                    NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "SOS, turno, GPS e mensagens"
                    setShowBadge(true)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    enableVibration(true)
                }
            )
        }
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
                        "window.__ANDROID_BRIDGE_READY__=true;" +
                        "window.dispatchEvent(new Event('androidBridgeReady'));", null)
                }
                override fun shouldOverrideUrlLoading(
                    view: WebView?, request: android.webkit.WebResourceRequest?
                ) = originalClient?.shouldOverrideUrlLoading(view, request) ?: false
            }
        } catch (e: Exception) {}
    }

    private fun hasNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(this,
                Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    private fun buildTapIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    inner class AndroidBridge {

        // ── 1. FOREGROUND SERVICE NOTIFICATION (non-dismissable) ─────────────────
        // Uses LocationForegroundService which calls startForeground() —
        // the ONLY type of notification Android prevents users from dismissing.
        // The notification shows a live timer ticking from shiftStartMs.
        @JavascriptInterface
        fun showForegroundNotification(title: String, message: String, shiftStartMs: Long = 0L) {
            if (!hasNotificationPermission()) {
                ActivityCompat.requestPermissions(this@MainActivity,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATION)
                return
            }
            val svcIntent = Intent(this@MainActivity, LocationForegroundService::class.java).apply {
                putExtra(LocationForegroundService.EXTRA_SHIFT_START,
                    if (shiftStartMs > 0) shiftStartMs else System.currentTimeMillis())
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svcIntent)
            } else {
                startService(svcIntent)
            }
        }

        @JavascriptInterface
        fun hideForegroundNotification() {
            // Stopping the service removes its startForeground notification automatically
            stopService(Intent(this@MainActivity, LocationForegroundService::class.java))
        }

        // ── 2. ALERT NOTIFICATIONS (messages, SOS, GPS events) ──────────────────
        // These CAN be dismissed — used for messages and alerts
        @JavascriptInterface
        fun showAlertNotification(title: String, message: String, notifId: Int) {
            if (!hasNotificationPermission()) return

            val notification = NotificationCompat.Builder(this@MainActivity, CHANNEL_ALERTS)
                .setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(android.R.drawable.ic_dialog_email)
                .setContentIntent(buildTapIntent())
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .build()

            try {
                NotificationManagerCompat.from(this@MainActivity).notify(notifId, notification)
            } catch (e: SecurityException) {}
        }

        @JavascriptInterface
        fun dismissNotification(notifId: Int) {
            NotificationManagerCompat.from(this@MainActivity).cancel(notifId)
        }

        // ── 3. GPS / OVERLAY / LOCATION PERMISSIONS ──────────────────────────────

        @JavascriptInterface
        fun openOverlaySettings() {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${packageName}")))
        }

        @JavascriptInterface
        fun isOverlayGranted(): Boolean =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                Settings.canDrawOverlays(this@MainActivity) else true

        @JavascriptInterface
        fun requestBackgroundLocation(): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
            val fine = ContextCompat.checkSelfPermission(this@MainActivity,
                Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (!fine) {
                ActivityCompat.requestPermissions(this@MainActivity,
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION),
                    REQUEST_FINE_LOCATION)
                return false
            }
            val bg = ContextCompat.checkSelfPermission(this@MainActivity,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (!bg) ActivityCompat.requestPermissions(this@MainActivity,
                arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                REQUEST_BACKGROUND_LOCATION)
            return bg
        }

        @JavascriptInterface
        fun isBackgroundLocationGranted(): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
            return ContextCompat.checkSelfPermission(this@MainActivity,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        }

        @JavascriptInterface
        fun openLocationSettings() {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")))
        }

        @JavascriptInterface
        fun openAppSettings() {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")))
        }

        // ── 4. OPEN NOTIFICATION SETTINGS directly ────────────────────────────────
        @JavascriptInterface
        fun openNotificationSettings() {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                }
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${packageName}")
                }
            }
            startActivity(intent)
        }
    }
}
