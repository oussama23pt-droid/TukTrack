package com.tuktrack.app

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * TukTrackFirebaseService
 *
 * Receives FCM push notifications even when the app is completely closed.
 * This handles:
 *   - SOS alerts from drivers
 *   - Shift start/end notifications
 *   - GPS warning alerts
 *   - Manager messages to drivers
 *
 * To send a push from your app, use the Firebase Admin SDK or
 * call the Firebase Cloud Messaging REST API from your backend/functions.
 */
class TukTrackFirebaseService : FirebaseMessagingService() {

    companion object {
        private const val CHANNEL_ALERTS = "tuktrack_alerts"
        private var notifCounter = 100
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // TODO: send this token to Firestore so you can target this device
        // Example: save to users/{uid}/fcmToken in Firestore
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val title   = message.notification?.title ?: message.data["title"] ?: "TukTrack"
        val body    = message.notification?.body  ?: message.data["body"]  ?: ""
        val type    = message.data["type"] ?: "alert"

        val icon = when (type) {
            "sos"   -> android.R.drawable.ic_dialog_alert
            "gps"   -> android.R.drawable.ic_menu_mylocation
            "shift" -> android.R.drawable.ic_menu_recent_history
            else    -> android.R.drawable.ic_dialog_info
        }

        val tapIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("notification_type", type)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, CHANNEL_ALERTS)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setSmallIcon(icon)
            .setContentIntent(tapIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build()

        try {
            NotificationManagerCompat.from(this).notify(notifCounter++, notification)
        } catch (e: SecurityException) {}
    }
}
