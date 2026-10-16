package com.brawlcoach.app

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class FloatingOverlayService : Service() {

    companion object {
        const val CHANNEL_ID = "brawl_floating_overlay_channel"
        const val NOTIFICATION_ID = 9902
        const val ACTION_START = "ACTION_START_OVERLAY"
        const val ACTION_STOP = "ACTION_STOP_OVERLAY"

        var isRunning = false
            private set

        private var instance: FloatingOverlayService? = null

        // Cache granted MediaProjection permission so subsequent scans don't prompt dialog repeatedly
        // Shared data passed from React/Capacitor
        private var brawlersJsonStr = "[]"
        private var countersJsonStr = "{}"
        private var mapsJsonStr = "[]"
        private var brawlPickJsonStr = "{}"
        private var currentMapIdStr = ""
        private var apiKeyStr = ""
        private var modelStr = "gemini-3.5-flash-lite"
        private var playerProfileJsonStr: String? = null

        fun setConfig(
            brawlers: String,
            counters: String,
            maps: String,
            brawlPick: String = "{}",
            currentMap: String,
            apiKey: String,
            model: String,
            playerProfile: String?
        ) {
            brawlersJsonStr = brawlers
            countersJsonStr = counters
            mapsJsonStr = maps
            if (brawlPick.isNotBlank()) brawlPickJsonStr = brawlPick
            currentMapIdStr = currentMap
            if (apiKey.isNotBlank()) apiKeyStr = apiKey
            if (model.isNotBlank()) modelStr = model
            playerProfileJsonStr = playerProfile
        }

        fun onScreenCapturePermissionGranted(resultCode: Int, data: Intent) {
            instance?.executeScreenCapture(resultCode, data)
        }

        fun onScreenCapturePermissionDenied() {
            instance?.handleCaptureDenied()
        }
    }

    private var windowManager: WindowManager? = null
    private var bubbleView: View? = null
    private var cardView: View? = null

    private lateinit var bubbleParams: WindowManager.LayoutParams
    private lateinit var cardParams: WindowManager.LayoutParams

    // Card UI references
    private var tvMapInfo: TextView? = null
    private var tvPicksInfo: TextView? = null
    private var tvStatus: TextView? = null
    private var btnScan: Button? = null
    private var recContainer: LinearLayout? = null
    private var banContainer: LinearLayout? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        isRunning = true
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        initViews()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForegroundWithNotification()
        showBubble()
        return START_STICKY
    }

    private fun startForegroundWithNotification() {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("⚡ BrawlCoach Mod Menu Activo")
            .setContentText("Superposición flotante lista sobre Brawl Stars")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "BrawlCoach Mod Menu",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notificación de servicio de superposición flotante"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    // ==========================================
    // UI INITIALIZATION & DRAGGABLE VIEWS
    // ==========================================
    @SuppressLint("ClickableViewAccessibility")
    private fun initViews() {
        val density = resources.displayMetrics.density
        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        // 1. Bubble Layout Params
        val bubbleSize = (58 * density).toInt()
        bubbleParams = WindowManager.LayoutParams(
            bubbleSize,
            bubbleSize,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (20 * density).toInt()
            y = (180 * density).toInt()
        }

        // 2. Card Layout Params (Width: 320dp, Height: WRAP_CONTENT with Max bounds in Landscape)
        val cardWidth = (320 * density).toInt()
        cardParams = WindowManager.LayoutParams(
            cardWidth,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (20 * density).toInt()
            y = (20 * density).toInt()
        }

        buildBubbleView()
        buildCardView()
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun buildBubbleView() {
        val density = resources.displayMetrics.density
        val frame = FrameLayout(this)

        val bg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            colors = intArrayOf(Color.parseColor("#4f46e5"), Color.parseColor("#06b6d4"))
            gradientType = GradientDrawable.SWEEP_GRADIENT
            setStroke((2.5f * density).toInt(), Color.parseColor("#facc15"))
        }
        frame.background = bg
        frame.elevation = 16f * density

        val tv = TextView(this).apply {
            text = "⚡"
            textSize = 22f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
        }
        val tvParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        )
        frame.addView(tv, tvParams)

        var initialX = 0
        var initialY = 0
        var initialTouchX = 0f
        var initialTouchY = 0f
        var isDragging = false

        frame.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = bubbleParams.x
                    initialY = bubbleParams.y
                    initialTouchX = event.rawX
                    initialTouchY = event.rawY
                    isDragging = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - initialTouchX).toInt()
                    val dy = (event.rawY - initialTouchY).toInt()
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                        isDragging = true
                    }
                    bubbleParams.x = initialX + dx
                    bubbleParams.y = initialY + dy
                    try {
                        windowManager?.updateViewLayout(bubbleView, bubbleParams)
                    } catch (_: Exception) {}
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!isDragging) {
                        expandCard()
                    }
                    true
                }
                else -> false
            }
        }

        bubbleView = frame
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun buildCardView() {
        val density = resources.displayMetrics.density
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (12 * density).toInt()
            setPadding(pad, pad, pad, pad)
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 18 * density
                setColor(Color.parseColor("#F20F172A")) // 95% opacity dark slate
                setStroke((2 * density).toInt(), Color.parseColor("#38bdf8"))
            }
            background = bg
            elevation = 20f * density
        }

        // --- Draggable Header Bar ---
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, (6 * density).toInt())
        }

        val tvTitle = TextView(this).apply {
            text = "⚡ BRAWLCOACH MOD MENU"
            textSize = 12.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38bdf8"))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        header.addView(tvTitle)

        // Minimize Button
        val btnMinimize = TextView(this).apply {
            text = " ─ "
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding((8 * density).toInt(), 0, (8 * density).toInt(), 0)
            setOnClickListener { collapseToBubble() }
        }
        header.addView(btnMinimize)

        // Close Button
        val btnClose = TextView(this).apply {
            text = " ✕ "
            textSize = 14f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#f87171"))
            setPadding((6 * density).toInt(), 0, (4 * density).toInt(), 0)
            setOnClickListener { stopSelf() }
        }
        header.addView(btnClose)

        // Header touch listener to drag the card
        var cardInitX = 0
        var cardInitY = 0
        var cardTouchX = 0f
        var cardTouchY = 0f
        header.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    cardInitX = cardParams.x
                    cardInitY = cardParams.y
                    cardTouchX = event.rawX
                    cardTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (event.rawX - cardTouchX).toInt()
                    val dy = (event.rawY - cardTouchY).toInt()
                    cardParams.x = cardInitX + dx
                    cardParams.y = cardInitY + dy
                    try {
                        windowManager?.updateViewLayout(cardView, cardParams)
                    } catch (_: Exception) {}
                    true
                }
                else -> true
            }
        }
        root.addView(header)

        // Scrollable container for landscape and small screens
        val scrollView = ScrollView(this).apply {
            isVerticalScrollBarEnabled = true
            isScrollbarFadingEnabled = false
            overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        // --- Action Button: Scan Draft (Placed at top of content for easy reach) ---
        btnScan = Button(this).apply {
            text = "📸 Escanear Mapa y Picks"
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            isAllCaps = false
            background = GradientDrawable().apply {
                cornerRadius = 10 * density
                colors = intArrayOf(Color.parseColor("#059669"), Color.parseColor("#10b981"))
                gradientType = GradientDrawable.LINEAR_GRADIENT
            }
            val p = (8 * density).toInt()
            setPadding(p, p, p, p)
            setOnClickListener {
                startScanFlow()
            }
        }
        val btnParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = (8 * density).toInt()
        }
        content.addView(btnScan, btnParams)

        // --- Status Text ---
        tvStatus = TextView(this).apply {
            text = "Toca Escanear para consultar BrawlPick"
            textSize = 9.5f
            setTextColor(Color.parseColor("#64748b"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, (6 * density).toInt())
        }
        content.addView(tvStatus)

        // --- Map / Mode Info Box ---
        tvMapInfo = TextView(this).apply {
            text = "📍 Modo/Mapa: Sin detectar aún"
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#facc15")) // Amber
            val p = (8 * density).toInt()
            setPadding(p, (4 * density).toInt(), p, (4 * density).toInt())
            background = GradientDrawable().apply {
                cornerRadius = 8 * density
                setColor(Color.parseColor("#1e293b"))
            }
        }
        content.addView(tvMapInfo)

        // --- Detected Picks Info ---
        tvPicksInfo = TextView(this).apply {
            text = "Toca Escanear para analizar mapa y estadísticas"
            textSize = 9.5f
            setTextColor(Color.parseColor("#94a3b8"))
            setPadding(0, (3 * density).toInt(), 0, (5 * density).toInt())
        }
        content.addView(tvPicksInfo)

        // --- Section Header: Top Picks (BrawlPick) ---
        val tvSection = TextView(this).apply {
            text = "MEJORES PICKS (BRAWLPICK)"
            textSize = 9.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38bdf8"))
            setPadding(0, (2 * density).toInt(), 0, (3 * density).toInt())
        }
        content.addView(tvSection)

        // --- Container for Top Picks ---
        recContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        renderDefaultPicks(recContainer!!)
        content.addView(recContainer)

        // --- Section Header: Baneos Sugeridos ---
        val tvBanSection = TextView(this).apply {
            text = "BANEO SUGERIDO (HEURÍSTICO)"
            textSize = 9.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#f87171"))
            setPadding(0, (4 * density).toInt(), 0, (3 * density).toInt())
        }
        content.addView(tvBanSection)

        // --- Container for Suggested Bans ---
        banContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        renderDefaultBans(banContainer!!)
        content.addView(banContainer)

        scrollView.addView(content)

        // In landscape, cap the scrollview height so it never goes off-screen
        val scrollParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        )
        root.addView(scrollView, scrollParams)

        cardView = root
    }

    private fun renderDefaultPicks(container: LinearLayout) {
        container.removeAllViews()
        val defaultPicks = listOf(
            Triple("1. (Escanear pantalla)", "BrawlPick", "Esperando captura..."),
            Triple("2. (Escanear pantalla)", "BrawlPick", "Esperando captura..."),
            Triple("3. (Escanear pantalla)", "BrawlPick", "Esperando captura...")
        )
        for ((name, tier, reason) in defaultPicks) {
            container.addView(createStatRow(name, reason, tier, Color.parseColor("#475569")))
        }
    }

    private fun renderDefaultBans(container: LinearLayout) {
        container.removeAllViews()
        val defaultBans = listOf(
            Triple("🚫 (Escanear pantalla)", "BAN", "Esperando captura...")
        )
        for ((name, tier, reason) in defaultBans) {
            container.addView(createStatRow(name, reason, tier, Color.parseColor("#64748b")))
        }
    }

    private fun createStatRow(title: String, subtitle: String, badgeText: String, badgeBgColor: Int): View {
        val density = resources.displayMetrics.density
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val p = (6 * density).toInt()
            setPadding(p, p, p, p)
            background = GradientDrawable().apply {
                cornerRadius = 8 * density
                setColor(Color.parseColor("#1e293b"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (4 * density).toInt()
            }
        }

        val textCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val tvName = TextView(this).apply {
            text = title
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
        }
        textCol.addView(tvName)

        val tvReason = TextView(this).apply {
            text = subtitle
            textSize = 9.5f
            setTextColor(Color.parseColor("#94a3b8"))
        }
        textCol.addView(tvReason)
        row.addView(textCol)

        val badge = TextView(this).apply {
            text = badgeText
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.BLACK)
            val bp = (5 * density).toInt()
            setPadding(bp, (2 * density).toInt(), bp, (2 * density).toInt())
            background = GradientDrawable().apply {
                cornerRadius = 6 * density
                setColor(badgeBgColor)
            }
        }
        row.addView(badge)

        return row
    }

    private fun showBubble() {
        try {
            if (cardView?.isAttachedToWindow == true) {
                windowManager?.removeView(cardView)
            }
            if (bubbleView?.isAttachedToWindow != true) {
                windowManager?.addView(bubbleView, bubbleParams)
            }
        } catch (_: Exception) {}
    }

    private fun expandCard() {
        try {
            if (bubbleView?.isAttachedToWindow == true) {
                windowManager?.removeView(bubbleView)
            }
            if (cardView?.isAttachedToWindow != true) {
                val metrics = resources.displayMetrics
                val screenH = metrics.heightPixels
                val screenW = metrics.widthPixels
                val density = metrics.density

                // In landscape mode (gaming), cap card height to ~85% of screen height
                val maxCardH = if (screenW > screenH) {
                    (screenH * 0.88f).toInt()
                } else {
                    (450 * density).toInt().coerceAtMost((screenH * 0.75f).toInt())
                }

                cardParams.height = maxCardH
                cardParams.x = Math.max(15, bubbleParams.x - 30)
                cardParams.y = Math.max(15, Math.min(bubbleParams.y - 30, screenH - maxCardH - 20))
                windowManager?.addView(cardView, cardParams)
            }
        } catch (_: Exception) {}
    }

    private fun collapseToBubble() {
        showBubble()
    }

    // ==========================================
    // CAPTURE & VISION ANALYSIS FLOW
    // ==========================================
    private fun startScanFlow() {
        btnScan?.isEnabled = false
        tvStatus?.text = "📸 Preparando captura de pantalla..."

        // Temporarily hide the overlay so it doesn't appear in the screen capture
        bubbleView?.visibility = View.GONE
        cardView?.visibility = View.GONE

        // Launch transparent trampoline activity to acquire fresh single-use MediaProjection token
        CaptureTrampolineActivity.start(this)
    }

    fun handleCaptureDenied() {
        mainHandler.post {
            bubbleView?.visibility = View.VISIBLE
            cardView?.visibility = View.VISIBLE
            btnScan?.isEnabled = true
            tvStatus?.text = "⚠️ Permiso de captura cancelado"
        }
    }

    fun executeScreenCapture(resultCode: Int, resultData: Intent) {
        // Start MediaProjectionService foreground service
        val serviceIntent = Intent(this, MediaProjectionService::class.java).apply {
            action = MediaProjectionService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        // Wait 150ms for service to be active before acquiring projection
        mainHandler.postDelayed({
            val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val mediaProjection: MediaProjection? = try {
                projectionManager.getMediaProjection(resultCode, resultData.clone() as Intent)
            } catch (e: Exception) {
                null
            }

            if (mediaProjection == null) {
                stopCaptureService()
                handleCaptureDenied()
                return@postDelayed
            }

            // Restore overlay visibility with loading status
            bubbleView?.visibility = View.VISIBLE
            cardView?.visibility = View.VISIBLE
            tvStatus?.text = "🤖 Capturando fotograma..."

            val windowMgr = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            windowMgr.defaultDisplay.getRealMetrics(metrics)

            val screenWidth = metrics.widthPixels
            val screenHeight = metrics.heightPixels
            val screenDensity = metrics.densityDpi

            val handlerThread = HandlerThread("OverlayCaptureThread")
            handlerThread.start()
            val bgHandler = Handler(handlerThread.looper)

            val imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2)
            var virtualDisplay: VirtualDisplay? = null
            var hasCaptured = false

            val cleanup = {
                try {
                    virtualDisplay?.release()
                    virtualDisplay = null
                    imageReader.close()
                    mediaProjection.stop()
                    handlerThread.quitSafely()
                    stopCaptureService()
                } catch (_: Exception) {}
            }

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

                        // Crop and scale
                        val croppedBitmap = Bitmap.createBitmap(rawBitmap, 0, 0, screenWidth, screenHeight)
                        val maxW = 1280
                        val scaledBitmap = if (screenWidth > maxW) {
                            val scaledH = (screenHeight.toFloat() * (maxW.toFloat() / screenWidth)).toInt()
                            Bitmap.createScaledBitmap(croppedBitmap, maxW, scaledH, true)
                        } else {
                            croppedBitmap
                        }

                        val outputStream = ByteArrayOutputStream()
                        scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 85, outputStream)
                        val base64 = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP)

                        cleanup()

                        // Run Vision Call on background thread
                        sendToGeminiVision(base64)
                    } catch (e: Exception) {
                        cleanup()
                        mainHandler.post {
                            tvStatus?.text = "❌ Error al procesar imagen: ${e.message}"
                            btnScan?.isEnabled = true
                        }
                    }
                }
            }, bgHandler)

            try {
                virtualDisplay = mediaProjection.createVirtualDisplay(
                    "BrawlOverlayVirtualDisplay",
                    screenWidth,
                    screenHeight,
                    screenDensity,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    imageReader.surface,
                    null,
                    bgHandler
                )
            } catch (e: Exception) {
                cleanup()
                mainHandler.post {
                    tvStatus?.text = "❌ Error en VirtualDisplay: ${e.message}"
                    btnScan?.isEnabled = true
                }
            }
        }, 150)
    }

    private fun stopCaptureService() {
        val intent = Intent(this, MediaProjectionService::class.java).apply {
            action = MediaProjectionService.ACTION_STOP
        }
        startService(intent)
    }

    // ==========================================
    // GOOGLE GEMINI VISION & BRAWLPICK STATS
    // ==========================================
    private fun sendToGeminiVision(base64Image: String) {
        mainHandler.post {
            tvStatus?.text = "🤖 Identificando mapa con Google Gemini..."
        }

        Thread {
            val prompt = """
Eres un extractor visual OCR y analista de Brawl Stars.
Tu ÚNICA misión es leer el texto exacto de la esquina superior izquierda de la pantalla del juego, donde aparece el cuadro de modo y mapa:
1. En grande en la pancarta superior está el MODO (ej: ATRACO, BALÓN BRAWL, CAZA ESTELAR, ATRAPAGEMAS, ZONA CALIENTE, NOQUEO, DESTRUCCIÓN).
2. Debajo en letra más pequeña está el NOMBRE EXACTO DEL MAPA (ej: "Patata caliente", "Zona Segura", "Aguas turbulentas", "Cañón explosivo", "Estadio central", "Mina rocosa", etc.).

MAPAS DE ATRACO (HEIST):
- Patata caliente (Hot Potato)
- Zona segura (Safe Zone)
- Cañón explosivo (Kaboom Canyon)
- Aguas turbulentas / Un puente demasiado lejos (Bridge Too Far)
- Hot Tubs
- Jedna

MAPAS DE ATRAPAGEMAS (GEM GRAB):
- Mina rocosa (Hard Rock Mine), Cueva subterránea (Undermine), Doble dilema (Double Swoosh), Fuerte de gemas (Gem Fort).

MAPAS DE BALÓN BRAWL (BRAWL BALL):
- Estadio central (Center Stage), Sueños de pinball (Pinball Dreams), Campos furtivos (Sneaky Fields), En espiral (Spiraling Out), Triple regate (Triple Dribble).

MAPAS DE ZONA CALIENTE (HOT ZONE):
- Escarabajos en duelo (Dueling Beetles), Negocio abierto (Open Business), Jugadas paralelas (Parallel Plays), Anillo de fuego (Ring of Fire).

MAPAS DE NOQUEO (KNOCKOUT):
- Roca de Belle (Belle's Rock), Fénix resplandeciente (Flaring Phoenix), Nuevos horizontes (New Horizons), A campo abierto (Out in the Open), Barranco de brazo dorado (Goldarm Gulch).

MAPAS DE CAZA ESTELAR (BOUNTY):
- Estrella fugaz (Shooting Star), El escondite (Hideout), Pastel de capas (Layer Cake), Estación seca (Dry Season).

Transcribe literalmente lo que ves escrito en pantalla.
Responde EXCLUSIVAMENTE un JSON válido sin bloques markdown:
{"map": "texto_exacto_del_mapa", "mode": "modo_de_juego"}
""".trimIndent()

            // Clean base64 header if present
            val cleanBase64 = if (base64Image.contains(",")) base64Image.substringAfter(",") else base64Image

            // PRIMARY (Gemini 3.5 Flash Lite) with FALLBACK (Gemma 4 31B)
            val models = listOf("gemini-3.5-flash-lite", "gemma-4-31b-it")
            var handled = false

            for (currentModel in models) {
                if (handled) break
                try {
                    val defaultKey = String(Base64.decode("QVEuQWI4Uk42S252TEgxRTN1NE91S0dNTkJRTVJDbDc2MExHX1dpUXBEN0xWNF9scmhFanc=", Base64.DEFAULT)).trim()
                    val geminiKey = if (apiKeyStr.isNotBlank()) apiKeyStr else defaultKey
                    val geminiUrl = URL("https://generativelanguage.googleapis.com/v1beta/models/$currentModel:generateContent?key=$geminiKey")
                    val gConn = geminiUrl.openConnection() as HttpURLConnection
                    gConn.requestMethod = "POST"
                    gConn.doOutput = true
                    gConn.connectTimeout = 12000
                    gConn.readTimeout = 12000
                    gConn.setRequestProperty("Content-Type", "application/json")

                    val gPayload = JSONObject().apply {
                        val contentsArr = JSONArray().apply {
                            val contentObj = JSONObject().apply {
                                val partsArr = JSONArray().apply {
                                    put(JSONObject().apply { put("text", prompt) })
                                    put(JSONObject().apply {
                                        val inlineData = JSONObject().apply {
                                            put("mimeType", "image/jpeg")
                                            put("data", cleanBase64)
                                        }
                                        put("inlineData", inlineData)
                                    })
                                }
                                put("parts", partsArr)
                            }
                            put(contentObj)
                        }
                        put("contents", contentsArr)
                        val genConfig = JSONObject().apply {
                            put("temperature", 0.1)
                            put("maxOutputTokens", 250)
                        }
                        put("generationConfig", genConfig)
                    }

                    OutputStreamWriter(gConn.outputStream).use { writer ->
                        writer.write(gPayload.toString())
                        writer.flush()
                    }

                    if (gConn.responseCode == 200) {
                        val gRespText = gConn.inputStream.bufferedReader().use { it.readText() }
                        val gJson = JSONObject(gRespText)
                        val candidate = gJson.optJSONArray("candidates")?.optJSONObject(0)
                        val parts = candidate?.optJSONObject("content")?.optJSONArray("parts")
                        val sb = StringBuilder()
                        if (parts != null) {
                            for (i in 0 until parts.length()) {
                                val part = parts.optJSONObject(i)
                                if (part != null && part.has("text") && !part.optBoolean("thought", false)) {
                                    sb.append(part.optString("text", "")).append("\n")
                                }
                            }
                        }
                        val rawContent = sb.toString().trim()

                        val matcher = "\\{[\\s\\S]*?\\}".toRegex().find(rawContent)
                        if (matcher != null) {
                            val parsed = JSONObject(matcher.value)
                            val detectedMap = parsed.optString("map", parsed.optString("mapName", "")).trim()
                            val detectedMode = parsed.optString("mode", "").trim()

                            val analysis = queryBrawlPickStats(detectedMap, detectedMode)
                            mainHandler.post {
                                updateUiWithBrawlPick(analysis)
                            }
                            handled = true
                            return@Thread
                        }
                    }
                } catch (e: Exception) {
                    // Try next model
                }
            }

            if (!handled) {
                mainHandler.post {
                    tvStatus?.text = "⚠️ Servidores ocupados. Pulsa 'Escanear Mapa' de nuevo."
                    btnScan?.isEnabled = true
                }
            }
        }.start()
    }

    data class BrawlPickRow(
        val name: String,
        val rank: Int,
        val winRate: Double,
        val games: Int,
        val reliability: String,
        val isBan: Boolean = false,
        val banReason: String = ""
    )

    data class BrawlPickCardData(
        val mapName: String,
        val mode: String,
        val isRanked: Boolean,
        val totalBattles: Int,
        val topPicks: List<BrawlPickRow>,
        val suggestedBans: List<BrawlPickRow>,
        val status: String // "OK" or "UNKNOWN_MAP"
    )

    private fun normalize(text: String): String {
        val decomposed = java.text.Normalizer.normalize(text.lowercase(), java.text.Normalizer.Form.NFD)
        return decomposed.replace("\\p{InCombiningDiacriticalMarks}+".toRegex(), "")
            .replace("[^a-z0-9]".toRegex(), "")
    }

    private fun getBrawlPickJson(): String {
        if (brawlPickJsonStr.isNotBlank() && brawlPickJsonStr != "{}" && brawlPickJsonStr != "[]") {
            return brawlPickJsonStr
        }
        return try {
            assets.open("brawlpick_maps.json").bufferedReader().use { it.readText() }
        } catch (_: Exception) {
            "{}"
        }
    }

    private fun queryBrawlPickStats(detectedMap: String, detectedMode: String): BrawlPickCardData {
        val normQueryMap = normalize(detectedMap)
        val jsonSource = getBrawlPickJson()
        val brawlPickObj = try { JSONObject(jsonSource) } catch (_: Exception) { null }
        val mapsArr = brawlPickObj?.optJSONArray("maps") ?: JSONArray()

        var matchedMapObj: JSONObject? = null

        val normQueryMode = normalize(detectedMode)
        val standardMode = when {
            normQueryMode.contains("heist") || normQueryMode.contains("atraco") -> "heist"
            normQueryMode.contains("gem") || normQueryMode.contains("atrapagemas") -> "gemgrab"
            normQueryMode.contains("ball") || normQueryMode.contains("balon") -> "brawlball"
            normQueryMode.contains("hot") || normQueryMode.contains("zona") -> "hotzone"
            normQueryMode.contains("knock") || normQueryMode.contains("noqueo") -> "knockout"
            normQueryMode.contains("bounty") || normQueryMode.contains("caza") -> "bounty"
            normQueryMode.contains("wipeout") || normQueryMode.contains("destruccion") -> "wipeout"
            else -> ""
        }

        // 1. Exact or alias match (prioritizing mode match if available)
        for (i in 0 until mapsArr.length()) {
            val item = mapsArr.optJSONObject(i) ?: continue
            val name = item.optString("mapName", "")
            val mode = normalize(item.optString("mode", ""))
            val aliases = item.optJSONArray("aliases") ?: JSONArray()

            if (normQueryMap.isNotEmpty()) {
                val isNameMatch = normalize(name) == normQueryMap
                var aliasMatched = false
                for (a in 0 until aliases.length()) {
                    if (normalize(aliases.optString(a, "")) == normQueryMap) {
                        aliasMatched = true
                        break
                    }
                }

                if (isNameMatch || aliasMatched) {
                    if (standardMode.isEmpty() || mode.contains(standardMode) || standardMode.contains(mode)) {
                        matchedMapObj = item
                        break
                    } else if (matchedMapObj == null) {
                        matchedMapObj = item
                    }
                }
            }
        }

        // 2. Partial / word-overlap match if not found
        if (matchedMapObj == null && normQueryMap.length >= 3) {
            val queryWords = normQueryMap.split(" ").filter { it.length >= 3 }
            for (i in 0 until mapsArr.length()) {
                val item = mapsArr.optJSONObject(i) ?: continue
                val name = item.optString("mapName", "")
                val mode = normalize(item.optString("mode", ""))
                val normName = normalize(name)

                val nameContains = normName.contains(normQueryMap) || normQueryMap.contains(normName)
                val wordOverlap = queryWords.any { normName.contains(it) }

                if (nameContains || wordOverlap) {
                    if (standardMode.isEmpty() || mode.contains(standardMode) || standardMode.contains(mode)) {
                        matchedMapObj = item
                        break
                    } else if (matchedMapObj == null) {
                        matchedMapObj = item
                    }
                }
            }
        }

        if (matchedMapObj == null) {
            val fallbackName = if (detectedMap.isNotBlank()) detectedMap else "Mapa Desconocido"
            val fallbackMode = if (detectedMode.isNotBlank()) detectedMode else "Ranked"
            return BrawlPickCardData(
                mapName = fallbackName,
                mode = fallbackMode,
                isRanked = false,
                totalBattles = 0,
                topPicks = emptyList(),
                suggestedBans = emptyList(),
                status = "UNKNOWN_MAP"
            )
        }

        val isRanked = matchedMapObj.optBoolean("isRanked", false)
        val totalBattles = matchedMapObj.optInt("totalBattles", 0)
        val picksArr = matchedMapObj.optJSONArray("picks") ?: JSONArray()

        val topPicks = mutableListOf<BrawlPickRow>()
        for (i in 0 until Math.min(5, picksArr.length())) {
            val p = picksArr.optJSONObject(i) ?: continue
            topPicks.add(
                BrawlPickRow(
                    name = p.optString("brawlerName", "Brawler"),
                    rank = p.optInt("rank", i + 1),
                    winRate = p.optDouble("winRate", 50.0),
                    games = p.optInt("games", 0),
                    reliability = p.optString("reliability", "Media")
                )
            )
        }

        // Calculate 2 suggested bans (highest win rate / oppressive picks)
        val suggestedBans = mutableListOf<BrawlPickRow>()
        val sortedByWR = topPicks.sortedByDescending { it.winRate }
        for (b in sortedByWR.take(2)) {
            suggestedBans.add(
                BrawlPickRow(
                    name = b.name,
                    rank = b.rank,
                    winRate = b.winRate,
                    games = b.games,
                    reliability = b.reliability,
                    isBan = true,
                    banReason = "Baneo sugerido (Heurístico): Pick dominante (${b.winRate}% WR)"
                )
            )
        }

        val rawMapName = matchedMapObj.optString("mapName", detectedMap)
        val rawMode = matchedMapObj.optString("mode", detectedMode)
        val aliases = matchedMapObj.optJSONArray("aliases") ?: JSONArray()

        val spanishName = if (aliases.length() > 0) aliases.optString(0, rawMapName) else rawMapName
        val finalMapName = if (spanishName.equals(rawMapName, ignoreCase = true)) rawMapName else "$spanishName ($rawMapName)"

        val displayMode = when (rawMode.lowercase().trim()) {
            "heist" -> "Atraco"
            "gem grab" -> "Atrapagemas"
            "brawl ball" -> "Balón Brawl"
            "hot zone" -> "Zona Caliente"
            "bounty" -> "Caza Estelar"
            "knockout" -> "Noqueo"
            "wipeout" -> "Destrucción"
            else -> rawMode
        }

        return BrawlPickCardData(
            mapName = finalMapName,
            mode = displayMode,
            isRanked = isRanked,
            totalBattles = totalBattles,
            topPicks = topPicks,
            suggestedBans = suggestedBans,
            status = "OK"
        )
    }

    private fun updateUiWithBrawlPick(data: BrawlPickCardData) {
        if (data.status == "UNKNOWN_MAP") {
            tvMapInfo?.text = "⚠️ [${data.mode.uppercase()}] ${data.mapName}"
            tvPicksInfo?.text = "Mapa no encontrado en base BrawlPick"
            recContainer?.removeAllViews()
            banContainer?.removeAllViews()
            tvStatus?.text = "💡 Puedes elegir el mapa manualmente en la app"
            btnScan?.isEnabled = true
            return
        }

        val rankedBadge = if (data.isRanked) "🏆 RANKED" else "Casual"
        tvMapInfo?.text = "📍 [${data.mode.uppercase()}] ${data.mapName}  $rankedBadge"
        tvPicksInfo?.text = "📊 BrawlPick: ${data.totalBattles} partidas competitivas analizadas"

        // Render Top Picks
        recContainer?.removeAllViews()
        for ((idx, pick) in data.topPicks.withIndex()) {
            val prefix = when (idx) {
                0 -> "🥇 "
                1 -> "🥈 "
                2 -> "🥉 "
                else -> "#${idx + 1} "
            }
            val title = prefix + pick.name
            val desc = "${pick.games} partidas • ${pick.reliability}"
            val badgeText = "${pick.winRate}% WR"
            val badgeColor = if (pick.winRate >= 60.0) Color.parseColor("#10b981") else Color.parseColor("#38bdf8")
            recContainer?.addView(createStatRow(title, desc, badgeText, badgeColor))
        }

        // Render Suggested Bans
        banContainer?.removeAllViews()
        for (ban in data.suggestedBans) {
            val title = "🚫 ${ban.name}"
            val desc = "Baneo sugerido: domina con ${ban.winRate}% WR"
            banContainer?.addView(createStatRow(title, desc, "BAN", Color.parseColor("#f87171")))
        }

        tvStatus?.text = "✅ Estadísticas de BrawlPick aplicadas (<10ms)"
        btnScan?.isEnabled = true
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        isRunning = false
        try {
            if (bubbleView?.isAttachedToWindow == true) windowManager?.removeView(bubbleView)
            if (cardView?.isAttachedToWindow == true) windowManager?.removeView(cardView)
        } catch (_: Exception) {}
    }
}
