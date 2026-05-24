package com.tuktrack.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * BootReceiver
 * Restarts the LocationForegroundService after phone reboot if the driver was online.
 * The online flag is written to SharedPreferences by AndroidBridge.showForegroundNotification()
 * and cleared by AndroidBridge.hideForegroundNotification().
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != "android.intent.action.QUICKBOOT_POWERON" &&
            action != "com.htc.intent.action.QUICKBOOT_POWERON") return

        val prefs = context.getSharedPreferences("tuktrack", Context.MODE_PRIVATE)
        val wasOnline = prefs.getBoolean("driver_was_online", false)
        if (!wasOnline) return

        val shiftStartMs = prefs.getLong("shift_start_ms", System.currentTimeMillis())

        val svcIntent = Intent(context, LocationForegroundService::class.java).apply {
            putExtra(LocationForegroundService.EXTRA_SHIFT_START, shiftStartMs)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(svcIntent)
        } else {
            context.startService(svcIntent)
        }
    }
}
