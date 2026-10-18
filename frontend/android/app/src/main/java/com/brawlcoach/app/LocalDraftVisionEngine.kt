package com.brawlcoach.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.InputStream
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Visual Draft Detector for Brawl Stars with Anchor Matching + Dynamic Relative Geometry:
 * 1. Visual Anchor Matching:
 *    - Finds the central "VS" emblem (vs_anchor.png) in the bottom draft bar.
 *    - If no "VS" is found with sufficient confidence, the frame is skipped.
 * 2. Dynamic Relative Coordinate System:
 *    - All slots (3 Ally Picks, 3 Enemy Picks, 3 Ally Bans, 3 Enemy Bans) are calculated
 *      as exact offsets from (vs.cx, vs.cy) scaled by the screen height and anchor scale factor.
 *    - Seamlessly adapts to any phone aspect ratio (16:9, 19.5:9, 20:9, notch margins, black bars).
 * 3. State & Visual Classification:
 *    - Center saturation & luminance check distinguishes empty question-mark slots from locked brawlers.
 *    - Normalized color histogram + RGB distance template matching against 107 brawlers in assets.
 * 4. Map & Mode Recognition:
 *    - Banner OCR dynamically searches for the information button anchor to crop the map/mode header.
 */
class LocalDraftVisionEngine(private val context: Context) {

    companion object {
        private const val TAG = "LocalDraftVisionEngine"
        private const val SAMPLE_SIZE = 32
        private const val HIST_BINS = 64
        private const val MATCH_THRESHOLD = 0.58f
    }

    data class BrawlerTemplate(
        val name: String,
        val avgR: Float,
        val avgG: Float,
        val avgB: Float,
        val colorHist: FloatArray
    )

    data class SlotState(
        var brawler: String? = null,
        var lastFingerprint: Long = 0L,
        var isOccupied: Boolean = false
    )

    data class AnchorMatchResult(
        val cx: Int,
        val cy: Int,
        val scale: Float,
        val confidence: Float
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

    private var vsAnchorBitmap: Bitmap? = null

    private val allySlotStates = Array(3) { SlotState() }
    private val enemySlotStates = Array(3) { SlotState() }
    private val allyBanStates = Array(3) { SlotState() }
    private val enemyBanStates = Array(3) { SlotState() }

    private var lastOcrTimestamp = 0L
    private var cachedDetectedMap: String? = null
    private var cachedDetectedMode: String? = null

    private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    // Spanish to English ranked map & mode dictionary
    private val mapTranslations = mapOf(
        "pista ardiente" to Pair("Ring of Fire", "Hot Zone"),
        "ring of fire" to Pair("Ring of Fire", "Hot Zone"),
        "escarabajos en duelo" to Pair("Dueling Beetles", "Hot Zone"),
        "dueling beetles" to Pair("Dueling Beetles", "Hot Zone"),
        "estrategias paralelas" to Pair("Parallel Plays", "Hot Zone"),
        "parallel plays" to Pair("Parallel Plays", "Hot Zone"),
        "estadio central" to Pair("Center Stage", "Brawl Ball"),
        "center stage" to Pair("Center Stage", "Brawl Ball"),
        "sueños de pinball" to Pair("Pinball Dreams", "Brawl Ball"),
        "pinball dreams" to Pair("Pinball Dreams", "Brawl Ball"),
        "campos furtivos" to Pair("Sneaky Fields", "Brawl Ball"),
        "sneaky fields" to Pair("Sneaky Fields", "Brawl Ball"),
        "mina rocosa" to Pair("Hard Rock Mine", "Gem Grab"),
        "hard rock mine" to Pair("Hard Rock Mine", "Gem Grab"),
        "doble curva" to Pair("Double Swoosh", "Gem Grab"),
        "fuerte de gemas" to Pair("Double Swoosh", "Gem Grab"),
        "double swoosh" to Pair("Double Swoosh", "Gem Grab"),
        "socavón" to Pair("Undermine", "Gem Grab"),
        "undermine" to Pair("Undermine", "Gem Grab"),
        "patata caliente" to Pair("Hot Potato", "Heist"),
        "hot potato" to Pair("Hot Potato", "Heist"),
        "zona segura" to Pair("Safe Zone", "Heist"),
        "safe zone" to Pair("Safe Zone", "Heist"),
        "cañón explosivo" to Pair("Kaboom Canyon", "Heist"),
        "kaboom canyon" to Pair("Kaboom Canyon", "Heist"),
        "parada técnica" to Pair("Pit Stop", "Heist"),
        "pit stop" to Pair("Pit Stop", "Heist"),
        "aguas turbulentas" to Pair("Aguas Turbulentas", "Heist"),
        "fénix en llamas" to Pair("Flaring Phoenix", "Knockout"),
        "flaring phoenix" to Pair("Flaring Phoenix", "Knockout"),
        "barranco del brazo de oro" to Pair("Goldarm Gulch", "Knockout"),
        "goldarm gulch" to Pair("Goldarm Gulch", "Knockout"),
        "nuevos horizontes" to Pair("New Horizons", "Knockout"),
        "new horizons" to Pair("New Horizons", "Knockout"),
        "gran canal" to Pair("Canal Grande", "Bounty"),
        "canal grande" to Pair("Canal Grande", "Bounty"),
        "estrella fugaz" to Pair("Shooting Star", "Bounty"),
        "shooting star" to Pair("Shooting Star", "Bounty")
    )

    init {
        loadAnchorAndTemplatesAsync()
    }

    private fun loadAnchorAndTemplatesAsync() {
        Thread {
            try {
                val assetManager = context.assets

                // 1. Load VS Anchor Template
                try {
                    val vsStream = assetManager.open("vs_anchor.png")
                    vsAnchorBitmap = BitmapFactory.decodeStream(vsStream)
                    vsStream.close()
                    Log.i(TAG, "Loaded vs_anchor.png template: ${vsAnchorBitmap?.width}x${vsAnchorBitmap?.height}")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to load vs_anchor.png: ${e.message}")
                }

                // 2. Load 107 Brawler Templates (from brawlers/ or brawler_templates/)
                val folderName = if ((assetManager.list("brawlers")?.size ?: 0) > 0) "brawlers" else "brawler_templates"
                val files = assetManager.list(folderName) ?: emptyArray()
                val loadedList = mutableListOf<BrawlerTemplate>()

                for (filename in files) {
                    if (!filename.endsWith(".png", ignoreCase = true)) continue
                    val brawlerName = filename.substringBeforeLast(".png")
                    var inputStream: InputStream? = null
                    try {
                        inputStream = assetManager.open("$folderName/$filename")
                        val bitmap = BitmapFactory.decodeStream(inputStream)
                        if (bitmap != null) {
                            val template = extractTemplate(brawlerName, bitmap)
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
                Log.i(TAG, "Successfully loaded ${loadedList.size} local brawler templates from $folderName.")
            } catch (e: Exception) {
                Log.e(TAG, "Failed loading templates: ${e.message}")
            }
        }.start()
    }

    private fun extractTemplate(name: String, bitmap: Bitmap): BrawlerTemplate {
        val scaled = Bitmap.createScaledBitmap(bitmap, SAMPLE_SIZE, SAMPLE_SIZE, true)
        val pixels = IntArray(SAMPLE_SIZE * SAMPLE_SIZE)
        scaled.getPixels(pixels, 0, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        if (scaled != bitmap) scaled.recycle()

        var sumR = 0f
        var sumG = 0f
        var sumB = 0f
        val hist = FloatArray(HIST_BINS)

        for (c in pixels) {
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            sumR += r
            sumG += g
            sumB += b
            val bin = (r / 64) * 16 + (g / 64) * 4 + (b / 64)
            hist[bin] += 1f
        }

        val totalPixels = pixels.size.toFloat()
        for (i in hist.indices) hist[i] /= totalPixels

        return BrawlerTemplate(
            name = name,
            avgR = sumR / totalPixels,
            avgG = sumG / totalPixels,
            avgB = sumB / totalPixels,
            colorHist = hist
        )
    }

    /**
     * Finds the central "VS" emblem on the draft screen.
     * Uses template matching with normalized sum of absolute differences.
     * If not found with confidence > 0.65, returns null (not in draft phase).
     */
    fun findVsAnchor(frameBitmap: Bitmap): AnchorMatchResult? {
        val anchor = vsAnchorBitmap ?: return null
        val w = frameBitmap.width
        val h = frameBitmap.height

        // The VS logo is always centered between Blue & Red teams in the bottom draft zone
        // In landscape, expected VS height is ~0.088f * h
        val targetTh = (h * 0.088f).toInt().coerceAtLeast(16)
        val scale = targetTh.toFloat() / anchor.height.toFloat()
        val targetTw = (anchor.width * scale).toInt().coerceAtLeast(16)

        val scaledAnchor = Bitmap.createScaledBitmap(anchor, targetTw, targetTh, true)
        val anchorPixels = IntArray(targetTw * targetTh)
        scaledAnchor.getPixels(anchorPixels, 0, targetTw, 0, 0, targetTw, targetTh)
        if (scaledAnchor != anchor) scaledAnchor.recycle()

        // Subsample anchor pixels (step 2) for ultra-fast matching
        val sampledAnchorVals = mutableListOf<Int>()
        for (y in 0 until targetTh step 2) {
            for (x in 0 until targetTw step 2) {
                val p = anchorPixels[y * targetTw + x]
                val lum = ((p shr 16) and 0xFF) * 299 + ((p shr 8) and 0xFF) * 587 + (p and 0xFF) * 114
                sampledAnchorVals.add(lum / 1000)
            }
        }
        val sampleLen = sampledAnchorVals.size
        if (sampleLen == 0) return null

        // Search Region: y in [0.78 * h, 0.94 * h], x in [0.42 * w, 0.58 * w]
        val yMin = (h * 0.78f).toInt().coerceIn(0, h - targetTh)
        val yMax = (h * 0.94f).toInt().coerceIn(yMin, h - targetTh)
        val xMin = (w * 0.42f).toInt().coerceIn(0, w - targetTw)
        val xMax = (w * 0.58f).toInt().coerceIn(xMin, w - targetTw)

        var bestDiff = 999999
        var bestX = -1
        var bestY = -1

        for (y in yMin..yMax step 3) {
            for (x in xMin..xMax step 3) {
                var sad = 0
                var idx = 0
                for (ty in 0 until targetTh step 2) {
                    for (tx in 0 until targetTw step 2) {
                        val p = frameBitmap.getPixel(x + tx, y + ty)
                        val lum = (((p shr 16) and 0xFF) * 299 + ((p shr 8) and 0xFF) * 587 + (p and 0xFF) * 114) / 1000
                        sad += abs(lum - sampledAnchorVals[idx])
                        idx++
                    }
                }
                if (sad < bestDiff) {
                    bestDiff = sad
                    bestX = x
                    bestY = y
                }
            }
        }

        if (bestX == -1 || bestY == -1) return null

        val avgPixelDiff = bestDiff.toFloat() / sampleLen.toFloat()
        // avgPixelDiff: 0 is perfect match, < 45 is solid match
        val confidence = max(0f, 1f - (avgPixelDiff / 100f))

        return if (confidence >= 0.55f) {
            AnchorMatchResult(
                cx = bestX + targetTw / 2,
                cy = bestY + targetTh / 2,
                scale = scale,
                confidence = confidence
            )
        } else {
            null
        }
    }

    /**
     * Main entry point called on each video frame from MediaProjection (~1.5 FPS).
     */
    fun processFrame(frameBitmap: Bitmap): DraftVisionResult {
        val width = frameBitmap.width
        val height = frameBitmap.height

        if (width <= height) {
            return DraftVisionResult(
                isDraftActive = false,
                allyPicks = arrayOfNulls(3),
                enemyPicks = arrayOfNulls(3),
                bans = emptyList(),
                hasChanges = false
            )
        }

        // STEP 1: Locate Visual Anchor ("VS")
        val vsAnchor = findVsAnchor(frameBitmap)
        if (vsAnchor == null) {
            return DraftVisionResult(
                isDraftActive = false,
                allyPicks = arrayOfNulls(3),
                enemyPicks = arrayOfNulls(3),
                bans = emptyList(),
                hasChanges = false
            )
        }

        var changesDetected = false

        // STEP 2: Calculate Dynamic Relative Coordinates from VS Anchor (cx, cy)
        val vsCx = vsAnchor.cx
        val vsCy = vsAnchor.cy

        // Relative metrics scaled strictly by screen height (consistent in landscape)
        val cardW = (0.140f * height).toInt()
        val cardH = (0.200f * height).toInt()
        val cardTop = (vsCy - 0.100f * height).toInt()
        val cardBottom = cardTop + cardH

        val cardStep = 0.173f * height
        val innerOffset = 0.156f * height

        // 3 Ally Picks (to the left of VS: Ally 3, Ally 2, Ally 1)
        val allyCoords = listOf(
            Rect((vsCx - (innerOffset + 2 * cardStep) - cardW / 2).toInt(), cardTop, (vsCx - (innerOffset + 2 * cardStep) + cardW / 2).toInt(), cardBottom),
            Rect((vsCx - (innerOffset + 1 * cardStep) - cardW / 2).toInt(), cardTop, (vsCx - (innerOffset + 1 * cardStep) + cardW / 2).toInt(), cardBottom),
            Rect((vsCx - (innerOffset) - cardW / 2).toInt(), cardTop, (vsCx - (innerOffset) + cardW / 2).toInt(), cardBottom)
        )

        // 3 Enemy Picks (to the right of VS: Enemy 1, Enemy 2, Enemy 3)
        val enemyCoords = listOf(
            Rect((vsCx + (innerOffset) - cardW / 2).toInt(), cardTop, (vsCx + (innerOffset) + cardW / 2).toInt(), cardBottom),
            Rect((vsCx + (innerOffset + 1 * cardStep) - cardW / 2).toInt(), cardTop, (vsCx + (innerOffset + 1 * cardStep) + cardW / 2).toInt(), cardBottom),
            Rect((vsCx + (innerOffset + 2 * cardStep) - cardW / 2).toInt(), cardTop, (vsCx + (innerOffset + 2 * cardStep) + cardW / 2).toInt(), cardBottom)
        )

        // Monitor Ally Picks
        val allyResult = arrayOfNulls<String>(3)
        for (i in 0..2) {
            val slotResult = evaluatePickSlot(frameBitmap, allyCoords[i], allySlotStates[i])
            if (slotResult != allySlotStates[i].brawler) {
                allySlotStates[i].brawler = slotResult
                changesDetected = true
            }
            allyResult[i] = slotResult
        }

        // Monitor Enemy Picks
        val enemyResult = arrayOfNulls<String>(3)
        for (i in 0..2) {
            val slotResult = evaluatePickSlot(frameBitmap, enemyCoords[i], enemySlotStates[i])
            if (slotResult != enemySlotStates[i].brawler) {
                enemySlotStates[i].brawler = slotResult
                changesDetected = true
            }
            enemyResult[i] = slotResult
        }

        // ==========================================
        // 3. MONITOR BANS (Vertical Columns)
        // ==========================================
        val banRadius = (0.038f * height).toInt()
        val allyBanCx = (vsCx - 0.590f * height).toInt()
        val enemyBanCx = (vsCx + 0.590f * height).toInt()
        val banStepY = (0.075f * height).toInt()

        val allyBanCoords = listOf(
            Rect(allyBanCx - banRadius, vsCy - banStepY - banRadius, allyBanCx + banRadius, vsCy - banStepY + banRadius),
            Rect(allyBanCx - banRadius, vsCy - banRadius, allyBanCx + banRadius, vsCy + banRadius),
            Rect(allyBanCx - banRadius, vsCy + banStepY - banRadius, allyBanCx + banRadius, vsCy + banStepY + banRadius)
        )

        val enemyBanCoords = listOf(
            Rect(enemyBanCx - banRadius, vsCy - banStepY - banRadius, enemyBanCx + banRadius, vsCy - banStepY + banRadius),
            Rect(enemyBanCx - banRadius, vsCy - banRadius, enemyBanCx + banRadius, vsCy + banRadius),
            Rect(enemyBanCx - banRadius, vsCy + banStepY - banRadius, enemyBanCx + banRadius, vsCy + banStepY + banRadius)
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
        // 4. MAP & MODE RECOGNITION FROM TOP BANNER
        // ==========================================
        val mapChanged = detectMapAndModeFromBanner(frameBitmap, width, height)
        if (mapChanged) {
            changesDetected = true
        }

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
     * Evaluates whether a pick slot contains a locked brawler or an empty question mark.
     */
    private fun evaluatePickSlot(bitmap: Bitmap, rect: Rect, state: SlotState): String? {
        val clampedRect = Rect(
            rect.left.coerceIn(0, bitmap.width),
            rect.top.coerceIn(0, bitmap.height),
            rect.right.coerceIn(0, bitmap.width),
            rect.bottom.coerceIn(0, bitmap.height)
        )
        if (clampedRect.width() <= 10 || clampedRect.height() <= 10) return state.brawler

        val cardW = clampedRect.width()
        val cardH = clampedRect.height()

        // 1. Check center 30% of card for empty question-mark silhouette
        val cx1 = clampedRect.left + (cardW * 0.35f).toInt()
        val cx2 = clampedRect.left + (cardW * 0.65f).toInt()
        val cy1 = clampedRect.top + (cardH * 0.35f).toInt()
        val cy2 = clampedRect.top + (cardH * 0.65f).toInt()

        var sumCR = 0
        var sumCG = 0
        var sumCB = 0
        var countC = 0

        for (y in cy1..cy2 step 2) {
            for (x in cx1..cx2 step 2) {
                if (x in 0 until bitmap.width && y in 0 until bitmap.height) {
                    val p = bitmap.getPixel(x, y)
                    sumCR += (p shr 16) and 0xFF
                    sumCG += (p shr 8) and 0xFF
                    sumCB += p and 0xFF
                    countC++
                }
            }
        }

        if (countC > 0) {
            val avgCR = sumCR / countC
            val avgCG = sumCG / countC
            val avgCB = sumCB / countC
            val centerLum = 0.299f * avgCR + 0.587f * avgCG + 0.114f * avgCB

            // Empty slot question-mark background is dark gray/blue with low luminance (< 75)
            if (avgCR in 15..70 && avgCG in 20..75 && avgCB in 45..110 && centerLum < 75) {
                return null
            }
        }

        // 2. Slot is occupied: crop brawler face
        val faceLeft = clampedRect.left + (cardW * 0.15f).toInt()
        val faceRight = clampedRect.left + (cardW * 0.85f).toInt()
        val faceTop = clampedRect.top + (cardH * 0.08f).toInt()
        val faceBottom = clampedRect.top + (cardH * 0.65f).toInt()

        val portraitW = (faceRight - faceLeft).coerceIn(1, bitmap.width - faceLeft)
        val portraitH = (faceBottom - faceTop).coerceIn(1, bitmap.height - faceTop)

        val portraitCrop = Bitmap.createBitmap(bitmap, faceLeft, faceTop, portraitW, portraitH)
        val matched = matchBrawlerFromBitmap(portraitCrop)
        portraitCrop.recycle()

        return matched
    }

    private fun evaluateBanSlot(bitmap: Bitmap, rect: Rect, state: SlotState): String? {
        val clampedRect = Rect(
            rect.left.coerceIn(0, bitmap.width),
            rect.top.coerceIn(0, bitmap.height),
            rect.right.coerceIn(0, bitmap.width),
            rect.bottom.coerceIn(0, bitmap.height)
        )
        if (clampedRect.width() <= 8 || clampedRect.height() <= 8) return state.brawler

        // Check if slot has color saturation (a banned brawler has hair/face colors)
        var sumSat = 0f
        var count = 0
        for (y in clampedRect.top until clampedRect.bottom step 2) {
            for (x in clampedRect.left until clampedRect.right step 2) {
                val p = bitmap.getPixel(x, y)
                val r = (p shr 16) and 0xFF
                val g = (p shr 8) and 0xFF
                val b = p and 0xFF
                val mx = max(r, max(g, b))
                val mn = min(r, min(g, b))
                if (mx > 25) {
                    sumSat += (mx - mn).toFloat() / mx.toFloat()
                    count++
                }
            }
        }

        val avgSat = if (count > 0) sumSat / count.toFloat() else 0f
        // Empty slot is very low saturation or purely dark
        if (avgSat < 0.20f) return null

        val crop = Bitmap.createBitmap(bitmap, clampedRect.left, clampedRect.top, clampedRect.width(), clampedRect.height())
        val matched = matchBanFromBitmap(crop)
        crop.recycle()

        return matched
    }

    private fun matchBrawlerFromBitmap(bitmap: Bitmap): String? {
        val scaled = Bitmap.createScaledBitmap(bitmap, SAMPLE_SIZE, SAMPLE_SIZE, true)
        val pixels = IntArray(SAMPLE_SIZE * SAMPLE_SIZE)
        scaled.getPixels(pixels, 0, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        if (scaled != bitmap) scaled.recycle()

        var sumR = 0f
        var sumG = 0f
        var sumB = 0f
        val hist = FloatArray(HIST_BINS)

        for (c in pixels) {
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            sumR += r
            sumG += g
            sumB += b
            val bin = (r / 64) * 16 + (g / 64) * 4 + (b / 64)
            hist[bin] += 1f
        }

        val totalPixels = pixels.size.toFloat()
        for (i in hist.indices) hist[i] /= totalPixels
        val avgR = sumR / totalPixels
        val avgG = sumG / totalPixels
        val avgB = sumB / totalPixels

        var bestScore = -1f
        var bestName: String? = null

        synchronized(templates) {
            for (t in templates) {
                var histSim = 0f
                for (k in 0 until HIST_BINS) {
                    histSim += min(hist[k], t.colorHist[k])
                }

                val dist = sqrt(
                    (avgR - t.avgR) * (avgR - t.avgR) +
                    (avgG - t.avgG) * (avgG - t.avgG) +
                    (avgB - t.avgB) * (avgB - t.avgB)
                )
                val colorSim = max(0f, 1f - (dist / 200f))

                val combined = 0.6f * histSim + 0.4f * colorSim
                if (combined > bestScore) {
                    bestScore = combined
                    bestName = t.name
                }
            }
        }

        return if (bestScore >= MATCH_THRESHOLD) bestName else null
    }

    private fun matchBanFromBitmap(bitmap: Bitmap): String? {
        val scaled = Bitmap.createScaledBitmap(bitmap, SAMPLE_SIZE, SAMPLE_SIZE, true)
        val pixels = IntArray(SAMPLE_SIZE * SAMPLE_SIZE)
        scaled.getPixels(pixels, 0, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        if (scaled != bitmap) scaled.recycle()

        var sumR = 0f
        var sumG = 0f
        var sumB = 0f
        val hist = FloatArray(HIST_BINS)
        var validCount = 0

        for (c in pixels) {
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF

            // Filter out team red/blue background
            if (r > 150 && g < 65 && b < 85) continue
            if (b > 150 && r < 65 && g < 150) continue
            // Filter out red prohibition slash
            if (r > 175 && g < 40 && b < 40) continue

            sumR += r
            sumG += g
            sumB += b
            val bin = (r / 64) * 16 + (g / 64) * 4 + (b / 64)
            hist[bin] += 1f
            validCount++
        }

        if (validCount == 0) return null

        val total = validCount.toFloat()
        for (i in hist.indices) hist[i] /= total
        val avgR = sumR / total
        val avgG = sumG / total
        val avgB = sumB / total

        var bestScore = -1f
        var bestName: String? = null

        synchronized(templates) {
            for (t in templates) {
                var histSim = 0f
                for (k in 0 until HIST_BINS) {
                    histSim += min(hist[k], t.colorHist[k])
                }

                val dist = sqrt(
                    (avgR - t.avgR) * (avgR - t.avgR) +
                    (avgG - t.avgG) * (avgG - t.avgG) +
                    (avgB - t.avgB) * (avgB - t.avgB)
                )
                val colorSim = max(0f, 1f - (dist / 200f))

                val combined = 0.6f * histSim + 0.4f * colorSim
                if (combined > bestScore) {
                    bestScore = combined
                    bestName = t.name
                }
            }
        }

        return if (bestScore >= 0.50f) bestName else null
    }

    /**
     * Reads Game Mode and Map Name dynamically by anchoring on the top info button / banner.
     */
    private fun detectMapAndModeFromBanner(bitmap: Bitmap, width: Int, height: Int): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastOcrTimestamp < 3000L && cachedDetectedMap != null) return false
        lastOcrTimestamp = now

        // Find the blue 'i' info circle button (r < 40, g in [100, 180], b >= 200)
        var infoCx = -1
        var infoCy = -1
        var pCount = 0
        var pSumX = 0
        var pSumY = 0

        val scanH = (height * 0.18f).toInt()
        val scanXStart = (width * 0.12f).toInt()
        val scanXEnd = (width * 0.42f).toInt()

        for (y in 2 until scanH step 2) {
            for (x in scanXStart until scanXEnd step 2) {
                val p = bitmap.getPixel(x, y)
                val r = (p shr 16) and 0xFF
                val g = (p shr 8) and 0xFF
                val b = p and 0xFF
                if (r < 40 && g in 100..180 && b >= 200) {
                    pSumX += x
                    pSumY += y
                    pCount++
                }
            }
        }

        val cropLeft: Int
        val cropRight: Int
        val cropTop: Int
        val cropBottom: Int

        if (pCount > 10) {
            infoCx = pSumX / pCount
            infoCy = pSumY / pCount
            cropRight = infoCx - 5
            cropLeft = (infoCx - 0.28f * height).toInt().coerceAtLeast(0)
            cropTop = 0
            cropBottom = (infoCy + 0.10f * height).toInt().coerceAtMost(height)
        } else {
            cropLeft = 0
            cropRight = (width * 0.45f).toInt()
            cropTop = 0
            cropBottom = (height * 0.20f).toInt()
        }

        val bannerW = (cropRight - cropLeft).coerceIn(10, width)
        val bannerH = (cropBottom - cropTop).coerceIn(10, height)
        val bannerCrop = Bitmap.createBitmap(bitmap, cropLeft, cropTop, bannerW, bannerH)

        return try {
            val image = InputImage.fromBitmap(bannerCrop, 0)
            val task = textRecognizer.process(image)
            val result = Tasks.await(task)
            bannerCrop.recycle()

            val text = result.text.lowercase().replace("\n", " ").trim()
            if (text.isBlank()) return false

            var foundMap: String? = null
            var foundMode: String? = null

            for ((keyword, mapping) in mapTranslations) {
                if (text.contains(keyword)) {
                    foundMap = mapping.first
                    foundMode = mapping.second
                    break
                }
            }

            if (foundMode == null) {
                when {
                    text.contains("balon") || text.contains("brawl ball") || text.contains("fútbol") -> foundMode = "Brawl Ball"
                    text.contains("restringida") || text.contains("hot zone") || text.contains("caliente") -> foundMode = "Hot Zone"
                    text.contains("gem") || text.contains("atrapagemas") -> foundMode = "Gem Grab"
                    text.contains("atraco") || text.contains("heist") -> foundMode = "Heist"
                    text.contains("noqueo") || text.contains("knockout") -> foundMode = "Knockout"
                    text.contains("caza") || text.contains("bounty") || text.contains("estelar") -> foundMode = "Bounty"
                }
            }

            var changed = false
            if (foundMap != null && foundMap != cachedDetectedMap) {
                cachedDetectedMap = foundMap
                changed = true
                Log.i(TAG, "Recognized Map dynamically: $foundMap")
            }
            if (foundMode != null && foundMode != cachedDetectedMode) {
                cachedDetectedMode = foundMode
                changed = true
                Log.i(TAG, "Recognized Mode dynamically: $foundMode")
            }

            changed
        } catch (e: Exception) {
            bannerCrop.recycle()
            Log.w(TAG, "Banner OCR error: ${e.message}")
            false
        }
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
            vsAnchorBitmap?.recycle()
        } catch (_: Exception) {}
    }
}
