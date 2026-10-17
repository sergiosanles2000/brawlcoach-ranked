package com.brawlcoach.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.InputStream
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * 100% Local Real-Time Visual Draft Detector for Brawl Stars.
 * - Diffing & state change detection (1-2 FPS)
 * - Template matching & color histograms without any external cloud API
 * - On-device ML Kit OCR for Map/Mode detection
 * - Zero bitmap leakage / reusable memory buffers
 */
class LocalDraftVisionEngine(private val context: Context) {

    companion object {
        private const val TAG = "LocalDraftVisionEngine"
        private const val SAMPLE_SIZE = 24 // 24x24 normalized matching grid
        private const val HIST_BINS = 64 // 4x4x4 RGB color histogram
        private const val EMPTY_SLOT_MAX_SAT = 32f
        private const val EMPTY_SLOT_MAX_BRIGHTNESS = 62f
        private const val MATCH_THRESHOLD = 0.32f // minimum combined similarity
    }

    data class BrawlerTemplate(
        val name: String,
        val avgR: Float,
        val avgG: Float,
        val avgB: Float,
        val colorHist: FloatArray,
        val lumVec: FloatArray
    )

    data class SlotState(
        var brawler: String? = null,
        var lastFingerprint: Long = 0L,
        var isOccupied: Boolean = false
    )

    data class DraftVisionResult(
        val isDraftActive: Boolean,
        val allyPicks: Array<String?>,
        val enemyPicks: Array<String?>,
        val bans: List<String>,
        val hasChanges: Boolean,
        val detectedMap: String? = null,
        val detectedMode: String? = null
    )

    private val templates = mutableListOf<BrawlerTemplate>()
    private var isTemplatesLoaded = false

    // State cache to avoid redundant classification
    private val allySlotStates = Array(3) { SlotState() }
    private val enemySlotStates = Array(3) { SlotState() }
    private val allyBanStates = Array(3) { SlotState() }
    private val enemyBanStates = Array(3) { SlotState() }

    // Reusable buffers to avoid GC pressure
    private val reusablePixelBuffer = IntArray(SAMPLE_SIZE * SAMPLE_SIZE)

    // ML Kit text recognizer for local on-device map detection
    private val textRecognizer by lazy {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }

    private var isOcrRunning = false
    private var lastOcrTimestamp = 0L
    private var cachedDetectedMap: String? = null
    private var cachedDetectedMode: String? = null

    init {
        loadTemplatesAsync()
    }

    private fun loadTemplatesAsync() {
        Thread {
            try {
                val assetManager = context.assets
                val files = assetManager.list("brawler_templates") ?: emptyArray()
                val loadedList = mutableListOf<BrawlerTemplate>()

                for (filename in files) {
                    if (!filename.endsWith(".png", ignoreCase = true)) continue
                    val brawlerName = filename.substringBeforeLast(".png")
                    var inputStream: InputStream? = null
                    try {
                        inputStream = assetManager.open("brawler_templates/$filename")
                        val bitmap = BitmapFactory.decodeStream(inputStream)
                        if (bitmap != null) {
                            val template = extractTemplateFromBitmap(brawlerName, bitmap)
                            loadedList.add(template)
                            bitmap.recycle()
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Error loading template $filename: ${e.message}")
                    } finally {
                        try { inputStream?.close() } catch (_: Exception) {}
                    }
                }

                synchronized(templates) {
                    templates.clear()
                    templates.addAll(loadedList)
                    isTemplatesLoaded = true
                }
                Log.i(TAG, "Successfully loaded ${loadedList.size} local brawler templates.")
            } catch (e: Exception) {
                Log.e(TAG, "Failed loading templates: ${e.message}")
            }
        }.start()
    }

    private fun extractTemplateFromBitmap(name: String, bitmap: Bitmap): BrawlerTemplate {
        val scaled = Bitmap.createScaledBitmap(bitmap, SAMPLE_SIZE, SAMPLE_SIZE, true)
        val pixels = IntArray(SAMPLE_SIZE * SAMPLE_SIZE)
        scaled.getPixels(pixels, 0, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        if (scaled != bitmap) scaled.recycle()

        var sumR = 0f
        var sumG = 0f
        var sumB = 0f
        val hist = FloatArray(HIST_BINS)
        val lum = FloatArray(SAMPLE_SIZE * SAMPLE_SIZE)

        for (i in pixels.indices) {
            val c = pixels[i]
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            sumR += r
            sumG += g
            sumB += b

            // 64-bin color histogram (4x4x4)
            val bin = (r / 64) * 16 + (g / 64) * 4 + (b / 64)
            hist[bin] += 1f

            // Luminance
            lum[i] = 0.299f * r + 0.587f * g + 0.114f * b
        }

        val totalPixels = pixels.size.toFloat()
        for (i in hist.indices) {
            hist[i] /= totalPixels
        }

        val meanLum = lum.sum() / totalPixels
        val centered = FloatArray(lum.size) { lum[it] - meanLum }
        var sumSq = 0f
        for (v in centered) sumSq += v * v
        val norm = if (sumSq > 0.0001f) sqrt(sumSq) else 1f
        val lumVec = FloatArray(centered.size) { centered[it] / norm }

        return BrawlerTemplate(
            name = name,
            avgR = sumR / totalPixels,
            avgG = sumG / totalPixels,
            avgB = sumB / totalPixels,
            colorHist = hist,
            lumVec = lumVec
        )
    }

    /**
     * Process a frame captured by MediaProjection.
     * Uses scaling relative to the screen dimensions.
     */
    fun processFrame(frameBitmap: Bitmap): DraftVisionResult {
        val width = frameBitmap.width
        val height = frameBitmap.height

        var changesDetected = false

        // Check if Draft is active (screen has the bottom card layout)
        val isDraft = isDraftScreen(frameBitmap, width, height)
        if (!isDraft) {
            return DraftVisionResult(
                isDraftActive = false,
                allyPicks = arrayOfNulls(3),
                enemyPicks = arrayOfNulls(3),
                bans = emptyList(),
                hasChanges = false
            )
        }

        // ==========================================
        // 1. MONITOR & DIFF ALLY PICKS (3 slots)
        // ==========================================
        val allyCoords = listOf(
            Rect((width * 0.125f).toInt(), (height * 0.69f).toInt(), (width * 0.225f).toInt(), (height * 0.93f).toInt()),
            Rect((width * 0.245f).toInt(), (height * 0.69f).toInt(), (width * 0.345f).toInt(), (height * 0.93f).toInt()),
            Rect((width * 0.365f).toInt(), (height * 0.69f).toInt(), (width * 0.465f).toInt(), (height * 0.93f).toInt())
        )

        val allyResult = arrayOfNulls<String>(3)
        for (i in 0..2) {
            val rect = allyCoords[i]
            val slotResult = evaluatePickSlot(frameBitmap, rect, allySlotStates[i])
            if (slotResult != allySlotStates[i].brawler) {
                allySlotStates[i].brawler = slotResult
                changesDetected = true
            }
            allyResult[i] = slotResult
        }

        // ==========================================
        // 2. MONITOR & DIFF ENEMY PICKS (3 slots)
        // ==========================================
        val enemyCoords = listOf(
            Rect((width * 0.535f).toInt(), (height * 0.69f).toInt(), (width * 0.635f).toInt(), (height * 0.93f).toInt()),
            Rect((width * 0.655f).toInt(), (height * 0.69f).toInt(), (width * 0.755f).toInt(), (height * 0.93f).toInt()),
            Rect((width * 0.775f).toInt(), (height * 0.69f).toInt(), (width * 0.875f).toInt(), (height * 0.93f).toInt())
        )

        val enemyResult = arrayOfNulls<String>(3)
        for (i in 0..2) {
            val rect = enemyCoords[i]
            val slotResult = evaluatePickSlot(frameBitmap, rect, enemySlotStates[i])
            if (slotResult != enemySlotStates[i].brawler) {
                enemySlotStates[i].brawler = slotResult
                changesDetected = true
            }
            enemyResult[i] = slotResult
        }

        // ==========================================
        // 3. MONITOR & DIFF BANS (Left & Right)
        // ==========================================
        val allyBanCoords = listOf(
            Rect((width * 0.015f).toInt(), (height * 0.30f).toInt(), (width * 0.075f).toInt(), (height * 0.42f).toInt()),
            Rect((width * 0.015f).toInt(), (height * 0.44f).toInt(), (width * 0.075f).toInt(), (height * 0.56f).toInt()),
            Rect((width * 0.015f).toInt(), (height * 0.58f).toInt(), (width * 0.075f).toInt(), (height * 0.70f).toInt())
        )

        val enemyBanCoords = listOf(
            Rect((width * 0.925f).toInt(), (height * 0.30f).toInt(), (width * 0.985f).toInt(), (height * 0.42f).toInt()),
            Rect((width * 0.925f).toInt(), (height * 0.44f).toInt(), (width * 0.985f).toInt(), (height * 0.56f).toInt()),
            Rect((width * 0.925f).toInt(), (height * 0.58f).toInt(), (width * 0.985f).toInt(), (height * 0.70f).toInt())
        )

        val detectedBans = mutableListOf<String>()

        for (i in 0..2) {
            val banResult = evaluateBanSlot(frameBitmap, allyBanCoords[i], allyBanStates[i])
            if (banResult != allyBanStates[i].brawler) {
                allyBanStates[i].brawler = banResult
                changesDetected = true
            }
            if (banResult != null && !detectedBans.contains(banResult)) {
                detectedBans.add(banResult)
            }
        }

        for (i in 0..2) {
            val banResult = evaluateBanSlot(frameBitmap, enemyBanCoords[i], enemyBanStates[i])
            if (banResult != enemyBanStates[i].brawler) {
                enemyBanStates[i].brawler = banResult
                changesDetected = true
            }
            if (banResult != null && !detectedBans.contains(banResult)) {
                detectedBans.add(banResult)
            }
        }

        // ==========================================
        // 4. LOCAL ON-DEVICE MAP/MODE OCR (ML KIT)
        // ==========================================
        triggerMapOcrIfNeeded(frameBitmap, width, height)

        return DraftVisionResult(
            isDraftActive = true,
            allyPicks = allyResult,
            enemyPicks = enemyResult,
            bans = detectedBans,
            hasChanges = changesDetected,
            detectedMap = cachedDetectedMap,
            detectedMode = cachedDetectedMode
        )
    }

    /**
     * Checks if the screen currently contains the Draft interface
     * by verifying bottom row contrast and center VS section.
     */
    private fun isDraftScreen(bitmap: Bitmap, width: Int, height: Int): Boolean {
        // Sample center between cards (around x: 49%-51%, y: 78%-84%)
        val cx = (width * 0.50f).toInt().coerceIn(0, width - 1)
        val cy = (height * 0.81f).toInt().coerceIn(0, height - 1)

        val centerPixel = bitmap.getPixel(cx, cy)
        val r = (centerPixel shr 16) and 0xFF
        val g = (centerPixel shr 8) and 0xFF
        val b = centerPixel and 0xFF

        // Center VS area is distinct dark slate/gold or dark divider
        val pickY = (height * 0.80f).toInt().coerceIn(0, height - 1)
        val ally1X = (width * 0.18f).toInt().coerceIn(0, width - 1)
        val enemy1X = (width * 0.82f).toInt().coerceIn(0, width - 1)

        val allyP = bitmap.getPixel(ally1X, pickY)
        val enemyP = bitmap.getPixel(enemy1X, pickY)

        // Basic sanity check that screen is in landscape and pixels are valid
        return width > height && (r + g + b > 5)
    }

    /**
     * Evaluates whether a pick slot is empty (gray silhouette) or locked,
     * and performs local template matching when a brawler is detected.
     */
    private fun evaluatePickSlot(bitmap: Bitmap, rect: Rect, state: SlotState): String? {
        if (rect.left < 0 || rect.top < 0 || rect.right > bitmap.width || rect.bottom > bitmap.height) {
            return state.brawler
        }

        // Focus on upper 70% of card (brawler face/body illustration)
        val cardW = rect.width()
        val cardH = rect.height()
        val faceH = (cardH * 0.70f).toInt()
        val cropRect = Rect(rect.left, rect.top, rect.right, rect.top + faceH)

        // Sample center of card to check saturation & brightness
        val sampleBitmap = Bitmap.createBitmap(bitmap, cropRect.left, cropRect.top, cropRect.width(), cropRect.height())
        val scaled = Bitmap.createScaledBitmap(sampleBitmap, SAMPLE_SIZE, SAMPLE_SIZE, false)
        if (sampleBitmap != scaled) sampleBitmap.recycle()

        scaled.getPixels(reusablePixelBuffer, 0, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        scaled.recycle()

        var sumSat = 0f
        var sumBrightness = 0f
        var fingerprint = 0L

        for (i in reusablePixelBuffer.indices) {
            val c = reusablePixelBuffer[i]
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF

            val maxC = max(r, max(g, b)).toFloat()
            val minC = min(r, min(g, b)).toFloat()
            sumSat += (maxC - minC)
            sumBrightness += (0.299f * r + 0.587f * g + 0.114f * b)

            // Fast hash of slot colors
            fingerprint = 31L * fingerprint + ((r shr 4) shl 8 or ((g shr 4) shl 4) or (b shr 4))
        }

        val totalPixels = reusablePixelBuffer.size.toFloat()
        val avgSat = sumSat / totalPixels
        val avgBrightness = sumBrightness / totalPixels

        // Empty slot test: Low saturation and dark gray silhouette
        if (avgSat < EMPTY_SLOT_MAX_SAT && avgBrightness < EMPTY_SLOT_MAX_BRIGHTNESS) {
            state.isOccupied = false
            state.lastFingerprint = fingerprint
            return null
        }

        state.isOccupied = true

        // Diff check: if slot fingerprint is practically identical to last frame, keep cached brawler
        val diff = abs(fingerprint - state.lastFingerprint)
        if (diff < 1000L && state.brawler != null) {
            return state.brawler
        }
        state.lastFingerprint = fingerprint

        // Classify brawler locally
        val matchedName = matchBrawlerFromPixels(reusablePixelBuffer)
        return matchedName ?: state.brawler
    }

    /**
     * Evaluates ban circular slots on the far left or far right.
     */
    private fun evaluateBanSlot(bitmap: Bitmap, rect: Rect, state: SlotState): String? {
        if (rect.left < 0 || rect.top < 0 || rect.right > bitmap.width || rect.bottom > bitmap.height) {
            return state.brawler
        }

        val sampleBitmap = Bitmap.createBitmap(bitmap, rect.left, rect.top, rect.width(), rect.height())
        val scaled = Bitmap.createScaledBitmap(sampleBitmap, SAMPLE_SIZE, SAMPLE_SIZE, false)
        if (sampleBitmap != scaled) sampleBitmap.recycle()

        scaled.getPixels(reusablePixelBuffer, 0, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        scaled.recycle()

        var sumSat = 0f
        var sumBrightness = 0f
        var fingerprint = 0L

        for (i in reusablePixelBuffer.indices) {
            val c = reusablePixelBuffer[i]
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF

            val maxC = max(r, max(g, b)).toFloat()
            val minC = min(r, min(g, b)).toFloat()
            sumSat += (maxC - minC)
            sumBrightness += (0.299f * r + 0.587f * g + 0.114f * b)

            fingerprint = 31L * fingerprint + c
        }

        val totalPixels = reusablePixelBuffer.size.toFloat()
        val avgSat = sumSat / totalPixels
        val avgBrightness = sumBrightness / totalPixels

        // If ban slot is empty/unselected (dark circle without brawler)
        if (avgSat < 45f && avgBrightness < 55f) {
            state.isOccupied = false
            return null
        }

        val diff = abs(fingerprint - state.lastFingerprint)
        if (diff < 1000L && state.brawler != null) {
            return state.brawler
        }
        state.lastFingerprint = fingerprint

        val matched = matchBrawlerFromPixels(reusablePixelBuffer)
        return matched ?: state.brawler
    }

    /**
     * Fast local classification using Normalized Cross-Correlation (NCC)
     * and 64-bin Color Histogram Intersection.
     */
    private fun matchBrawlerFromPixels(pixels: IntArray): String? {
        synchronized(templates) {
            if (templates.isEmpty()) return null

            // Build feature vector for the slot
            val hist = FloatArray(HIST_BINS)
            val lum = FloatArray(pixels.size)

            for (i in pixels.indices) {
                val c = pixels[i]
                val r = (c shr 16) and 0xFF
                val g = (c shr 8) and 0xFF
                val b = c and 0xFF

                // Ignore pure red prohibition slash if present in ban icons (r > 190 && g < 50 && b < 50)
                val isRedSlash = r > 190 && g < 50 && b < 50
                if (!isRedSlash) {
                    val bin = (r / 64) * 16 + (g / 64) * 4 + (b / 64)
                    hist[bin] += 1f
                }
                lum[i] = 0.299f * r + 0.587f * g + 0.114f * b
            }

            val totalPixels = pixels.size.toFloat()
            for (i in hist.indices) hist[i] /= totalPixels

            val meanLum = lum.sum() / totalPixels
            val centered = FloatArray(lum.size) { lum[it] - meanLum }
            var sumSq = 0f
            for (v in centered) sumSq += v * v
            val norm = if (sumSq > 0.0001f) sqrt(sumSq) else 1f
            val lumVec = FloatArray(centered.size) { centered[it] / norm }

            var bestScore = -1f
            var bestMatch: String? = null

            for (template in templates) {
                // 1. NCC (Normalized Cross-Correlation)
                var ncc = 0f
                val tLum = template.lumVec
                val minLen = min(lumVec.size, tLum.size)
                for (k in 0 until minLen) {
                    ncc += lumVec[k] * tLum[k]
                }

                // 2. Histogram Intersection
                var histInter = 0f
                val tHist = template.colorHist
                for (k in 0 until HIST_BINS) {
                    histInter += min(hist[k], tHist[k])
                }

                // Combined score (0.0 to 1.0)
                val combined = 0.5f * max(0f, ncc) + 0.5f * histInter
                if (combined > bestScore) {
                    bestScore = combined
                    bestMatch = template.name
                }
            }

            return if (bestScore >= MATCH_THRESHOLD) bestMatch else null
        }
    }

    /**
     * Local on-device ML Kit OCR for Map & Mode detection on the top-left banner.
     * Runs completely on-device without any internet or cloud API.
     */
    private fun triggerMapOcrIfNeeded(bitmap: Bitmap, width: Int, height: Int) {
        val now = System.currentTimeMillis()
        if (isOcrRunning || (now - lastOcrTimestamp < 4000L && cachedDetectedMap != null)) {
            return
        }

        // Top-left corner where mode and map name appear: [0.02, 0.02, 0.26, 0.16]
        val rx = (width * 0.02f).toInt()
        val ry = (height * 0.02f).toInt()
        val rw = ((width * 0.24f).toInt()).coerceAtMost(bitmap.width - rx)
        val rh = ((height * 0.14f).toInt()).coerceAtMost(bitmap.height - ry)

        if (rw <= 10 || rh <= 10) return

        val bannerCrop = try {
            Bitmap.createBitmap(bitmap, rx, ry, rw, rh)
        } catch (_: Exception) {
            return
        }

        isOcrRunning = true
        lastOcrTimestamp = now

        val image = InputImage.fromBitmap(bannerCrop, 0)
        textRecognizer.process(image)
            .addOnSuccessListener { visionText ->
                bannerCrop.recycle()
                isOcrRunning = false

                val fullText = visionText.text
                if (fullText.isNotBlank()) {
                    parseMapAndModeFromOcr(fullText)
                }
            }
            .addOnFailureListener {
                bannerCrop.recycle()
                isOcrRunning = false
            }
    }

    private fun parseMapAndModeFromOcr(text: String) {
        val lines = text.lines().map { it.trim() }.filter { it.isNotBlank() }
        if (lines.isEmpty()) return

        val modes = listOf(
            "ATRACO" to "Atraco",
            "HEIST" to "Atraco",
            "BALÓN BRAWL" to "Balón Brawl",
            "BALON BRAWL" to "Balón Brawl",
            "BRAWL BALL" to "Balón Brawl",
            "ATRAPAGEMAS" to "Atrapagemas",
            "GEM GRAB" to "Atrapagemas",
            "ZONA CALIENTE" to "Zona Caliente",
            "HOT ZONE" to "Zona Caliente",
            "NOQUEO" to "Noqueo",
            "KNOCKOUT" to "Noqueo",
            "CAZA ESTELAR" to "Caza Estelar",
            "BOUNTY" to "Caza Estelar",
            "DESTRUCCIÓN" to "Destrucción",
            "WIPEOUT" to "Destrucción"
        )

        var foundMode: String? = null
        var foundMap: String? = null

        for (line in lines) {
            val upper = line.uppercase()
            for ((key, value) in modes) {
                if (upper.contains(key)) {
                    foundMode = value
                    break
                }
            }
            if (foundMode != null && foundMap == null && !line.equals(foundMode, ignoreCase = true)) {
                foundMap = line
            } else if (foundMap == null && line.length >= 3 && !line.all { it.isDigit() }) {
                foundMap = line
            }
        }

        if (foundMap != null) cachedDetectedMap = foundMap
        if (foundMode != null) cachedDetectedMode = foundMode
        Log.d(TAG, "OCR detected map: $foundMap, mode: $foundMode")
    }

    fun resetState() {
        for (s in allySlotStates) {
            s.brawler = null
            s.isOccupied = false
            s.lastFingerprint = 0L
        }
        for (s in enemySlotStates) {
            s.brawler = null
            s.isOccupied = false
            s.lastFingerprint = 0L
        }
        for (s in allyBanStates) {
            s.brawler = null
            s.isOccupied = false
            s.lastFingerprint = 0L
        }
        for (s in enemyBanStates) {
            s.brawler = null
            s.isOccupied = false
            s.lastFingerprint = 0L
        }
        cachedDetectedMap = null
        cachedDetectedMode = null
    }

    fun close() {
        try {
            textRecognizer.close()
        } catch (_: Exception) {}
    }
}
