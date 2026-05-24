package com.tuktrack.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*

class LocationForegroundService : Service() {

    companion object {
        const val CHANNEL_ID      = "tuktrack_online"
        const val NOTIFICATION_ID = 1001
        const val EXTRA_SHIFT_START = "shift_start_epoch_ms"
    }

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private var wakeLock: PowerManager.WakeLock? = null

    // Timer that updates the notification every second
    private val handler = Handler(Looper.getMainLooper())
    private var shiftStartMs: Long = 0L

    private val timerRunnable = object : Runnable {
        override fun run() {
            updateNotification()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        createChannel()

        // WakeLock: keeps CPU alive even when screen is off
        val pm = getSystemService(PowerManager::class.java)
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "TukTrack::LocationWakeLock"
        ).also { it.acquire(12 * 60 * 60 * 1000L) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Receive shift start time from JS (milliseconds since epoch)
        shiftStartMs = intent?.getLongExtra(EXTRA_SHIFT_START, 0L) ?: 0L
        if (shiftStartMs == 0L) shiftStartMs = System.currentTimeMillis()

        // THIS is the key — startForeground() posts a notification that
        // Android NEVER lets the user dismiss, not even with "Clear all"
        startForeground(NOTIFICATION_ID, buildNotification())
        startLocationUpdates()

        // Start live timer — updates notification every second
        handler.removeCallbacks(timerRunnable)
        handler.post(timerRunnable)

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(timerRunnable)
        try { fusedClient.removeLocationUpdates(locationCallback) } catch (e: Exception) {}
        try { wakeLock?.release() } catch (e: Exception) {}
    }

    // Called every second by timerRunnable to refresh the elapsed time
    private fun updateNotification() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val elapsed = System.currentTimeMillis() - shiftStartMs
        val totalSecs = (elapsed / 1000).coerceAtLeast(0)
        val h = totalSecs / 3600
        val m = (totalSecs % 3600) / 60
        val s = totalSecs % 60
        val timer = if (h > 0)
            String.format("%d:%02d:%02d", h, m, s)
        else
            String.format("%02d:%02d", m, s)

        val tapIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🟢 TukTrack — Em Serviço  •  $timer")
            .setContentText("A partilhar localização em tempo real. Toque para abrir.")
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setColor(0xFFF59E0B.toInt())
            .setContentIntent(tapIntent)
            .setOngoing(true)           // non-dismissable flag
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            // UsesChronometer makes Android show a live ticking clock in the notification
            .setUsesChronometer(true)
            .setChronometerCountDown(false)
            .setWhen(shiftStartMs)
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
                // IMPORTANT: disabling user ability to turn off this channel
                // prevents the driver from accidentally hiding it
                setBlockable(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY, 4000L
        ).apply {
            setMinUpdateIntervalMillis(3000L)
            setWaitForAccurateLocation(false)
        }.build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc: Location = result.lastLocation ?: return
                sendBroadcast(Intent("com.tuktrack.LOCATION_UPDATE").apply {
                    putExtra("lat", loc.latitude)
                    putExtra("lng", loc.longitude)
                    putExtra("accuracy", loc.accuracy)
                    setPackage(packageName)
                })
            }
        }

        try {
            fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        } catch (e: SecurityException) { stopSelf() }
    }
}
