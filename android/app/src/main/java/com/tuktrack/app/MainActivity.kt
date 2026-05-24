package com.tuktrack.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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
        // Keep in sync with LocationForegroundService.CHANNEL_ID
        private const val CHANNEL_ONLINE              = "tuktrack_gps_v2"
        private const val CHANNEL_ALERTS              = "tuktrack_alerts"
    }

    // Receives GPS coords from LocationForegroundService → forwards to WebView
    // Only runs while app is in foreground/background — NOT when killed.
    // When killed, the service writes directly to Firestore via REST.
    private val locationReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != "com.tuktrack.LOCATION_UPDATE") return
            val lat = intent.getDoubleExtra("lat", 0.0)
            val lng = intent.getDoubleExtra("lng", 0.0)
            val acc = intent.getFloatExtra("accuracy", 0f)
            try {
                bridge.webView.post {
                    bridge.webView.evaluateJavascript("""
                        (function(){
                          window.dispatchEvent(new CustomEvent('nativeLocationUpdate',{
                            detail:{latitude:$lat,longitude:$lng,accuracy:$acc}
                          }));
                          if(typeof window.medianLocationUpdated==='function')
                            window.medianLocationUpdated({latitude:$lat,longitude:$lng,accuracy:$acc});
                        })();
                    """.trimIndent(), null)
                }
            } catch (_: Exception) {}
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannels()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATION)
            }
        }

        val filter = IntentFilter("com.tuktrack.LOCATION_UPDATE")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(locationReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(locationReceiver, filter)
        }
    }

    override fun onStart()  { super.onStart();  injectBridge() }
    override fun onResume() { super.onResume(); injectBridge() }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(locationReceiver) } catch (_: Exception) {}
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        try {
            bridge.webView.evaluateJavascript(
                "window.dispatchEvent(new Event('permissionResult'));", null)
        } catch (_: Exception) {}
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        try {
            bridge.webView.evaluateJavascript(
                "window.dispatchEvent(new Event('permissionResult'));", null)
        } catch (_: Exception) {}
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)

            // Remove the old DEFAULT channel — Samsung caches importance and NEVER
            // downgrades it, so "tuktrack_online" stays dismissable forever.
            // Deleting it forces a fresh creation at IMPORTANCE_LOW.
            try { nm.deleteNotificationChannel("tuktrack_online") } catch (_: Exception) {}

            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ONLINE, "TukTrack GPS Ativo",
                    NotificationManager.IMPORTANCE_LOW).apply {
                    description          = "Mostra enquanto o motorista partilha localização"
                    setShowBadge(false)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    setSound(null, null)
                    enableVibration(false)
                }
            )
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ALERTS, "TukTrack Alertas",
                    NotificationManager.IMPORTANCE_HIGH).apply {
                    description          = "SOS, turno, GPS e mensagens"
                    setShowBadge(true)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                    enableVibration(true)
                }
            )
        }
    }

    /**
     * injectBridge — called on onStart and onResume AND after every page load.
     *
     * KEY: we now also post a delayed re-inject after 500 ms to handle the race
     * where the JS app finishes rendering AFTER onResume fires (common on first launch
     * with a Capacitor/React app). This ensures AndroidBridge is always on window
     * by the time the driver taps GO ONLINE.
     */
    private fun injectBridge() {
        try {
            val webView: WebView = bridge.webView
            webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
            val orig = webView.webViewClient
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
                ) = orig?.shouldOverrideUrlLoading(view, request) ?: false
            }
            // Delayed re-inject — covers the React first-render race condition
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
                    webView.evaluateJavascript(
                        "if(!window.__ANDROID_BRIDGE_READY__){" +
                        "window.__ANDROID_BRIDGE_READY__=true;" +
                        "window.dispatchEvent(new Event('androidBridgeReady'));}", null)
                } catch (_: Exception) {}
            }, 500)
        } catch (_: Exception) {}
    }

    private fun hasNotificationPermission() =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        else true

    private fun buildTapIntent(): PendingIntent {
        val i = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(this, 0, i,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    inner class AndroidBridge {

        // ── 1. FOREGROUND SERVICE + NON-DISMISSABLE NOTIFICATION ────────────────
        /**
         * Called by JS when the driver presses ONLINE.
         *
         * IMPORTANT: We start the foreground service regardless of notification
         * permission — the service MUST run for GPS to work. The notification
         * simply won't show on Android 13+ if permission is denied, but GPS
         * will still be shared.
         *
         * Saves driver_uid so the native service can write Firestore via REST
         * when the app is killed and the WebView/JS SDK are gone.
         */
        @JavascriptInterface
        fun showForegroundNotification(title: String, message: String, shiftStartMs: Long = 0L) {
            // Request notification permission if missing (Android 13+) — but don't block
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                !hasNotificationPermission()) {
                ActivityCompat.requestPermissions(this@MainActivity,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATION)
                // Fall through — still start the service
            }

            val realStart = if (shiftStartMs > 0) shiftStartMs else System.currentTimeMillis()
            getSharedPreferences("tuktrack", Context.MODE_PRIVATE).edit()
                .putBoolean("driver_was_online", true)
                .putLong("shift_start_ms", realStart)
                .apply()

            val svc = Intent(this@MainActivity, LocationForegroundService::class.java).apply {
                putExtra(LocationForegroundService.EXTRA_SHIFT_START, realStart)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                startForegroundService(svc)
            else
                startService(svc)
        }

        @JavascriptInterface
        fun hideForegroundNotification() {
            getSharedPreferences("tuktrack", Context.MODE_PRIVATE).edit()
                .putBoolean("driver_was_online", false)
                .remove("driver_uid")
                .apply()
            stopService(Intent(this@MainActivity, LocationForegroundService::class.java))
        }

        /**
         * Saves the Firebase UID so the service can write to Firestore via REST
         * when the app is killed. Call this right before showForegroundNotification.
         */
        @JavascriptInterface
        fun setDriverUid(uid: String) {
            if (uid.isBlank()) return
            getSharedPreferences("tuktrack", Context.MODE_PRIVATE).edit()
                .putString("driver_uid", uid)
                .apply()
        }

        // ── 2. ALERT NOTIFICATIONS ───────────────────────────────────────────────
        @JavascriptInterface
        fun showAlertNotification(title: String, message: String, notifId: Int) {
            if (!hasNotificationPermission()) return
            try {
                NotificationManagerCompat.from(this@MainActivity).notify(notifId,
                    NotificationCompat.Builder(this@MainActivity, CHANNEL_ALERTS)
                        .setContentTitle(title)
                        .setContentText(message)
                        .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                        .setSmallIcon(R.drawable.ic_stat_icon)
                        .setContentIntent(buildTapIntent())
                        .setAutoCancel(true)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setDefaults(NotificationCompat.DEFAULT_ALL)
                        .build())
            } catch (_: SecurityException) {}
        }

        @JavascriptInterface
        fun dismissNotification(notifId: Int) {
            NotificationManagerCompat.from(this@MainActivity).cancel(notifId)
        }

        // ── 3. OVERLAY PERMISSION ────────────────────────────────────────────────
        @JavascriptInterface
        fun openOverlaySettings() {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${packageName}")))
        }

        @JavascriptInterface
        fun isOverlayGranted(): Boolean =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                Settings.canDrawOverlays(this@MainActivity) else true

        // ── 4. BACKGROUND LOCATION ───────────────────────────────────────────────
        @JavascriptInterface
        fun openBackgroundLocationSettings() {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        }

        @JavascriptInterface
        fun requestBackgroundLocation(): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
            val granted = ContextCompat.checkSelfPermission(this@MainActivity,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (!granted) openBackgroundLocationSettings()
            return granted
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

        @JavascriptInterface
        fun openNotificationSettings() {
            startActivity(
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                        putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                    }
                else
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:${packageName}")
                    }
            )
        }

        // ── 5. KEEP-ALIVE STATE ──────────────────────────────────────────────────
        @JavascriptInterface
        fun setDriverOnlineState(isOnline: Boolean) {
            getSharedPreferences("tuktrack", Context.MODE_PRIVATE).edit()
                .putBoolean("driver_was_online", isOnline).apply()
        }

        @JavascriptInterface
        fun isDriverOnline(): Boolean =
            getSharedPreferences("tuktrack", Context.MODE_PRIVATE)
                .getBoolean("driver_was_online", false)

        @JavascriptInterface
        fun isServiceRunning(): Boolean {
            val mgr = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            @Suppress("DEPRECATION")
            return mgr.getRunningServices(Int.MAX_VALUE).any {
                it.service.className == LocationForegroundService::class.java.name
            }
        }
    }
}
