package com.brawlcoach.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream

@CapacitorPlugin(name = "ScreenCapture")
class ScreenCapturePlugin : Plugin() {

    @PluginMethod
    fun captureScreen(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Actividad no disponible")
            return
        }

        // On Android 14+, each capture requires an explicit fresh intent token to prevent single-use token exceptions
        val projectionManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val captureIntent = projectionManager.createScreenCaptureIntent()
        startActivityForResult(call, captureIntent, "handleCaptureResult")
    }

    @ActivityCallback
    private fun handleCaptureResult(call: PluginCall, result: ActivityResult) {
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            executeCapture(call, result.resultCode, result.data!!)
        } else {
            call.reject("Permiso de captura de pantalla denegado por el usuario")
        }
    }

    private fun executeCapture(call: PluginCall, resultCode: Int, resultData: Intent) {
        val context = context ?: run {
            call.reject("Contexto no disponible")
            return
        }
        val activity = activity ?: run {
            call.reject("Actividad no disponible")
            return
        }

        // Start Foreground Service (Required for Android 10+ and 14+)
        val serviceIntent = Intent(context, MediaProjectionService::class.java).apply {
            action = MediaProjectionService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }

        // Delay to ensure the foreground service is active before acquiring projection
        Handler(Looper.getMainLooper()).postDelayed({
            try {
                val projectionManager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                val mediaProjection: MediaProjection = projectionManager.getMediaProjection(
                    resultCode,
                    resultData.clone() as Intent
                ) ?: run {
                    stopCaptureService(context)
                    call.reject("No se pudo obtener MediaProjection")
                    return@postDelayed
                }

                val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
                val metrics = DisplayMetrics()
                @Suppress("DEPRECATION")
                windowManager.defaultDisplay.getRealMetrics(metrics)

                val screenWidth = metrics.widthPixels
                val screenHeight = metrics.heightPixels
                val screenDensity = metrics.densityDpi

                val handlerThread = HandlerThread("BrawlScreenCaptureThread")
                handlerThread.start()
                val backgroundHandler = Handler(handlerThread.looper)

                val imageReader = ImageReader.newInstance(
                    screenWidth,
                    screenHeight,
                    PixelFormat.RGBA_8888,
                    2
                )

                var virtualDisplay: VirtualDisplay? = null
                var hasCaptured = false

                val cleanup = {
                    try {
                        virtualDisplay?.release()
                        virtualDisplay = null
                        imageReader.close()
                        mediaProjection.stop()
                        handlerThread.quitSafely()
                        stopCaptureService(context)
                    } catch (_: Exception) {}
                }

                // 1. REQUISITO ANDROID 14+: Registrar callback OBLIGATORIAMENTE antes de createVirtualDisplay
                mediaProjection.registerCallback(object : MediaProjection.Callback() {
                    override fun onStop() {
                        super.onStop()
                        try {
                            virtualDisplay?.release()
                            virtualDisplay = null
                        } catch (_: Exception) {}
                    }
                }, Handler(Looper.getMainLooper()))

                imageReader.setOnImageAvailableListener({ reader ->
                    if (hasCaptured) return@setOnImageAvailableListener
                    hasCaptured = true

                    val image = reader.acquireLatestImage()
                    if (image != null) {
                        try {
                            val planes = image.planes
                            val buffer = planes[0].buffer
                            val pixelStride = planes[0].pixelStride
                            val rowStride = planes[0].rowStride
                            val rowPadding = rowStride - pixelStride * screenWidth

                            val rawBitmap = Bitmap.createBitmap(
                                screenWidth + rowPadding / pixelStride,
                                screenHeight,
                                Bitmap.Config.ARGB_8888
                            )
                            rawBitmap.copyPixelsFromBuffer(buffer)
                            image.close()

                            val croppedBitmap = if (rowPadding > 0) {
                                Bitmap.createBitmap(rawBitmap, 0, 0, screenWidth, screenHeight)
                            } else {
                                rawBitmap
                            }

                            // Downscale for fast transmission to AI (max width 1280px)
                            val targetBitmap = if (screenWidth > 1280) {
                                val targetHeight = (screenHeight * 1280) / screenWidth
                                Bitmap.createScaledBitmap(croppedBitmap, 1280, targetHeight, true)
                            } else {
                                croppedBitmap
                            }

                            val outputStream = ByteArrayOutputStream()
                            targetBitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)
                            val base64Bytes = outputStream.toByteArray()
                            val base64String = Base64.encodeToString(base64Bytes, Base64.NO_WRAP)

                            cleanup()

                            val resultObj = JSObject().apply {
                                put("base64", "data:image/jpeg;base64,$base64String")
                            }
                            call.resolve(resultObj)
                        } catch (ex: Exception) {
                            cleanup()
                            call.reject("Error al procesar el fotograma: ${ex.message}")
                        }
                    } else {
                        cleanup()
                        call.reject("No se pudo obtener imagen del lector")
                    }
                }, backgroundHandler)

                // 2. Crear VirtualDisplay DESPUÉS de haber registrado el callback
                virtualDisplay = mediaProjection.createVirtualDisplay(
                    "BrawlScreenCapture",
                    screenWidth,
                    screenHeight,
                    screenDensity,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    imageReader.surface,
                    null,
                    backgroundHandler
                )

                // Timeout fallback if listener doesn't trigger within 3.5 seconds
                Handler(Looper.getMainLooper()).postDelayed({
                    if (!hasCaptured) {
                        hasCaptured = true
                        cleanup()
                        call.reject("Tiempo de espera agotado al capturar pantalla")
                    }
                }, 3500)

            } catch (e: Exception) {
                stopCaptureService(context)
                call.reject("Error en captura nativa: ${e.message}")
            }
        }, 120)
    }

    private fun stopCaptureService(context: Context) {
        try {
            val stopIntent = Intent(context, MediaProjectionService::class.java).apply {
                action = MediaProjectionService.ACTION_STOP
            }
            context.startService(stopIntent)
        } catch (_: Exception) {}
    }
}
