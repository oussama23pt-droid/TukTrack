package com.tuktrack.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * BootReceiver
 * Starts the app silently after phone reboot if the driver was online.
 * Reads a SharedPreference flag set by the JS side.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = context.getSharedPreferences("tuktrack", Context.MODE_PRIVATE)
        val wasOnline = prefs.getBoolean("driver_was_online", false)
        if (wasOnline) {
            val svcIntent = Intent(context, LocationForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svcIntent)
            } else {
                context.startService(svcIntent)
            }
        }
    }
}
