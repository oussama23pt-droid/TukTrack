package com.tuktrack.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*

/**
 * LocationForegroundService
 *
 * Architecture role: "Always-on background engine"
 * ─────────────────────────────────────────────────
 * • Runs as an Android Foreground Service → Android will NOT kill it
 * • Holds a PARTIAL_WAKE_LOCK → CPU stays on with screen off
 * • GPS updates every 4 seconds via FusedLocationProviderClient
 * • Broadcasts coords to MainActivity → forwarded to WebView → Firestore
 * • Notification is setOngoing(true) → cannot be swiped away, ever
 * • onTaskRemoved → reschedules self via AlarmManager if swiped from recents
 * • START_STICKY → Android auto-restarts if killed under memory pressure
 */
class LocationForegroundService : Service() {

    companion object {
        const val CHANNEL_ID        = "tuktrack_online"
        const val NOTIFICATION_ID   = 1001
        const val EXTRA_SHIFT_START = "shift_start_epoch_ms"
        const val ACTION_STOP       = "com.tuktrack.STOP_SERVICE"
    }

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private var shiftStartMs: Long = 0L
    private var lastKnownLat: Double = 0.0
    private var lastKnownLng: Double = 0.0

    // JS can send ACTION_STOP broadcast to cleanly stop the service
    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ACTION_STOP) stopSelf()
        }
    }

    // Ticks every second to keep the elapsed timer in the notification live
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

        // PARTIAL_WAKE_LOCK: keeps CPU running with screen off — up to 12 hours
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "TukTrack::LocationWakeLock"
        ).also { it.acquire(12 * 60 * 60 * 1000L) }

        val filter = IntentFilter(ACTION_STOP)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(stopReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(stopReceiver, filter)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        shiftStartMs = intent?.getLongExtra(EXTRA_SHIFT_START, 0L) ?: 0L
        if (shiftStartMs == 0L) shiftStartMs = System.currentTimeMillis()

        // startForeground() is what makes the notification non-dismissable.
        // This MUST be called within 5 seconds of starting the service.
        startForeground(NOTIFICATION_ID, buildNotification())
        startLocationUpdates()

        handler.removeCallbacks(timerRunnable)
        handler.post(timerRunnable)

        // START_STICKY: if Android kills us under memory pressure, restart with
        // the last intent so shiftStartMs is preserved.
        return START_STICKY
    }

    // If the driver swipes the app from recents, reschedule ourselves via AlarmManager
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        val restart = Intent(applicationContext, LocationForegroundService::class.java).apply {
            putExtra(EXTRA_SHIFT_START, shiftStartMs)
            setPackage(packageName)
        }
        val pi = PendingIntent.getService(
            this, 1, restart,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )
        val alarmMgr = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
        alarmMgr.set(
            android.app.AlarmManager.ELAPSED_REALTIME,
            android.os.SystemClock.elapsedRealtime() + 1000,
            pi
        )
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(timerRunnable)
        try { fusedClient.removeLocationUpdates(locationCallback) } catch (_: Exception) {}
        try { wakeLock?.let { if (it.isHeld) it.release() } } catch (_: Exception) {}
        try { unregisterReceiver(stopReceiver) } catch (_: Exception) {}
    }

    // ── NOTIFICATION ───────────────────────────────────────────────────────────
    private fun buildNotification(): Notification {
        val elapsed   = (System.currentTimeMillis() - shiftStartMs).coerceAtLeast(0)
        val totalSecs = elapsed / 1000
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
            // Title shows green dot + app name + elapsed time
            .setContentTitle("🟢 TukTrack — Em Serviço  •  $timer")
            .setContentText("A partilhar localização em tempo real. Toque para abrir.")
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setColor(0xFF10B981.toInt())           // green accent
            .setContentIntent(tapIntent)
            // ── These two lines make it non-dismissable ──
            .setOngoing(true)                        // cannot be swiped
            .setSilent(true)                         // no sound/vibration
            // ─────────────────────────────────────────────
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            // Live elapsed clock shown in the notification header
            .setUsesChronometer(true)
            .setChronometerCountDown(false)
            .setWhen(shiftStartMs)
            .setShowWhen(true)
            .build()
    }

    private fun updateNotification() {
        try {
            getSystemService(NotificationManager::class.java)
                .notify(NOTIFICATION_ID, buildNotification())
        } catch (_: Exception) {}
    }

    // ── NOTIFICATION CHANNEL ───────────────────────────────────────────────────
    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "TukTrack Online Status",
                // IMPORTANCE_DEFAULT: visible at top, no sound
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Mostra enquanto o motorista partilha localização"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setSound(null, null)
                enableVibration(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    // ── GPS UPDATES ────────────────────────────────────────────────────────────
    private fun startLocationUpdates() {
        val request = LocationRequest.Builder(
            Priority.PRIORITY_HIGH_ACCURACY, 4000L
        ).apply {
            setMinUpdateIntervalMillis(3000L)
            setWaitForAccurateLocation(false)
            setMaxUpdateDelayMillis(6000L)
        }.build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc: Location = result.lastLocation ?: return
                lastKnownLat = loc.latitude
                lastKnownLng = loc.longitude

                // Persist so BootReceiver can report last known position after reboot
                getSharedPreferences("tuktrack", Context.MODE_PRIVATE).edit()
                    .putFloat("last_lat", loc.latitude.toFloat())
                    .putFloat("last_lng", loc.longitude.toFloat())
                    .putBoolean("driver_was_online", true)
                    .apply()

                // Send to MainActivity → WebView → Firestore via 'nativeLocationUpdate' event
                sendBroadcast(Intent("com.tuktrack.LOCATION_UPDATE").apply {
                    putExtra("lat",      loc.latitude)
                    putExtra("lng",      loc.longitude)
                    putExtra("accuracy", loc.accuracy)
                    setPackage(packageName)
                })
            }
        }

        try {
            fusedClient.requestLocationUpdates(
                request, locationCallback, Looper.getMainLooper()
            )
        } catch (e: SecurityException) {
            stopSelf()
        }
    }
}
