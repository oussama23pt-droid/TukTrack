package com.tuktrack.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * TukTrackFirebaseService
 *
 * Handles incoming FCM push notifications.
 * Shows a heads-up / alerting push notification for every message received,
 * even when the app is in the background or killed.
 *
 * Channel "tuktrack_alerts" — IMPORTANCE_HIGH → shows as heads-up banner,
 * plays default sound, and appears in the notification shade.
 *
 * SETUP (already done if google-services.json is present):
 *   android/app/build.gradle  → apply plugin: 'com.google.gms.google-services'
 *                             → implementation 'com.google.firebase:firebase-messaging-ktx'
 *   android/build.gradle      → classpath 'com.google.gms:google-services:4.4.1'
 */
class TukTrackFirebaseService : FirebaseMessagingService() {

    companion object {
        const val ALERTS_CHANNEL_ID   = "tuktrack_alerts"
        const val ALERTS_CHANNEL_NAME = "TukTrack Alertas"

        private const val FIRESTORE_PROJECT = "tuktrack-19377"
        private const val FIRESTORE_BASE =
            "https://firestore.googleapis.com/v1/projects/$FIRESTORE_PROJECT/databases/(default)/documents"
    }

    // ── FCM token refresh ──────────────────────────────────────────────────────

    /**
     * Called whenever FCM issues a new registration token.
     * We persist it to SharedPreferences so MainActivity/AndroidBridge can
     * read it, and also push it straight to Firestore via REST so Firebase
     * Functions can always reach this device.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Cache locally so JS can read it via AndroidBridge.getFcmToken()
        getSharedPreferences("tuktrack", MODE_PRIVATE)
            .edit()
            .putString("fcm_token", token)
            .apply()

        // Push to Firestore if we know the driver UID
        val uid = getSharedPreferences("tuktrack", MODE_PRIVATE)
            .getString("driver_uid", null)
        if (!uid.isNullOrBlank()) {
            updateFcmTokenInFirestore(uid, token)
        }
    }

    // ── Incoming message ───────────────────────────────────────────────────────

    /**
     * Called for EVERY incoming FCM message while the app is in foreground.
     * For background / killed state Android delivers the notification
     * automatically from the FCM payload's `notification` block — but we
     * also handle the `data`-only payloads here so alerts always show.
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val title = remoteMessage.notification?.title
            ?: remoteMessage.data["title"]
            ?: "TukTrack"
        val body = remoteMessage.notification?.body
            ?: remoteMessage.data["body"]
            ?: remoteMessage.data["message"]
            ?: ""

        showPushNotification(title, body)
    }

    // ── Notification builder ───────────────────────────────────────────────────

    /**
     * Displays a standard push notification (heads-up on Android 8+).
     * Uses IMPORTANCE_HIGH channel so it pops up even when the app is open.
     * This is the same method exposed as showAlertNotification via AndroidBridge
     * so JS can also trigger it directly.
     */
    fun showPushNotification(title: String, body: String, notifId: Int = generateId()) {
        ensureAlertsChannel()

        val tapIntent = PendingIntent.getActivity(
            this, notifId,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, ALERTS_CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setColor(0xFFF59E0B.toInt())           // TukTrack amber
            .setContentIntent(tapIntent)
            .setAutoCancel(true)                    // dismissed when tapped
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)  // sound + vibrate
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()

        getSystemService(NotificationManager::class.java)
            .notify(notifId, notification)
    }

    // ── Channel ────────────────────────────────────────────────────────────────

    private fun ensureAlertsChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(ALERTS_CHANNEL_ID) != null) return

        val ch = NotificationChannel(
            ALERTS_CHANNEL_ID,
            ALERTS_CHANNEL_NAME,
            NotificationManager.IMPORTANCE_HIGH          // heads-up banner
        ).apply {
            description = "Alertas do TukTrack: turnos, mensagens, SOS"
            enableVibration(true)
            enableLights(true)
            setShowBadge(true)
        }
        nm.createNotificationChannel(ch)
    }

    // ── Firestore REST token update ────────────────────────────────────────────

    private fun updateFcmTokenInFirestore(uid: String, token: String) {
        Thread {
            try {
                val body = JSONObject().apply {
                    put("fields", JSONObject().apply {
                        put("fcmToken", JSONObject().put("stringValue", token))
                    })
                }.toString()

                val url = URL(
                    "$FIRESTORE_BASE/users/$uid?updateMask.fieldPaths=fcmToken"
                )
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod  = "PATCH"
                    connectTimeout = 10_000
                    readTimeout    = 10_000
                    doOutput       = true
                    setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                }
                OutputStreamWriter(conn.outputStream, "UTF-8").use { it.write(body) }
                conn.responseCode  // trigger request
                conn.disconnect()
            } catch (e: Exception) {
                android.util.Log.e("TukTrack", "FCM token Firestore update failed", e)
            }
        }.start()
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private fun generateId(): Int =
        2000 + (System.currentTimeMillis() % 6000).toInt()
}
