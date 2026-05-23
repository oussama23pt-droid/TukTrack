package com.tuktrack.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * ForegroundLocationService
 *
 * A true Android Foreground Service. When started, it posts a persistent,
 * non-dismissable notification in the status bar and keeps the app process
 * alive even when the driver switches to another app or locks the phone.
 *
 * The actual GPS tracking is handled by the Capacitor BackgroundGeolocation
 * plugin in the JS layer — this service's sole job is to:
 *   1. Show the sticky "Em Serviço" notification so Android won't kill the app.
 *   2. Keep the process alive as a foreground service.
 *
 * Started by MainActivity via AndroidBridge.startForegroundService()
 * Stopped by MainActivity via AndroidBridge.stopForegroundService()
 */
class ForegroundLocationService : Service() {

    companion object {
        const val CHANNEL_ID   = "tuktrack_foreground"
        const val NOTIF_ID     = 9001
        const val ACTION_START = "START"
        const val ACTION_STOP  = "STOP"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                createNotificationChannel()
                startForeground(NOTIF_ID, buildNotification())
            }
        }
        // START_STICKY: if Android kills the service under memory pressure,
        // it will restart it automatically — keeping the driver "online".
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        // Tapping the notification reopens the app
        val openAppIntent = packageManager
            .getLaunchIntentForPackage(packageName)
            ?.apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP }

        val pendingIntent = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🟢 TukTrack — Em Serviço")
            .setContentText("A partilhar localização em segundo plano.")
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setColor(0xFFF59E0B.toInt())          // amber brand colour
            .setContentIntent(pendingIntent)
            .setOngoing(true)                       // cannot be swiped away
            .setSilent(true)                        // no sound/vibration
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setForegroundServiceBehavior(
                NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE
            )
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "TukTrack Serviço Ativo",
                NotificationManager.IMPORTANCE_LOW   // LOW = no sound, shows in bar
            ).apply {
                description = "Notificação persistente enquanto o motorista está online"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }
}
