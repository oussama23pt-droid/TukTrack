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
        private const val REQUEST_NOTIFICATIONS       = 1002
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Eagerly fetch / refresh the FCM token and cache it so
        // AndroidBridge.getFcmToken() can return it synchronously.
        refreshFcmToken()

        // Android 13+ (API 33) requires explicit POST_NOTIFICATIONS permission.
        // Show the system dialog on first launch so the user can allow it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this, Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    REQUEST_NOTIFICATIONS
                )
            }
        }
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

        @JavascriptInterface
        fun savePdfToDownloads(base64Data: String, filename: String): String {
            return try {
                val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                    // Android 10+ — use MediaStore, no permission needed
                    val resolver = this@MainActivity.contentResolver
                    val contentValues = android.content.ContentValues().apply {
                        put(android.provider.MediaStore.Downloads.DISPLAY_NAME, filename)
                        put(android.provider.MediaStore.Downloads.MIME_TYPE, "application/pdf")
                        put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
                    }
                    val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                    if (uri != null) {
                        resolver.openOutputStream(uri)?.use { it.write(bytes) }
                        contentValues.clear()
                        contentValues.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
                        resolver.update(uri, contentValues, null, null)
                        "success"
                    } else {
                        "error:could not create file"
                    }
                } else {
                    // Android 9 and below — write directly to Downloads folder
                    val downloadsDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
                    downloadsDir.mkdirs()
                    val file = java.io.File(downloadsDir, filename)
                    java.io.FileOutputStream(file).use { it.write(bytes) }
                    "success"
                }
            } catch (e: Exception) {
                "error:${e.message}"
            }
        }

        @JavascriptInterface
        fun requestStoragePermission() {
            if (android.os.Build.VERSION.SDK_INT <= android.os.Build.VERSION_CODES.P) {
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE),
                    1003
                )
            }
        }

        @JavascriptInterface
        fun hasStoragePermission(): Boolean {
            return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                true // Android 10+ doesn't need permission for Downloads via MediaStore
            } else {
                ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
                ) == PackageManager.PERMISSION_GRANTED
            }
        }
            try {
                showAlertNotificationInternal(title, message, notifId)
            } catch (e: Exception) {
                android.util.Log.e("TukTrack", "showAlertNotification error", e)
            }
        }

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
            // Strategy 1 (Android 11+ / API 30+):
            // Jump directly to the Location permission page using string literals
            // to avoid unresolved references on older SDK compile targets.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    val intent = Intent("android.intent.action.MANAGE_APP_PERMISSIONS").apply {
                        putExtra("android.intent.extra.PACKAGE_NAME", packageName)
                        putExtra(
                            "android.intent.extra.PERMISSION_GROUP_NAME",
                            "android.permission-group.LOCATION"
                        )
                    }
                    startActivity(intent)
                    return
                } catch (_: Exception) { /* fall through */ }
            }

            // Strategy 2 (Android 6–10 / API 23–29):
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    val intent = Intent("android.intent.action.MANAGE_APP_PERMISSION").apply {
                        putExtra("android.intent.extra.PACKAGE_NAME", packageName)
                        putExtra(
                            "android.intent.extra.PERMISSION_GROUP_NAME",
                            "android.permission-group.LOCATION"
                        )
                    }
                    startActivity(intent)
                    return
                } catch (_: Exception) { /* fall through */ }
            }

            // Strategy 3 — final fallback: general app details page.
            startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:${packageName}")
                )
            )
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
            getSharedPreferences("tuktrack", MODE_PRIVATE).edit()
                .putBoolean("driver_was_online", true)
                .putLong("shift_start_ms", shiftStartMs)
                .apply()
            val intent = Intent(this@MainActivity, LocationForegroundService::class.java).apply {
                putExtra(LocationForegroundService.EXTRA_SHIFT_START, shiftStartMs)
            }
            ContextCompat.startForegroundService(this@MainActivity, intent)
        }

        @JavascriptInterface
        fun hideForegroundNotification() {
            getSharedPreferences("tuktrack", MODE_PRIVATE).edit()
                .putBoolean("driver_was_online", false)
                .apply()
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
