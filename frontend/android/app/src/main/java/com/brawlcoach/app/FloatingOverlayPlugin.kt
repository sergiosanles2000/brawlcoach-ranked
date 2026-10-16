package com.brawlcoach.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "FloatingOverlay")
class FloatingOverlayPlugin : Plugin() {

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val context = context ?: run {
            call.reject("Contexto no disponible")
            return
        }
        val hasPermission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }
        val ret = JSObject().apply {
            put("hasPermission", hasPermission)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Actividad no disponible")
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(activity)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + activity.packageName)
                )
                activity.startActivity(intent)
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun startOverlay(call: PluginCall) {
        val context = context ?: run {
            call.reject("Contexto no disponible")
            return
        }
        val activity = activity ?: run {
            call.reject("Actividad no disponible")
            return
        }

        val brawlersJson = call.getString("brawlersJson", "[]") ?: "[]"
        val countersJson = call.getString("countersJson", "{}") ?: "{}"
        val mapsJson = call.getString("mapsJson", "[]") ?: "[]"
        val brawlPickJson = call.getString("brawlPickJson", "{}") ?: "{}"
        val currentMapId = call.getString("currentMapId", "") ?: ""
        val apiKey = call.getString("apiKey", "") ?: ""
        val model = call.getString("model", "gemma-4-31b-it") ?: "gemma-4-31b-it"
        val playerProfileJson = call.getString("playerProfileJson", null)

        FloatingOverlayService.setConfig(
            brawlers = brawlersJson,
            counters = countersJson,
            maps = mapsJson,
            brawlPick = brawlPickJson,
            currentMap = currentMapId,
            apiKey = apiKey,
            model = model,
            playerProfile = playerProfileJson
        )

        val serviceIntent = Intent(context, FloatingOverlayService::class.java).apply {
            action = FloatingOverlayService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        // Send app to background so Brawl Stars is immediately visible to user
        activity.moveTaskToBack(true)

        val ret = JSObject().apply {
            put("success", true)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun stopOverlay(call: PluginCall) {
        val context = context ?: run {
            call.reject("Contexto no disponible")
            return
        }
        val serviceIntent = Intent(context, FloatingOverlayService::class.java).apply {
            action = FloatingOverlayService.ACTION_STOP
        }
        context.startService(serviceIntent)
        val ret = JSObject().apply {
            put("success", true)
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun isOverlayRunning(call: PluginCall) {
        val ret = JSObject().apply {
            put("isRunning", FloatingOverlayService.isRunning)
        }
        call.resolve(ret)
    }
}
