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
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : BridgeActivity() {

    companion object {
        private const val REQUEST_FINE_LOCATION       = 1000
        private const val REQUEST_BACKGROUND_LOCATION = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Eagerly fetch / refresh the FCM token and cache it so
        // AndroidBridge.getFcmToken() can return it synchronously.
        refreshFcmToken()
    }

    override fun onStart() {
        super.onStart()
        bridge.webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
    }

    // ── FCM token refresh (called once at startup) ─────────────────────────────

    private fun refreshFcmToken() {
        try {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                if (token.isNullOrBlank()) return@addOnSuccessListener
                // Cache for JS
                getSharedPreferences("tuktrack", MODE_PRIVATE)
                    .edit()
                    .putString("fcm_token", token)
                    .apply()
                // Push to Firestore if driver UID is known
                val uid = getSharedPreferences("tuktrack", MODE_PRIVATE)
                    .getString("driver_uid", null)
                if (!uid.isNullOrBlank()) {
                    TukTrackFirebaseService().also {
                        // Bind context via reflection isn't needed; call the static helper
                        updateFcmTokenDirectly(uid, token)
                    }
                }
            }
        } catch (_: Exception) {}
    }

    private fun updateFcmTokenDirectly(uid: String, token: String) {
        Thread {
            try {
                val body = org.json.JSONObject().apply {
                    put("fields", org.json.JSONObject().apply {
                        put("fcmToken", org.json.JSONObject().put("stringValue", token))
                    })
                }.toString()
                val url = java.net.URL(
                    "https://firestore.googleapis.com/v1/projects/tuktrack-19377/databases/(default)/documents/users/$uid?updateMask.fieldPaths=fcmToken"
                )
                val conn = (url.openConnection() as java.net.HttpURLConnection).apply {
                    requestMethod  = "PATCH"
                    connectTimeout = 10_000
                    readTimeout    = 10_000
                    doOutput       = true
                    setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                }
                java.io.OutputStreamWriter(conn.outputStream, "UTF-8").use { it.write(body) }
                conn.responseCode
                conn.disconnect()
            } catch (_: Exception) {}
        }.start()
    }

    // ── AndroidBridge (JS ↔ Native) ────────────────────────────────────────────

    inner class AndroidBridge {

        // ── Push / alert notifications ───────────────────────────────────────
        //
        // Called by JS (useFcmToken.ts and DriverDashboard.tsx) to pop a
        // heads-up push notification visible in the Android notification bar.
        //
        // Parameters:
        //   title   — notification title
        //   message — notification body text
        //   notifId — unique int so multiple alerts don't overwrite each other

        @JavascriptInterface
        fun showAlertNotification(title: String, message: String, notifId: Int) {
            try {
                TukTrackFirebaseService().apply {
                    // attachBaseContext is normally called by the framework; we call
                    // showPushNotification via the application context instead.
                }.let {
                    // Use applicationContext so the service helper can reach resources
                    val svc = TukTrackFirebaseService()
                    svc.attachBaseContext(applicationContext)   // needed for resources
                    // Delegate to service helper — reuses same channel + builder logic
                }
                // Simpler: just build and show directly here using applicationContext
                showAlertNotificationInternal(title, message, notifId)
            } catch (e: Exception) {
                android.util.Log.e("TukTrack", "showAlertNotification error", e)
            }
        }

        // ── FCM token accessor ────────────────────────────────────────────────
        //
        // Returns the cached FCM registration token so JS can register it
        // with Firestore without going through the Capacitor plugin.

        @JavascriptInterface
        fun getFcmToken(): String {
            return getSharedPreferences("tuktrack", MODE_PRIVATE)
                .getString("fcm_token", "") ?: ""
        }

        // ── Overlay ("appear on top") ────────────────────────────────────────
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
            } else {
                true
            }
        }

        // ── Location — two-step flow required on Android 11+ ─────────────────
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
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")
            )
            startActivity(intent)
        }

        @JavascriptInterface
        fun openAppSettings() {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")
            )
            startActivity(intent)
        }

        // ── Foreground service (persistent online status notification) ────────
        @JavascriptInterface
        fun showForegroundNotification(title: String, message: String, shiftStartMs: Long) {
            val intent = Intent(this@MainActivity, LocationForegroundService::class.java).apply {
                putExtra(LocationForegroundService.EXTRA_SHIFT_START, shiftStartMs)
            }
            ContextCompat.startForegroundService(this@MainActivity, intent)
        }

        @JavascriptInterface
        fun hideForegroundNotification() {
            stopService(Intent(this@MainActivity, LocationForegroundService::class.java))
        }
    }

    // ── Internal helper: show alert notification from Activity context ─────────

    private fun showAlertNotificationInternal(title: String, body: String, notifId: Int) {
        ensureAlertsChannel()

        val tapIntent = android.app.PendingIntent.getActivity(
            this, notifId,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val notification = androidx.core.app.NotificationCompat.Builder(
            this,
            TukTrackFirebaseService.ALERTS_CHANNEL_ID
        )
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(androidx.core.app.NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setColor(0xFFF59E0B.toInt())
            .setContentIntent(tapIntent)
            .setAutoCancel(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
            .setDefaults(androidx.core.app.NotificationCompat.DEFAULT_ALL)
            .setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        getSystemService(android.app.NotificationManager::class.java)
            .notify(notifId, notification)
    }

    private fun ensureAlertsChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(android.app.NotificationManager::class.java)
        if (nm.getNotificationChannel(TukTrackFirebaseService.ALERTS_CHANNEL_ID) != null) return

        val ch = android.app.NotificationChannel(
            TukTrackFirebaseService.ALERTS_CHANNEL_ID,
            TukTrackFirebaseService.ALERTS_CHANNEL_NAME,
            android.app.NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Alertas do TukTrack: turnos, mensagens, SOS"
            enableVibration(true)
            enableLights(true)
            setShowBadge(true)
        }
        nm.createNotificationChannel(ch)
    }
}
