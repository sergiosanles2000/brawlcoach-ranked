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
import android.widget.HorizontalScrollView
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

    // Interactive Draft State
    private var currentModeName: String = "Brawl Ball"
    private var currentMapName: String = "Center Stage"
    private val allyPicks = arrayOf<String?>(null, null, null)
    private val enemyPicks = arrayOf<String?>(null, null, null)
    private val bannedBrawlers = mutableListOf<String>()
    private var activePickerTarget: String? = null // e.g. "ALLY_0", "ENEMY_1", "BAN"
    private var currentTurnText = "1st Pick (Tu turno)"

    // UI Interactive views
    private var draftBoardContainer: LinearLayout? = null
    private var pickerOverlayContainer: FrameLayout? = null
    private var tvDraftPhaseInfo: TextView? = null
    private var allySlotViews = arrayOfNulls<TextView>(3)
    private var enemySlotViews = arrayOfNulls<TextView>(3)
    private var banSlotViewsContainer: LinearLayout? = null

    // Local Draft Vision Engine & Real-time Auto-Detector (1-2 FPS)
    private var visionEngine: LocalDraftVisionEngine? = null
    private var isAutoScanning = false
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var captureHandlerThread: HandlerThread? = null
    private var lastFrameTimestamp = 0L
    private var reusableRawBitmap: Bitmap? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        isRunning = true
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        visionEngine = LocalDraftVisionEngine(this)
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
            .setContentTitle("BrawlDraft - Asistente Flotante")
            .setContentText("Superposición táctica lista sobre Brawl Stars")
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

        // 2. Card Layout Params (Ultra-compact: 245dp, always clamped within screen)
        val metrics = resources.displayMetrics
        val screenW = metrics.widthPixels
        val cardWidth = (245 * density).toInt().coerceAtMost((screenW * 0.70f).toInt())
        cardParams = WindowManager.LayoutParams(
            cardWidth,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (12 * density).toInt()
            y = (12 * density).toInt()
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
            setColor(Color.parseColor("#0f172a"))
            setStroke((2f * density).toInt(), Color.parseColor("#38bdf8"))
        }
        frame.background = bg
        frame.elevation = 12f * density

        val tv = TextView(this).apply {
            text = "💀"
            textSize = 20f
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
        val root = FrameLayout(this)

        val cardContent = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (6 * density).toInt()
            setPadding(pad, pad, pad, pad)
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 14 * density
                setColor(Color.parseColor("#F50F172A")) // 96% opacity dark slate
                setStroke((1.5f * density).toInt(), Color.parseColor("#38bdf8"))
            }
            background = bg
            elevation = 20f * density
        }

        // --- FIXED HEADER BAR (ALWAYS PINNED AT TOP) ---
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((2 * density).toInt(), (2 * density).toInt(), (2 * density).toInt(), (4 * density).toInt())
        }

        val tvTitle = TextView(this).apply {
            text = "⚡ BRAWLDRAFT"
            textSize = 10.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38bdf8"))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        header.addView(tvTitle)

        // Reset Draft Button
        val btnReset = TextView(this).apply {
            text = "🔄"
            textSize = 11f
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 6 * density
                setColor(Color.parseColor("#1e293b"))
            }
            val p = (5 * density).toInt()
            setPadding(p, (3 * density).toInt(), p, (3 * density).toInt())
            setOnClickListener { resetDraft() }
        }
        val resetParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            rightMargin = (6 * density).toInt()
        }
        header.addView(btnReset, resetParams)

        // Minimize Button (Circular)
        val btnMinimize = TextView(this).apply {
            text = "─"
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#cbd5e1"))
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#334155"))
            }
            layoutParams = LinearLayout.LayoutParams(
                (24 * density).toInt(),
                (24 * density).toInt()
            ).apply {
                rightMargin = (6 * density).toInt()
            }
            setOnClickListener { collapseToBubble() }
        }
        header.addView(btnMinimize)

        // Close Button (Circular Bright Red - Easy to tap)
        val btnClose = TextView(this).apply {
            text = "✕"
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#dc2626"))
            }
            layoutParams = LinearLayout.LayoutParams(
                (24 * density).toInt(),
                (24 * density).toInt()
            )
            setOnClickListener { stopSelf() }
        }
        header.addView(btnClose)

        // Dragging listener for card header
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
        cardContent.addView(header)

        // Scrollable container wrapping ALL content below the fixed header
        val scrollView = ScrollView(this).apply {
            isVerticalScrollBarEnabled = true
            isScrollbarFadingEnabled = false
            overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
        }

        val scrollContent = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        // --- MAP SELECTOR BAR ---
        val mapSelectorBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val p = (6 * density).toInt()
            setPadding(p, (4 * density).toInt(), p, (4 * density).toInt())
            background = GradientDrawable().apply {
                cornerRadius = 8 * density
                setColor(Color.parseColor("#1e293b"))
                setStroke((1 * density).toInt(), Color.parseColor("#334155"))
            }
            setOnClickListener {
                openMapPicker()
            }
        }

        tvMapInfo = TextView(this).apply {
            text = "🗺️ $currentModeName: $currentMapName"
            textSize = 10.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#facc15")) // Gold
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        mapSelectorBar.addView(tvMapInfo)

        val tvChangeMap = TextView(this).apply {
            text = "Cambiar ▾"
            textSize = 9.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38bdf8"))
        }
        mapSelectorBar.addView(tvChangeMap)

        val mapBarParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = (4 * density).toInt()
        }
        scrollContent.addView(mapSelectorBar, mapBarParams)

        // --- DRAFT BOARD (ALIADOS vs RIVALES) ---
        draftBoardContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val padD = (4 * density).toInt()
            setPadding(padD, padD, padD, padD)
            background = GradientDrawable().apply {
                cornerRadius = 8 * density
                setColor(Color.parseColor("#090f1d")) // Very dark slate
                setStroke((1 * density).toInt(), Color.parseColor("#1e293b"))
            }
        }

        val draftColumns = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        // Aliados Col (Azul)
        val allyCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                rightMargin = (3 * density).toInt()
            }
        }
        val tvAllyHeader = TextView(this).apply {
            text = "💙 MI EQUIPO"
            textSize = 9f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38bdf8"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, (2 * density).toInt())
        }
        allyCol.addView(tvAllyHeader)

        for (i in 0..2) {
            val slot = TextView(this).apply {
                text = "+ Aliado ${i + 1}"
                textSize = 8.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#64748b"))
                gravity = Gravity.CENTER
                val sp = (3 * density).toInt()
                setPadding(sp, sp, sp, sp)
                background = GradientDrawable().apply {
                    cornerRadius = 5 * density
                    setColor(Color.parseColor("#1e293b"))
                    setStroke((1 * density).toInt(), Color.parseColor("#0284c7"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = (2.5f * density).toInt()
                }
                setOnClickListener {
                    openBrawlerPicker("ALLY_$i")
                }
            }
            allySlotViews[i] = slot
            allyCol.addView(slot)
        }
        draftColumns.addView(allyCol)

        // Rivales Col (Rojo)
        val enemyCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                leftMargin = (3 * density).toInt()
            }
        }
        val tvEnemyHeader = TextView(this).apply {
            text = "❤️ RIVALES"
            textSize = 9f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#f87171"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, (2 * density).toInt())
        }
        enemyCol.addView(tvEnemyHeader)

        for (i in 0..2) {
            val slot = TextView(this).apply {
                text = "+ Rival ${i + 1}"
                textSize = 8.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#64748b"))
                gravity = Gravity.CENTER
                val sp = (3 * density).toInt()
                setPadding(sp, sp, sp, sp)
                background = GradientDrawable().apply {
                    cornerRadius = 5 * density
                    setColor(Color.parseColor("#1e293b"))
                    setStroke((1 * density).toInt(), Color.parseColor("#b91c1c"))
                }
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = (2.5f * density).toInt()
                }
                setOnClickListener {
                    openBrawlerPicker("ENEMY_$i")
                }
            }
            enemySlotViews[i] = slot
            enemyCol.addView(slot)
        }
        draftColumns.addView(enemyCol)

        draftBoardContainer?.addView(draftColumns)

        // Ban Strip Row
        val banRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, (2 * density).toInt(), 0, 0)
        }

        val tvBanLabel = TextView(this).apply {
            text = "🚫 Baneos: "
            textSize = 8.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#f87171"))
        }
        banRow.addView(tvBanLabel)

        banSlotViewsContainer = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        updateBanChips()
        banRow.addView(banSlotViewsContainer)

        val btnAddBan = TextView(this).apply {
            text = "+ Ban"
            textSize = 8.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#cbd5e1"))
            val bp = (4 * density).toInt()
            setPadding(bp, (1.5f * density).toInt(), bp, (1.5f * density).toInt())
            background = GradientDrawable().apply {
                cornerRadius = 4 * density
                setColor(Color.parseColor("#334155"))
            }
            setOnClickListener {
                openBrawlerPicker("BAN")
            }
        }
        banRow.addView(btnAddBan)

        draftBoardContainer?.addView(banRow)

        val boardParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            bottomMargin = (4 * density).toInt()
        }
        scrollContent.addView(draftBoardContainer, boardParams)

        // Turn & Phase indicator
        tvDraftPhaseInfo = TextView(this).apply {
            text = currentTurnText
            textSize = 9f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38bdf8"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, (3 * density).toInt())
        }
        scrollContent.addView(tvDraftPhaseInfo)

        // --- Section Header: Recomendaciones Tácticas ---
        val tvSection = TextView(this).apply {
            text = "⚡ RECOMENDACIONES TÁCTICAS"
            textSize = 9.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#38bdf8"))
            setPadding(0, (2 * density).toInt(), 0, (3 * density).toInt())
        }
        scrollContent.addView(tvSection)

        // --- Container for Top Picks ---
        recContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        scrollContent.addView(recContainer)

        // --- Section Header: Baneos Sugeridos ---
        val tvBanSection = TextView(this).apply {
            text = "BANEO SUGERIDO"
            textSize = 9.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#f87171"))
            setPadding(0, (4 * density).toInt(), 0, (3 * density).toInt())
        }
        scrollContent.addView(tvBanSection)

        // --- Container for Suggested Bans ---
        banContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        scrollContent.addView(banContainer)

        // --- Action Button: Auto-Detector en tiempo real (100% Local) ---
        btnScan = Button(this).apply {
            text = "▶️ Auto-Detectar en Vivo"
            textSize = 11.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            isAllCaps = false
            background = GradientDrawable().apply {
                cornerRadius = 8 * density
                colors = intArrayOf(Color.parseColor("#059669"), Color.parseColor("#10b981"))
                gradientType = GradientDrawable.LINEAR_GRADIENT
            }
            val p = (6 * density).toInt()
            setPadding(p, p, p, p)
            setOnClickListener {
                toggleAutoScan()
            }
        }
        val btnParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = (6 * density).toInt()
            bottomMargin = (4 * density).toInt()
        }
        scrollContent.addView(btnScan, btnParams)

        // Status Text
        tvStatus = TextView(this).apply {
            text = "Toca un slot para seleccionar brawler o escanea"
            textSize = 9f
            setTextColor(Color.parseColor("#64748b"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, (4 * density).toInt())
        }
        scrollContent.addView(tvStatus)

        scrollView.addView(scrollContent)

        val scrollParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        )
        cardContent.addView(scrollView, scrollParams)

        root.addView(cardContent)

        // Overlay picker container (hidden by default)
        pickerOverlayContainer = FrameLayout(this).apply {
            visibility = View.GONE
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 16 * density
                setColor(Color.parseColor("#FA090D16")) // Near black 98%
                setStroke((2 * density).toInt(), Color.parseColor("#38bdf8"))
            }
            background = bg
            elevation = 30f * density
        }
        root.addView(pickerOverlayContainer)

        cardView = root

        // Run initial recommendation recalculation
        recalculateDraft()
    }

    private fun updateBanChips() {
        val container = banSlotViewsContainer ?: return
        val density = resources.displayMetrics.density
        container.removeAllViews()

        if (bannedBrawlers.isEmpty()) {
            val tvEmpty = TextView(this).apply {
                text = "Ninguno"
                textSize = 8.5f
                setTextColor(Color.parseColor("#64748b"))
            }
            container.addView(tvEmpty)
            return
        }

        for (ban in bannedBrawlers) {
            val chip = TextView(this).apply {
                text = "$ban ✕"
                textSize = 8.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#fca5a5"))
                val cp = (4 * density).toInt()
                setPadding(cp, (1 * density).toInt(), cp, (1 * density).toInt())
                background = GradientDrawable().apply {
                    cornerRadius = 4 * density
                    setColor(Color.parseColor("#450a0a"))
                    setStroke((1 * density).toInt(), Color.parseColor("#991b1b"))
                }
                setOnClickListener {
                    bannedBrawlers.remove(ban)
                    updateBanChips()
                    recalculateDraft()
                }
            }
            val chipParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                rightMargin = (4 * density).toInt()
            }
            container.addView(chip, chipParams)
        }
    }

    private fun resetDraft() {
        for (i in 0..2) {
            allyPicks[i] = null
            enemyPicks[i] = null
        }
        bannedBrawlers.clear()
        visionEngine?.resetState()
        updateSlotsUi()
        updateBanChips()
        recalculateDraft()
        tvStatus?.text = "Draft reiniciado. Selecciona los picks o activa auto-detector."
    }

    private fun updateSlotsUi() {
        val density = resources.displayMetrics.density
        for (i in 0..2) {
            val allyPick = allyPicks[i]
            val allyView = allySlotViews[i]
            if (allyView != null) {
                if (allyPick != null) {
                    allyView.text = "🛡️ $allyPick"
                    allyView.setTextColor(Color.WHITE)
                    allyView.background = GradientDrawable().apply {
                        cornerRadius = 6 * density
                        setColor(Color.parseColor("#0369a1")) // Blue filled
                        setStroke((1 * density).toInt(), Color.parseColor("#38bdf8"))
                    }
                } else {
                    allyView.text = "+ Aliado ${i + 1}"
                    allyView.setTextColor(Color.parseColor("#64748b"))
                    allyView.background = GradientDrawable().apply {
                        cornerRadius = 6 * density
                        setColor(Color.parseColor("#1e293b"))
                        setStroke((1 * density).toInt(), Color.parseColor("#0284c7"))
                    }
                }
            }

            val enemyPick = enemyPicks[i]
            val enemyView = enemySlotViews[i]
            if (enemyView != null) {
                if (enemyPick != null) {
                    enemyView.text = "⚔️ $enemyPick"
                    enemyView.setTextColor(Color.WHITE)
                    enemyView.background = GradientDrawable().apply {
                        cornerRadius = 6 * density
                        setColor(Color.parseColor("#991b1b")) // Red filled
                        setStroke((1 * density).toInt(), Color.parseColor("#f87171"))
                    }
                } else {
                    enemyView.text = "+ Rival ${i + 1}"
                    enemyView.setTextColor(Color.parseColor("#64748b"))
                    enemyView.background = GradientDrawable().apply {
                        cornerRadius = 6 * density
                        setColor(Color.parseColor("#1e293b"))
                        setStroke((1 * density).toInt(), Color.parseColor("#b91c1c"))
                    }
                }
            }
        }
    }

    // ==========================================
    // IN-OVERLAY MAP PICKER
    // ==========================================
    private fun openMapPicker() {
        val container = pickerOverlayContainer ?: return
        val density = resources.displayMetrics.density
        container.removeAllViews()

        val rootPicker = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = (10 * density).toInt()
            setPadding(p, p, p, p)
        }

        // Header
        val pickerHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, (6 * density).toInt())
        }

        val tvTitle = TextView(this).apply {
            text = "ELEGIR MAPA"
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#facc15"))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        pickerHeader.addView(tvTitle)

        val btnClose = TextView(this).apply {
            text = "✕"
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#dc2626"))
            }
            layoutParams = LinearLayout.LayoutParams(
                (24 * density).toInt(),
                (24 * density).toInt()
            )
            setOnClickListener {
                container.visibility = View.GONE
            }
        }
        pickerHeader.addView(btnClose)
        rootPicker.addView(pickerHeader)

        // Parse Maps from JSON
        val mapsArr = try {
            JSONArray(mapsJsonStr)
        } catch (_: Exception) {
            JSONArray()
        }

        val mapItems = mutableListOf<Pair<String, String>>() // (mode, mapName)
        for (i in 0 until mapsArr.length()) {
            val obj = mapsArr.optJSONObject(i) ?: continue
            val mode = obj.optString("mode", "")
            val name = obj.optString("name", "")
            if (name.isNotBlank()) {
                mapItems.add(Pair(mode, name))
            }
        }

        // Fallback default ranked maps if mapsJsonStr is empty
        if (mapItems.isEmpty()) {
            mapItems.addAll(listOf(
                Pair("Brawl Ball", "Center Stage"),
                Pair("Brawl Ball", "Pinball Dreams"),
                Pair("Brawl Ball", "Sneaky Fields"),
                Pair("Gem Grab", "Hard Rock Mine"),
                Pair("Gem Grab", "Double Swoosh"),
                Pair("Heist", "Hot Potato"),
                Pair("Heist", "Safe Zone"),
                Pair("Heist", "Kaboom Canyon"),
                Pair("Hot Zone", "Dueling Beetles"),
                Pair("Hot Zone", "Open Business"),
                Pair("Hot Zone", "Parallel Plays"),
                Pair("Knockout", "Belle's Rock"),
                Pair("Knockout", "Flaring Phoenix"),
                Pair("Knockout", "Out in the Open"),
                Pair("Bounty", "Shooting Star"),
                Pair("Bounty", "Hideout")
            ))
        }

        // Group by Mode
        val groupedByMode = mapItems.groupBy { it.first }

        val scroll = ScrollView(this)
        val listLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        for ((mode, list) in groupedByMode) {
            val tvModeHeader = TextView(this).apply {
                text = "📍 $mode".uppercase()
                textSize = 10f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#38bdf8"))
                val hp = (4 * density).toInt()
                setPadding(hp, (6 * density).toInt(), hp, (2 * density).toInt())
            }
            listLayout.addView(tvModeHeader)

            for (item in list) {
                val mapBtn = TextView(this).apply {
                    text = item.second
                    textSize = 11f
                    typeface = Typeface.DEFAULT_BOLD
                    setTextColor(Color.WHITE)
                    val p = (8 * density).toInt()
                    setPadding(p, (6 * density).toInt(), p, (6 * density).toInt())
                    background = GradientDrawable().apply {
                        cornerRadius = 6 * density
                        setColor(Color.parseColor("#1e293b"))
                    }
                    setOnClickListener {
                        currentModeName = item.first
                        currentMapName = item.second
                        tvMapInfo?.text = "🗺️ $currentModeName: $currentMapName"
                        container.visibility = View.GONE
                        recalculateDraft()
                    }
                }
                val btnParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    bottomMargin = (4 * density).toInt()
                }
                listLayout.addView(mapBtn, btnParams)
            }
        }

        scroll.addView(listLayout)
        rootPicker.addView(scroll, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))

        container.addView(rootPicker)
        container.visibility = View.VISIBLE
    }

    // ==========================================
    // IN-OVERLAY BRAWLER PICKER
    // ==========================================
    private fun openBrawlerPicker(targetSlot: String) {
        activePickerTarget = targetSlot
        val container = pickerOverlayContainer ?: return
        val density = resources.displayMetrics.density
        container.removeAllViews()

        val rootPicker = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = (8 * density).toInt()
            setPadding(p, p, p, p)
        }

        // Header with Target Slot Info & Quick Clear
        val pickerHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, (4 * density).toInt())
        }

        val slotTitle = when {
            targetSlot.startsWith("ALLY_") -> "Elegir Aliado #${targetSlot.substringAfter("ALLY_").toInt() + 1}"
            targetSlot.startsWith("ENEMY_") -> "Elegir Rival #${targetSlot.substringAfter("ENEMY_").toInt() + 1}"
            else -> "Elegir Baneo"
        }

        val tvTitle = TextView(this).apply {
            text = slotTitle
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(if (targetSlot.startsWith("ENEMY_")) Color.parseColor("#f87171") else Color.parseColor("#38bdf8"))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        pickerHeader.addView(tvTitle)

        // Clear Slot button
        if (!targetSlot.startsWith("BAN")) {
            val btnClearSlot = TextView(this).apply {
                text = "Vaciar"
                textSize = 9.5f
                typeface = Typeface.DEFAULT_BOLD
                setTextColor(Color.parseColor("#94a3b8"))
                val cp = (5 * density).toInt()
                setPadding(cp, (2 * density).toInt(), cp, (2 * density).toInt())
                background = GradientDrawable().apply {
                    cornerRadius = 4 * density
                    setColor(Color.parseColor("#334155"))
                }
                setOnClickListener {
                    val idx = targetSlot.substringAfter("_").toIntOrNull() ?: 0
                    if (targetSlot.startsWith("ALLY_")) allyPicks[idx] = null
                    else enemyPicks[idx] = null
                    container.visibility = View.GONE
                    updateSlotsUi()
                    recalculateDraft()
                }
            }
            val clearParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                rightMargin = (6 * density).toInt()
            }
            pickerHeader.addView(btnClearSlot, clearParams)
        }

        val btnClose = TextView(this).apply {
            text = "✕"
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#dc2626"))
            }
            layoutParams = LinearLayout.LayoutParams(
                (24 * density).toInt(),
                (24 * density).toInt()
            )
            setOnClickListener {
                container.visibility = View.GONE
            }
        }
        pickerHeader.addView(btnClose)
        rootPicker.addView(pickerHeader)

        // Parse Brawlers list
        val brawlersArr = try { JSONArray(brawlersJsonStr) } catch (_: Exception) { JSONArray() }
        data class BrawlerItem(val name: String, val bClass: String)
        val allBrawlersList = mutableListOf<BrawlerItem>()

        for (i in 0 until brawlersArr.length()) {
            val b = brawlersArr.optJSONObject(i) ?: continue
            val name = b.optString("displayName", b.optString("name", ""))
            val bClass = b.optString("class", "General")
            if (name.isNotBlank()) {
                allBrawlersList.add(BrawlerItem(name, bClass))
            }
        }
        allBrawlersList.sortBy { it.name }

        // Filter chips bar (Todos, Tanques, Asesinos, Tiradores, etc.)
        val filterScroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
        }
        val filterRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, (4 * density).toInt())
        }

        val gridContainer = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        fun renderBrawlers(filterClass: String) {
            gridContainer.removeAllViews()
            val filtered = if (filterClass == "Todos") allBrawlersList else allBrawlersList.filter {
                it.bClass.contains(filterClass, ignoreCase = true)
            }

            // Group into rows of 3 brawlers for easy thumb tapping
            val rows = filtered.chunked(3)
            for (chunk in rows) {
                val row = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    layoutParams = LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.MATCH_PARENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT
                    ).apply {
                        bottomMargin = (4 * density).toInt()
                    }
                }
                for (brawler in chunk) {
                    val isAlreadyPicked = allyPicks.contains(brawler.name) ||
                            enemyPicks.contains(brawler.name) ||
                            bannedBrawlers.contains(brawler.name)

                    val brawlerBtn = TextView(this).apply {
                        text = brawler.name
                        textSize = 9.5f
                        typeface = Typeface.DEFAULT_BOLD
                        gravity = Gravity.CENTER
                        val bp = (4 * density).toInt()
                        setPadding(bp, (8 * density).toInt(), bp, (8 * density).toInt())

                        if (isAlreadyPicked) {
                            setTextColor(Color.parseColor("#475569"))
                            background = GradientDrawable().apply {
                                cornerRadius = 6 * density
                                setColor(Color.parseColor("#0f172a"))
                                setStroke((1 * density).toInt(), Color.parseColor("#1e293b"))
                            }
                        } else {
                            setTextColor(Color.WHITE)
                            background = GradientDrawable().apply {
                                cornerRadius = 6 * density
                                setColor(Color.parseColor("#1e293b"))
                                setStroke((1 * density).toInt(), Color.parseColor("#334155"))
                            }
                            setOnClickListener {
                                onBrawlerSelected(brawler.name, targetSlot)
                                container.visibility = View.GONE
                            }
                        }

                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                            setMargins((2 * density).toInt(), 0, (2 * density).toInt(), 0)
                        }
                    }
                    row.addView(brawlerBtn)
                }
                // Fill remainder if chunk < 3
                if (chunk.size < 3) {
                    for (k in 0 until (3 - chunk.size)) {
                        val spacer = View(this).apply {
                            layoutParams = LinearLayout.LayoutParams(0, 0, 1f).apply {
                                setMargins((2 * density).toInt(), 0, (2 * density).toInt(), 0)
                            }
                        }
                        row.addView(spacer)
                    }
                }
                gridContainer.addView(row)
            }
        }

        val categories = listOf("Todos", "Tank", "Assassin", "Marksman", "Damage Dealer", "Artillery", "Support", "Controller")
        val categoryViews = mutableListOf<TextView>()

        for (cat in categories) {
            val catLabel = when (cat) {
                "Tank" -> "Tanques"
                "Assassin" -> "Asesinos"
                "Marksman" -> "Tiradores"
                "Damage Dealer" -> "Daño"
                "Artillery" -> "Lanzadores"
                "Support" -> "Apoyo"
                "Controller" -> "Control"
                else -> cat
            }

            val chip = TextView(this).apply {
                text = catLabel
                textSize = 9f
                typeface = Typeface.DEFAULT_BOLD
                val cp = (6 * density).toInt()
                setPadding(cp, (3 * density).toInt(), cp, (3 * density).toInt())

                if (cat == "Todos") {
                    setTextColor(Color.BLACK)
                    background = GradientDrawable().apply {
                        cornerRadius = 10 * density
                        setColor(Color.parseColor("#38bdf8"))
                    }
                } else {
                    setTextColor(Color.parseColor("#94a3b8"))
                    background = GradientDrawable().apply {
                        cornerRadius = 10 * density
                        setColor(Color.parseColor("#1e293b"))
                    }
                }

                setOnClickListener {
                    for (cv in categoryViews) {
                        cv.setTextColor(Color.parseColor("#94a3b8"))
                        (cv.background as? GradientDrawable)?.setColor(Color.parseColor("#1e293b"))
                    }
                    setTextColor(Color.BLACK)
                    (background as? GradientDrawable)?.setColor(Color.parseColor("#38bdf8"))
                    renderBrawlers(cat)
                }
            }
            categoryViews.add(chip)
            val chipParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                rightMargin = (4 * density).toInt()
            }
            filterRow.addView(chip, chipParams)
        }
        filterScroll.addView(filterRow)
        rootPicker.addView(filterScroll)

        // Scrollview holding brawler grid
        val brawlerScroll = ScrollView(this).apply {
            isVerticalScrollBarEnabled = true
        }
        renderBrawlers("Todos")
        brawlerScroll.addView(gridContainer)

        rootPicker.addView(brawlerScroll, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1f
        ))

        container.addView(rootPicker)
        container.visibility = View.VISIBLE
    }

    private fun onBrawlerSelected(brawlerName: String, targetSlot: String) {
        when {
            targetSlot.startsWith("ALLY_") -> {
                val idx = targetSlot.substringAfter("ALLY_").toIntOrNull() ?: 0
                allyPicks[idx] = brawlerName
            }
            targetSlot.startsWith("ENEMY_") -> {
                val idx = targetSlot.substringAfter("ENEMY_").toIntOrNull() ?: 0
                enemyPicks[idx] = brawlerName
            }
            targetSlot == "BAN" -> {
                if (!bannedBrawlers.contains(brawlerName)) {
                    bannedBrawlers.add(brawlerName)
                }
            }
        }
        updateSlotsUi()
        updateBanChips()
        recalculateDraft()
    }

    // ==========================================
    // LOCAL COUNTER RECOMMENDATION ENGINE
    // ==========================================
    private fun recalculateDraft() {
        val totalLocked = allyPicks.count { it != null } + enemyPicks.count { it != null }
        currentTurnText = when (totalLocked) {
            0 -> "⚡ First Pick (Fase Inicial)"
            1, 2 -> "⚡ Turno 2 (Mid Pick)"
            3, 4 -> "⚡ Turno 3 (Pick Tardío)"
            5 -> "⚡ Último Pick (Counter Directo)"
            else -> "✅ Draft Completo"
        }
        tvDraftPhaseInfo?.text = currentTurnText

        // 1. Gather Map Tiers
        val mapsArr = try { JSONArray(mapsJsonStr) } catch (_: Exception) { JSONArray() }
        var mapTiersS = mutableListOf<String>()
        var mapTiersA = mutableListOf<String>()
        var mapTiersB = mutableListOf<String>()

        for (i in 0 until mapsArr.length()) {
            val m = mapsArr.optJSONObject(i) ?: continue
            val name = m.optString("name", "")
            if (name.equals(currentMapName, ignoreCase = true) || normalize(name) == normalize(currentMapName)) {
                val tiers = m.optJSONObject("tiers")
                if (tiers != null) {
                    val sArr = tiers.optJSONArray("S") ?: JSONArray()
                    val aArr = tiers.optJSONArray("A") ?: JSONArray()
                    val bArr = tiers.optJSONArray("B") ?: JSONArray()
                    for (x in 0 until sArr.length()) mapTiersS.add(sArr.optString(x))
                    for (x in 0 until aArr.length()) mapTiersA.add(aArr.optString(x))
                    for (x in 0 until bArr.length()) mapTiersB.add(bArr.optString(x))
                }
                break
            }
        }

        // 2. Counters Map
        val countersObj = try { JSONObject(countersJsonStr) } catch (_: Exception) { JSONObject() }

        // 3. All brawlers list
        val brawlersArr = try { JSONArray(brawlersJsonStr) } catch (_: Exception) { JSONArray() }
        data class ScoredCandidate(
            val name: String,
            val score: Int,
            val tier: String,
            val primaryReason: String,
            val badge: String,
            val badgeColor: Int
        )

        val candidates = mutableListOf<ScoredCandidate>()
        val lockedSet = (allyPicks.filterNotNull() + enemyPicks.filterNotNull() + bannedBrawlers).toSet()

        for (i in 0 until brawlersArr.length()) {
            val bObj = brawlersArr.optJSONObject(i) ?: continue
            val name = bObj.optString("displayName", bObj.optString("name", ""))
            if (name.isBlank() || lockedSet.contains(name)) continue

            var tierScore = 0
            var tier = "C"
            var primaryReason = "Opción estándar"

            // Map tier
            if (mapTiersS.any { it.equals(name, ignoreCase = true) }) {
                tier = "S"
                tierScore = 40
                primaryReason = "Dominante en este mapa"
            } else if (mapTiersA.any { it.equals(name, ignoreCase = true) }) {
                tier = "A"
                tierScore = 25
                primaryReason = "A-Tier consistente en mapa"
            } else if (mapTiersB.any { it.equals(name, ignoreCase = true) }) {
                tier = "B"
                tierScore = 12
                primaryReason = "Opción viable de mapa"
            }

            // Counters vs Enemy Picks
            var counterScore = 0
            val brawlerCounters = countersObj.optJSONObject(name)
            if (brawlerCounters != null) {
                val directCounters = brawlerCounters.optJSONArray("counters") ?: JSONArray()
                val counteredBy = brawlerCounters.optJSONArray("counteredBy") ?: JSONArray()
                val synergies = brawlerCounters.optJSONArray("synergies") ?: JSONArray()

                for (enemy in enemyPicks.filterNotNull()) {
                    for (c in 0 until directCounters.length()) {
                        if (directCounters.optString(c).equals(enemy, ignoreCase = true)) {
                            counterScore += 24
                            primaryReason = "Counter demoledor vs $enemy"
                        }
                    }
                    for (cb in 0 until counteredBy.length()) {
                        if (counteredBy.optString(cb).equals(enemy, ignoreCase = true)) {
                            counterScore -= 22
                        }
                    }
                }

                // Ally Synergies
                for (ally in allyPicks.filterNotNull()) {
                    for (s in 0 until synergies.length()) {
                        if (synergies.optString(s).equals(ally, ignoreCase = true)) {
                            counterScore += 12
                            if (!primaryReason.contains("Counter")) {
                                primaryReason = "Gran sinergia con $ally"
                            }
                        }
                    }
                }
            }

            val totalScore = Math.max(10, Math.min(100, 25 + tierScore + counterScore))
            val badgeText = when {
                counterScore >= 20 -> "🔥 COUNTER"
                tier == "S" -> "S-TIER"
                tier == "A" -> "A-TIER"
                else -> "${totalScore} pts"
            }
            val badgeColor = when {
                counterScore >= 20 -> Color.parseColor("#10b981") // Emerald Green
                tier == "S" -> Color.parseColor("#facc15") // Gold
                tier == "A" -> Color.parseColor("#38bdf8") // Sky Blue
                else -> Color.parseColor("#64748b")
            }

            candidates.add(
                ScoredCandidate(
                    name = name,
                    score = totalScore,
                    tier = tier,
                    primaryReason = primaryReason,
                    badge = badgeText,
                    badgeColor = badgeColor
                )
            )
        }

        candidates.sortByDescending { it.score }

        // Render Top 5 Recommendations
        recContainer?.removeAllViews()
        val topCandidates = candidates.take(5)
        if (topCandidates.isEmpty()) {
            recContainer?.addView(createStatRow("Todos los brawlers seleccionados", "Reinicia draft para comenzar", "FULL", Color.parseColor("#64748b")))
        } else {
            for ((idx, pick) in topCandidates.withIndex()) {
                val medal = when (idx) {
                    0 -> "🥇 "
                    1 -> "🥈 "
                    2 -> "🥉 "
                    else -> "#${idx + 1} "
                }
                recContainer?.addView(createStatRow(medal + pick.name, pick.primaryReason, pick.badge, pick.badgeColor))
            }
        }

        // Render Suggested Bans (from map S-Tier or highest priority)
        banContainer?.removeAllViews()
        val banCandidates = mapTiersS.filter { !lockedSet.contains(it) }.take(2)
        if (banCandidates.isNotEmpty()) {
            for (ban in banCandidates) {
                banContainer?.addView(createStatRow("🚫 $ban", "Baneo prioritario: dominancia S-Tier en mapa", "BAN", Color.parseColor("#f87171")))
            }
        } else {
            val fallbackBan = candidates.firstOrNull()?.name ?: "Buster"
            banContainer?.addView(createStatRow("🚫 $fallbackBan", "Baneo recomendado por potencia de combate", "BAN", Color.parseColor("#f87171")))
        }
    }

    private fun renderDefaultPicks(container: LinearLayout) {
        container.removeAllViews()
        val defaultPicks = listOf(
            Triple("1. Selecciona mapa o brawlers", "Local Engine", "Calculando picks..."),
            Triple("2. Escanear pantalla", "BrawlPick", "Esperando datos..."),
            Triple("3. Toca cualquier slot", "Manual", "Personalizable")
        )
        for ((name, tier, reason) in defaultPicks) {
            container.addView(createStatRow(name, reason, tier, Color.parseColor("#475569")))
        }
    }

    private fun renderDefaultBans(container: LinearLayout) {
        container.removeAllViews()
        val defaultBans = listOf(
            Triple("🚫 Frank", "BAN", "Prioritario por control de mapa")
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
            val p = (5 * density).toInt()
            setPadding(p, p, p, p)
            background = GradientDrawable().apply {
                cornerRadius = 8 * density
                setColor(Color.parseColor("#1e293b"))
            }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = (3 * density).toInt()
            }
        }

        val textCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val tvName = TextView(this).apply {
            text = title
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
        }
        textCol.addView(tvName)

        val tvReason = TextView(this).apply {
            text = subtitle
            textSize = 9f
            setTextColor(Color.parseColor("#94a3b8"))
        }
        textCol.addView(tvReason)
        row.addView(textCol)

        val badge = TextView(this).apply {
            text = badgeText
            textSize = 9.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.BLACK)
            val bp = (5 * density).toInt()
            setPadding(bp, (2 * density).toInt(), bp, (2 * density).toInt())
            background = GradientDrawable().apply {
                cornerRadius = 5 * density
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

                // In landscape mode (gaming), cap card height to ~84% of screen height
                val maxCardH = if (screenW > screenH) {
                    (screenH * 0.84f).toInt()
                } else {
                    (460 * density).toInt().coerceAtMost((screenH * 0.78f).toInt())
                }

                val cardWidth = (245 * density).toInt().coerceAtMost((screenW * 0.70f).toInt())
                cardParams.width = cardWidth
                cardParams.height = maxCardH
                // Strictly clamp within visible screen boundaries so header & close button are never cut off
                val margin = (12 * density).toInt()
                cardParams.x = Math.max(margin, Math.min(bubbleParams.x - 20, screenW - cardWidth - margin))
                cardParams.y = Math.max(margin, Math.min(bubbleParams.y - 20, screenH - maxCardH - margin))
                windowManager?.addView(cardView, cardParams)
            }
        } catch (_: Exception) {}
    }

    private fun collapseToBubble() {
        showBubble()
    }

    // ==========================================
    // REAL-TIME LOCAL DRAFT DETECTION (1-2 FPS)
    // ==========================================
    private fun toggleAutoScan() {
        if (isAutoScanning) {
            stopContinuousCapture()
        } else {
            startScanFlow()
        }
    }

    private fun startScanFlow() {
        btnScan?.isEnabled = false
        tvStatus?.text = "📸 Iniciando auto-detector en tiempo real..."

        // Temporarily hide overlay so permission dialog is unobstructed
        bubbleView?.visibility = View.GONE
        cardView?.visibility = View.GONE

        // Launch transparent trampoline activity to acquire MediaProjection token
        CaptureTrampolineActivity.start(this)
    }

    fun handleCaptureDenied() {
        mainHandler.post {
            bubbleView?.visibility = View.VISIBLE
            cardView?.visibility = View.VISIBLE
            btnScan?.isEnabled = true
            updateScanButtonUi(false)
            tvStatus?.text = "⚠️ Permiso de captura denegado"
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
            mediaProjection = try {
                projectionManager.getMediaProjection(resultCode, resultData.clone() as Intent)
            } catch (e: Exception) {
                null
            }

            if (mediaProjection == null) {
                stopCaptureService()
                handleCaptureDenied()
                return@postDelayed
            }

            // Restore overlay visibility
            bubbleView?.visibility = View.VISIBLE
            cardView?.visibility = View.VISIBLE
            isAutoScanning = true
            btnScan?.isEnabled = true
            updateScanButtonUi(true)
            tvStatus?.text = "🟢 Auto-Detector activo (<5ms local) • Escaneando..."

            val windowMgr = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            windowMgr.defaultDisplay.getRealMetrics(metrics)

            val screenWidth = metrics.widthPixels
            val screenHeight = metrics.heightPixels
            val screenDensity = metrics.densityDpi

            captureHandlerThread = HandlerThread("LocalDraftCaptureThread").apply { start() }
            val bgHandler = Handler(captureHandlerThread!!.looper)

            // Scaled capture resolution for optimal performance (e.g. 1280 wide)
            val captureW = if (screenWidth > 1280) 1280 else screenWidth
            val captureH = (screenHeight.toFloat() * (captureW.toFloat() / screenWidth)).toInt()

            imageReader = ImageReader.newInstance(captureW, captureH, PixelFormat.RGBA_8888, 2)

            mediaProjection?.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    super.onStop()
                    stopContinuousCapture()
                }
            }, Handler(Looper.getMainLooper()))

            imageReader?.setOnImageAvailableListener({ reader ->
                val now = System.currentTimeMillis()
                val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener

                // Throttle to ~1.5 FPS (650ms between frames) to preserve CPU and battery
                if (now - lastFrameTimestamp < 650L) {
                    image.close()
                    return@setOnImageAvailableListener
                }
                lastFrameTimestamp = now

                try {
                    val planes = image.planes
                    val buffer = planes[0].buffer
                    val pixelStride = planes[0].pixelStride
                    val rowStride = planes[0].rowStride
                    val rowPadding = rowStride - pixelStride * captureW

                    val fullBitmapW = captureW + rowPadding / pixelStride
                    if (reusableRawBitmap == null || reusableRawBitmap?.width != fullBitmapW || reusableRawBitmap?.height != captureH) {
                        reusableRawBitmap?.recycle()
                        reusableRawBitmap = Bitmap.createBitmap(fullBitmapW, captureH, Bitmap.Config.ARGB_8888)
                    }

                    reusableRawBitmap?.copyPixelsFromBuffer(buffer)
                    image.close()

                    val targetBitmap = if (rowPadding == 0) {
                        reusableRawBitmap!!
                    } else {
                        Bitmap.createBitmap(reusableRawBitmap!!, 0, 0, captureW, captureH)
                    }

                    val engine = visionEngine ?: return@setOnImageAvailableListener
                    val result = engine.processFrame(targetBitmap)

                    if (targetBitmap != reusableRawBitmap) {
                        targetBitmap.recycle()
                    }

                    if (result.isDraftActive) {
                        if (result.hasChanges) {
                            for (i in 0..2) {
                                if (result.allyPicks[i] != null) allyPicks[i] = result.allyPicks[i]
                                if (result.enemyPicks[i] != null) enemyPicks[i] = result.enemyPicks[i]
                            }

                            for (ban in result.bans) {
                                if (!bannedBrawlers.contains(ban)) {
                                    bannedBrawlers.add(ban)
                                }
                            }

                            if (result.detectedMap != null && !result.detectedMap.equals(currentMapName, ignoreCase = true)) {
                                val analysis = queryBrawlPickStats(result.detectedMap, result.detectedMode ?: "")
                                mainHandler.post {
                                    updateUiWithBrawlPick(analysis)
                                }
                            }

                            mainHandler.post {
                                updateSlotsUi()
                                updateBanChips()
                                recalculateDraft()
                                tvStatus?.text = "🟢 Draft sincronizado en vivo"
                            }
                        }
                    } else {
                        mainHandler.post {
                            tvStatus?.text = "🟢 Buscando partida / draft en Brawl Stars..."
                        }
                    }
                } catch (e: Exception) {
                    android.util.Log.w("FloatingOverlayService", "Frame processing warning: ${e.message}")
                }
            }, bgHandler)

            try {
                virtualDisplay = mediaProjection?.createVirtualDisplay(
                    "BrawlOverlayVirtualDisplay",
                    captureW,
                    captureH,
                    screenDensity,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    imageReader!!.surface,
                    null,
                    bgHandler
                )
            } catch (e: Exception) {
                stopContinuousCapture()
                mainHandler.post {
                    tvStatus?.text = "❌ Error en VirtualDisplay: ${e.message}"
                }
            }
        }, 150)
    }

    private fun stopContinuousCapture() {
        isAutoScanning = false
        try {
            virtualDisplay?.release()
            virtualDisplay = null
            imageReader?.close()
            imageReader = null
            mediaProjection?.stop()
            mediaProjection = null
            captureHandlerThread?.quitSafely()
            captureHandlerThread = null
            reusableRawBitmap?.recycle()
            reusableRawBitmap = null
            stopCaptureService()
        } catch (_: Exception) {}

        mainHandler.post {
            btnScan?.isEnabled = true
            updateScanButtonUi(false)
            tvStatus?.text = "⏸️ Auto-detector pausado"
        }
    }

    private fun updateScanButtonUi(active: Boolean) {
        val density = resources.displayMetrics.density
        if (active) {
            btnScan?.text = "⏹️ Detener Auto-Detector"
            btnScan?.background = GradientDrawable().apply {
                cornerRadius = 8 * density
                colors = intArrayOf(Color.parseColor("#dc2626"), Color.parseColor("#ef4444"))
                gradientType = GradientDrawable.LINEAR_GRADIENT
            }
        } else {
            btnScan?.text = "▶️ Auto-Detectar en Vivo"
            btnScan?.background = GradientDrawable().apply {
                cornerRadius = 8 * density
                colors = intArrayOf(Color.parseColor("#059669"), Color.parseColor("#10b981"))
                gradientType = GradientDrawable.LINEAR_GRADIENT
            }
        }
    }

    private fun stopCaptureService() {
        val intent = Intent(this, MediaProjectionService::class.java).apply {
            action = MediaProjectionService.ACTION_STOP
        }
        startService(intent)
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

        currentModeName = data.mode
        currentMapName = data.mapName
        tvMapInfo?.text = "🗺️ ${data.mode}: ${data.mapName}"
        recalculateDraft()
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

        // Haptic feedback vibration on successful scan
        try {
            val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator
            if (vibrator?.hasVibrator() == true) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(android.os.VibrationEffect.createOneShot(80, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(80)
                }
            }
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        isRunning = false
        stopContinuousCapture()
        visionEngine?.close()
        visionEngine = null
        try {
            if (bubbleView?.isAttachedToWindow == true) windowManager?.removeView(bubbleView)
            if (cardView?.isAttachedToWindow == true) windowManager?.removeView(cardView)
        } catch (_: Exception) {}
    }
}
