package com.tuktrack.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*

/**
 * LocationForegroundService
 *
 * An Android Foreground Service — the only way to:
 *   1. Show a notification the USER CANNOT DISMISS (when tied to startForeground).
 *   2. Keep the app process permanently awake in the background.
 *   3. Keep GPS running when the driver switches apps or locks the screen.
 *
 * Key facts about foreground service notifications:
 *   - They are posted via startForeground(id, notification) — NOT NotificationManager.notify().
 *   - Android NEVER allows the user to dismiss a notification posted by startForeground().
 *   - The "Clear all" button in the notification panel skips them entirely.
 *   - They disappear ONLY when the service is stopped (driver goes offline).
 */
class LocationForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID      = "tuktrack_online"
        private const val NOTIFICATION_ID = 1001  // must match the ID used in startForeground
    }

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)

        // WakeLock: prevents the CPU from sleeping so Firebase listeners and
        // GPS updates keep running even when the screen is off.
        val pm = getSystemService(PowerManager::class.java)
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "TukTrack::LocationWakeLock"
        ).also { it.acquire(12 * 60 * 60 * 1000L) } // max 12 hours per shift
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        createChannel()
        // startForeground() is what makes the notification non-dismissable.
        // This is fundamentally different from NotificationManager.notify().
        startForeground(NOTIFICATION_ID, buildNotification())
        startLocationUpdates()
        // START_STICKY: if Android kills this service due to memory pressure,
        // it will be automatically restarted — driver stays online.
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        if (::locationCallback.isInitialized) {
            fusedClient.removeLocationUpdates(locationCallback)
        }
        // Release WakeLock when driver goes offline
        try { wakeLock?.release() } catch (e: Exception) {}
    }

    private fun buildNotification(): Notification {
        val tapIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🟢 TukTrack — Online")
            .setContentText("A partilhar localização em tempo real. Toque para abrir.")
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setColor(0xFFF59E0B.toInt())
            .setContentIntent(tapIntent)
            .setOngoing(true)       // reinforces non-dismissable intent
            .setSilent(true)        // no sound — status bar only
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "TukTrack Online Status",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY, 5000L
        ).apply {
            setMinUpdateIntervalMillis(3000L)
            setWaitForAccurateLocation(false)
        }.build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc: Location = result.lastLocation ?: return
                broadcastLocation(loc.latitude, loc.longitude, loc.accuracy)
            }
        }

        try {
            fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            stopSelf()
        }
    }

    private fun broadcastLocation(lat: Double, lng: Double, accuracy: Float) {
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            try {
                sendBroadcast(Intent("com.tuktrack.LOCATION_UPDATE").apply {
                    putExtra("lat", lat)
                    putExtra("lng", lng)
                    putExtra("accuracy", accuracy)
                    setPackage(packageName)
                })
            } catch (e: Exception) {}
        }
    }
}
