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
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*

/**
 * LocationForegroundService
 *
 * Runs as an Android Foreground Service — this means Android will NOT kill it
 * when the driver switches apps or locks the screen. It keeps GPS running and
 * sends location updates back to the WebView via evaluateJavascript().
 *
 * Started by AndroidBridge.showForegroundNotification() when driver goes ONLINE.
 * Stopped by AndroidBridge.hideForegroundNotification() when driver goes OFFLINE.
 */
class LocationForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID     = "tuktrack_online"
        private const val NOTIFICATION_ID = 1001
    }

    private lateinit var fusedClient: FusedLocationProviderClient
    private lateinit var locationCallback: LocationCallback

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        startLocationUpdates()
        return START_STICKY   // restart automatically if killed by system
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        fusedClient.removeLocationUpdates(locationCallback)
    }

    private fun buildNotification(): Notification {
        // Create channel if it doesn't exist yet
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "TukTrack Online Status",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

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
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(tapIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
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
                sendLocationToWebView(loc.latitude, loc.longitude, loc.accuracy)
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

    private fun sendLocationToWebView(lat: Double, lng: Double, accuracy: Float) {
        // Find the MainActivity's WebView and call the JS callback
        // This is the same callback the web side already listens to
        val js = "if(window.medianLocationUpdated){" +
            "window.medianLocationUpdated({latitude:$lat,longitude:$lng,accuracy:$accuracy});}"
        try {
            val activity = application as? android.app.Application
            // Post to main thread
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                try {
                    // Access the WebView through the bridge
                    val bridge = (applicationContext as? com.getcapacitor.BridgeActivity)
                    // Use broadcast instead — safer cross-component
                    val broadcastIntent = Intent("com.tuktrack.LOCATION_UPDATE").apply {
                        putExtra("lat", lat)
                        putExtra("lng", lng)
                        putExtra("accuracy", accuracy)
                        setPackage(packageName)
                    }
                    sendBroadcast(broadcastIntent)
                } catch (e: Exception) {}
            }
        } catch (e: Exception) {}
    }
}
