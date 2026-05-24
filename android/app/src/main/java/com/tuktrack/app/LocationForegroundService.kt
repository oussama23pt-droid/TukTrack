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

    // Receives JS broadcast to stop the service cleanly
    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ACTION_STOP) stopSelf()
        }
    }

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

        // PARTIAL_WAKE_LOCK — keeps CPU alive with screen off for up to 12 hours
        val pm = getSystemService(PowerManager::class.java)
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "TukTrack::LocationWakeLock"
        ).also { it.acquire(12 * 60 * 60 * 1000L) }

        // Register stop receiver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(stopReceiver, IntentFilter(ACTION_STOP), RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(stopReceiver, IntentFilter(ACTION_STOP))
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        shiftStartMs = intent?.getLongExtra(EXTRA_SHIFT_START, 0L) ?: 0L
        if (shiftStartMs == 0L) shiftStartMs = System.currentTimeMillis()

        // startForeground — the ONLY notification Android cannot let the user swipe away
        startForeground(NOTIFICATION_ID, buildNotification())
        startLocationUpdates()

        handler.removeCallbacks(timerRunnable)
        handler.post(timerRunnable)

        // START_STICKY — Android auto-restarts this service if killed by system
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App was swiped away from recents — restart ourselves immediately
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
        alarmMgr.set(android.app.AlarmManager.ELAPSED_REALTIME,
            android.os.SystemClock.elapsedRealtime() + 1000, pi)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(timerRunnable)
        try { fusedClient.removeLocationUpdates(locationCallback) } catch (_: Exception) {}
        try { wakeLock?.release() } catch (_: Exception) {}
        try { unregisterReceiver(stopReceiver) } catch (_: Exception) {}
    }

    private fun updateNotification() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIFICATION_ID, buildNotification())
    }

    private fun buildNotification(): Notification {
        val elapsed   = System.currentTimeMillis() - shiftStartMs
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
            // setOngoing(true) — driver CANNOT swipe this away, even with "Clear all"
            .setOngoing(true)
            .setSilent(true)
            .setSmallIcon(R.drawable.ic_stat_icon)
            .setColor(0xFFF59E0B.toInt())
            .setContentIntent(tapIntent)
            // PRIORITY_DEFAULT so it sits at the very top of the shade
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            // Live ticking clock shown next to the notification title
            .setUsesChronometer(true)
            .setChronometerCountDown(false)
            .setWhen(shiftStartMs)
            // Keep notification always in foreground category
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "TukTrack Online Status",
                // IMPORTANCE_DEFAULT — shows at top of shade, no sound
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Mostra enquanto o motorista partilha localização"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setSound(null, null)        // silent but visible
                enableVibration(false)
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
            // Keep updates even when app is in background
            setMaxUpdateDelayMillis(6000L)
        }.build()

        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                val loc: Location = result.lastLocation ?: return

                // Save last known location in SharedPreferences for BootReceiver
                getSharedPreferences("tuktrack", Context.MODE_PRIVATE).edit()
                    .putFloat("last_lat", loc.latitude.toFloat())
                    .putFloat("last_lng", loc.longitude.toFloat())
                    .putBoolean("driver_was_online", true)
                    .apply()

                // Broadcast to WebView so React can update Firestore
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
        } catch (e: SecurityException) {
            stopSelf()
        }
    }
}
