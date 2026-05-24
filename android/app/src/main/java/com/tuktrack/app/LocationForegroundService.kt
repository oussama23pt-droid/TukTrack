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
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * LocationForegroundService — "Always-on background engine"
 *
 * FIX NOTES (v1.3):
 *  - Channel ID changed to "tuktrack_gps_v2" so Android creates a FRESH channel at
 *    IMPORTANCE_LOW — it never downgrades an existing channel, so the old
 *    "tuktrack_online" (IMPORTANCE_DEFAULT) stays dismissable forever on Samsung.
 *  - setOngoing(true) + CATEGORY_SERVICE + FOREGROUND_SERVICE_IMMEDIATE = non-dismissable
 *  - onTaskRemoved uses setExactAndAllowWhileIdle (fires in Doze on Samsung)
 *  - GPS writes to Firestore directly via REST when WebView/JS are gone (app killed)
 */
class LocationForegroundService : Service() {

    companion object {
        // !! New channel ID — forces Android to create a fresh IMPORTANCE_LOW channel.
        // The old "tuktrack_online" channel (IMPORTANCE_DEFAULT) is cached by Android
        // and CANNOT be downgraded — it stays dismissable even if you change the code.
        const val CHANNEL_ID        = "tuktrack_gps_v2"
        const val NOTIFICATION_ID   = 1001
        const val EXTRA_SHIFT_START = "shift_start_epoch_ms"
        const val ACTION_STOP       = "com.tuktrack.STOP_SERVICE"

        private const val FIRESTORE_PROJECT = "tuktrack-19377"
        private const val FIRESTORE_BASE    =
            "https://firestore.googleapis.com/v1/projects/$FIRESTORE_PROJECT/databases/(default)/documents"
    }

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler        = Handler(Looper.getMainLooper())
    private var shiftStartMs: Long = 0L
    private var lastFirestoreWriteMs: Long = 0L

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

    // ── LIFECYCLE ──────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        // Create channel BEFORE startForeground()
        createChannel()

        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK, "TukTrack::LocationWakeLock"
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

        // Must call within 5 s — makes notification non-dismissable
        startForeground(NOTIFICATION_ID, buildNotification())
        startLocationUpdates()

        handler.removeCallbacks(timerRunnable)
        handler.post(timerRunnable)

        return START_STICKY
    }

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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmMgr.setExactAndAllowWhileIdle(
                android.app.AlarmManager.ELAPSED_REALTIME_WAKEUP,
                android.os.SystemClock.elapsedRealtime() + 1000,
                pi
            )
        } else {
            alarmMgr.set(
                android.app.AlarmManager.ELAPSED_REALTIME,
                android.os.SystemClock.elapsedRealtime() + 1000,
                pi
            )
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(timerRunnable)
        try { fusedClient.removeLocationUpdates(locationCallback) } catch (_: Exception) {}
        try { wakeLock?.let { if (it.isHeld) it.release() } } catch (_: Exception) {}
        try { unregisterReceiver(stopReceiver) } catch (_: Exception) {}
    }

    // ── GPS ────────────────────────────────────────────────────────────────────

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
                onNewLocation(loc)
            }
        }

        try {
            fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        } catch (e: SecurityException) {
            stopSelf()
        }
    }

    private fun onNewLocation(loc: Location) {
        val lat = loc.latitude
        val lng = loc.longitude
        val acc = loc.accuracy

        getSharedPreferences("tuktrack", Context.MODE_PRIVATE).edit()
            .putFloat("last_lat",  lat.toFloat())
            .putFloat("last_lng",  lng.toFloat())
            .putBoolean("driver_was_online", true)
            .apply()

        // 1. Broadcast to MainActivity (works when app is alive/backgrounded)
        sendBroadcast(Intent("com.tuktrack.LOCATION_UPDATE").apply {
            putExtra("lat",      lat)
            putExtra("lng",      lng)
            putExtra("accuracy", acc)
            setPackage(packageName)
        })

        // 2. Direct Firestore REST write (works when app is KILLED — no WebView needed)
        val now = System.currentTimeMillis()
        if (now - lastFirestoreWriteMs >= 5000) {
            lastFirestoreWriteMs = now
            val uid = getSharedPreferences("tuktrack", Context.MODE_PRIVATE)
                .getString("driver_uid", null)
            if (!uid.isNullOrBlank()) {
                writeLocationToFirestoreRest(uid, lat, lng, acc)
            }
        }
    }

    private fun writeLocationToFirestoreRest(uid: String, lat: Double, lng: Double, accuracy: Float) {
        Thread {
            try {
                val isoNow = isoTimestamp()
                val body = JSONObject().apply {
                    put("fields", JSONObject().apply {
                        put("currentLat",       JSONObject().put("doubleValue", lat))
                        put("currentLng",       JSONObject().put("doubleValue", lng))
                        put("locationAccuracy", JSONObject().put("doubleValue", accuracy.toDouble()))
                        put("lastUpdated",      JSONObject().put("timestampValue", isoNow))
                        put("location", JSONObject().put("mapValue", JSONObject().put("fields", JSONObject().apply {
                            put("lat",       JSONObject().put("doubleValue", lat))
                            put("lng",       JSONObject().put("doubleValue", lng))
                            put("updatedAt", JSONObject().put("stringValue",  isoNow))
                        })))
                    })
                }.toString()

                val url = URL(
                    "$FIRESTORE_BASE/users/$uid" +
                    "?updateMask.fieldPaths=currentLat" +
                    "&updateMask.fieldPaths=currentLng" +
                    "&updateMask.fieldPaths=locationAccuracy" +
                    "&updateMask.fieldPaths=lastUpdated" +
                    "&updateMask.fieldPaths=location"
                )
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod  = "PATCH"
                    connectTimeout = 10_000
                    readTimeout    = 10_000
                    doOutput       = true
                    setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                }
                OutputStreamWriter(conn.outputStream, "UTF-8").use { it.write(body) }
                val code = conn.responseCode
                if (code !in 200..299) {
                    val err = conn.errorStream?.bufferedReader()?.readText() ?: "unknown"
                    android.util.Log.w("TukTrack", "Firestore REST $code: $err")
                }
                conn.disconnect()
            } catch (e: Exception) {
                android.util.Log.e("TukTrack", "Firestore REST write failed", e)
            }
        }.start()
    }

    private fun isoTimestamp(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    // ── NOTIFICATION ───────────────────────────────────────────────────────────

    private fun buildNotification(): Notification {
        val elapsed   = (System.currentTimeMillis() - shiftStartMs).coerceAtLeast(0)
        val totalSecs = elapsed / 1000
        val h = totalSecs / 3600
        val m = (totalSecs % 3600) / 60
        val s = totalSecs % 60
        val timer = if (h > 0) String.format("%d:%02d:%02d", h, m, s)
                    else       String.format("%02d:%02d", m, s)

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
            .setColor(0xFF10B981.toInt())
            .setContentIntent(tapIntent)
            .setOngoing(true)           // non-dismissable
            .setSilent(true)            // no sound/vibration
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
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
            val nm = getSystemService(NotificationManager::class.java)

            // Delete the old DEFAULT-importance channel so Samsung can't keep showing
            // it as dismissable. The new V2 channel is IMPORTANCE_LOW.
            try { nm.deleteNotificationChannel("tuktrack_online") } catch (_: Exception) {}

            val ch = NotificationChannel(
                CHANNEL_ID,
                "TukTrack GPS Ativo",
                // IMPORTANCE_LOW = shows in status bar, sticky, NO sound, non-dismissable
                // on stock Android. Samsung One UI also respects this for foreground services.
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description          = "Mostra enquanto o motorista partilha localização"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setSound(null, null)
                enableVibration(false)
            }
            nm.createNotificationChannel(ch)
        }
    }
}
