package com.tuktrack.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    companion object {
        private const val REQUEST_FINE_LOCATION       = 1000
        private const val REQUEST_BACKGROUND_LOCATION = 1001
        private const val REQUEST_NOTIFICATION        = 1002
        private const val CHANNEL_ID                  = "tuktrack_online"
        private const val NOTIFICATION_ID             = 1001
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        createNotificationChannel()
    }

    override fun onStart() {
        super.onStart()
        injectBridge()
    }

    // ── Create the notification channel (required Android 8+) ────────────────
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "TukTrack Online Status",
                NotificationManager.IMPORTANCE_LOW  // no sound, shows in bar
            ).apply {
                description = "Shows when the driver is actively sharing location"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    // ── Inject AndroidBridge after every page load ────────────────────────────
    private fun injectBridge() {
        try {
            val webView: WebView = bridge.webView
            webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

            val originalClient = webView.webViewClient
            webView.webViewClient = object : android.webkit.WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    view?.addJavascriptInterface(AndroidBridge(), "AndroidBridge")
                    view?.evaluateJavascript(
                        "window.__ANDROID_BRIDGE_READY__ = true; " +
                        "window.dispatchEvent(new Event('androidBridgeReady'));",
                        null
                    )
                }
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: android.webkit.WebResourceRequest?
                ): Boolean {
                    return originalClient?.shouldOverrideUrlLoading(view, request) ?: false
                }
            }
        } catch (e: Exception) {
            // Bridge not ready yet
        }
    }

    inner class AndroidBridge {

        // ── 1. PERSISTENT STATUS BAR NOTIFICATION ────────────────────────────────
        // Called by JS when driver goes ONLINE.
        // Shows an ongoing notification (cannot be swiped away).
        // Tapping it brings driver back to the app.
        @JavascriptInterface
        fun showForegroundNotification(title: String, message: String) {
            // Android 13+ requires POST_NOTIFICATIONS permission at runtime
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                        REQUEST_NOTIFICATION
                    )
                    // Try again after a short delay to allow the user to grant
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        showForegroundNotification(title, message)
                    }, 3000)
                    return
                }
            }

            // Tap notification → open/focus the app
            val intent = Intent(this@MainActivity, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                this@MainActivity, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this@MainActivity, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pendingIntent)
                .setOngoing(true)           // cannot be swiped away while online
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build()

            try {
                NotificationManagerCompat.from(this@MainActivity)
                    .notify(NOTIFICATION_ID, notification)
            } catch (e: SecurityException) {
                // Permission not granted yet — will retry after user grants
            }
        }

        // Called by JS when driver goes OFFLINE — removes the notification
        @JavascriptInterface
        fun hideForegroundNotification() {
            NotificationManagerCompat.from(this@MainActivity).cancel(NOTIFICATION_ID)
        }

        // ── 2. "Display over other apps" ─────────────────────────────────────────
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
            } else true
        }

        // ── 3. Background location ("Allow all the time") ────────────────────────
        @JavascriptInterface
        fun requestBackgroundLocation(): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true

            val fineGranted = ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION
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
                this@MainActivity, Manifest.permission.ACCESS_BACKGROUND_LOCATION
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
                this@MainActivity, Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }

        // ── 4. Open app settings pages ────────────────────────────────────────────
        @JavascriptInterface
        fun openLocationSettings() {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")
            )
            startActivity(intent)
        }

        @JavascriptInterface
        fun openAppSettings() {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${packageName}")
            )
            startActivity(intent)
        }
    }
}
