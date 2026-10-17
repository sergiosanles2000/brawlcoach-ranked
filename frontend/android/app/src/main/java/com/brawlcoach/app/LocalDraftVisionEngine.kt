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
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * 100% On-Device Visual Draft Detector for Brawl Stars.
 * - Detects Game Mode & Map Name locally via lightweight Play Services Text Recognition
 * - Diffing & state change detection (1-2 FPS)
 * - Identifies empty slots (question mark silhouette) vs locked picks
 * - Brawler template matching with 64-bin color histogram + RGB distance
 * - Zero cloud API calls, 0 latency, battery efficient
 */
class LocalDraftVisionEngine(private val context: Context) {

    companion object {
        private const val TAG = "LocalDraftVisionEngine"
        private const val SAMPLE_SIZE = 32
        private const val HIST_BINS = 64
        private const val MATCH_THRESHOLD = 0.62f
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
                Log.i(TAG, "Successfully loaded ${loadedList.size} local brawler templates.")
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

    fun processFrame(frameBitmap: Bitmap): DraftVisionResult {
        val width = frameBitmap.width
        val height = frameBitmap.height

        if (!isDraftScreen(frameBitmap, width, height)) {
            return DraftVisionResult(
                isDraftActive = false,
                allyPicks = arrayOfNulls(3),
                enemyPicks = arrayOfNulls(3),
                bans = emptyList(),
                hasChanges = false
            )
        }

        var changesDetected = false

        // ==========================================
        // 1. MONITOR ALLY PICKS (Bottom Left Row)
        // ==========================================
        val allyCoords = listOf(
            Rect((width * 0.120f).toInt(), (height * 0.740f).toInt(), (width * 0.235f).toInt(), (height * 0.980f).toInt()),
            Rect((width * 0.240f).toInt(), (height * 0.740f).toInt(), (width * 0.355f).toInt(), (height * 0.980f).toInt()),
            Rect((width * 0.360f).toInt(), (height * 0.740f).toInt(), (width * 0.475f).toInt(), (height * 0.980f).toInt())
        )

        val allyResult = arrayOfNulls<String>(3)
        for (i in 0..2) {
            val slotResult = evaluatePickSlot(frameBitmap, allyCoords[i], allySlotStates[i])
            if (slotResult != allySlotStates[i].brawler) {
                allySlotStates[i].brawler = slotResult
                changesDetected = true
            }
            allyResult[i] = slotResult
        }

        // ==========================================
        // 2. MONITOR ENEMY PICKS (Bottom Right Row)
        // ==========================================
        val enemyCoords = listOf(
            Rect((width * 0.530f).toInt(), (height * 0.740f).toInt(), (width * 0.645f).toInt(), (height * 0.980f).toInt()),
            Rect((width * 0.650f).toInt(), (height * 0.740f).toInt(), (width * 0.765f).toInt(), (height * 0.980f).toInt()),
            Rect((width * 0.770f).toInt(), (height * 0.740f).toInt(), (width * 0.885f).toInt(), (height * 0.980f).toInt())
        )

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
        val allyBanCoords = listOf(
            Rect((width * 0.040f).toInt(), (height * 0.760f).toInt(), (width * 0.095f).toInt(), (height * 0.835f).toInt()),
            Rect((width * 0.040f).toInt(), (height * 0.840f).toInt(), (width * 0.095f).toInt(), (height * 0.915f).toInt()),
            Rect((width * 0.040f).toInt(), (height * 0.920f).toInt(), (width * 0.095f).toInt(), (height * 0.995f).toInt())
        )

        val enemyBanCoords = listOf(
            Rect((width * 0.910f).toInt(), (height * 0.760f).toInt(), (width * 0.965f).toInt(), (height * 0.835f).toInt()),
            Rect((width * 0.910f).toInt(), (height * 0.840f).toInt(), (width * 0.965f).toInt(), (height * 0.915f).toInt()),
            Rect((width * 0.910f).toInt(), (height * 0.920f).toInt(), (width * 0.965f).toInt(), (height * 0.995f).toInt())
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
        // 4. MAP & MODE RECOGNITION FROM TOP-LEFT BANNER
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

    private fun isDraftScreen(bitmap: Bitmap, width: Int, height: Int): Boolean {
        if (width <= height) return false
        val cx = (width * 0.50f).toInt().coerceIn(0, width - 1)
        val cy = (height * 0.81f).toInt().coerceIn(0, height - 1)
        val p = bitmap.getPixel(cx, cy)
        val r = (p shr 16) and 0xFF
        val g = (p shr 8) and 0xFF
        val b = p and 0xFF
        return (r + g + b > 5)
    }

    /**
     * Evaluates whether a pick slot contains a locked brawler or an empty question mark.
     */
    private fun evaluatePickSlot(bitmap: Bitmap, rect: Rect, state: SlotState): String? {
        if (rect.left < 0 || rect.top < 0 || rect.right > bitmap.width || rect.bottom > bitmap.height) {
            return state.brawler
        }

        val cardW = rect.width()
        val cardH = rect.height()

        // 1. Check center 20% of card for dark gray question mark silhouette
        val cx1 = rect.left + (cardW * 0.40f).toInt()
        val cx2 = rect.left + (cardW * 0.60f).toInt()
        val cy1 = rect.top + (cardH * 0.35f).toInt()
        val cy2 = rect.top + (cardH * 0.55f).toInt()

        var sumCR = 0
        var sumCG = 0
        var sumCB = 0
        var countC = 0

        for (y in cy1..cy2 step 2) {
            for (x in cx1..cx2 step 2) {
                val p = bitmap.getPixel(x, y)
                sumCR += (p shr 16) and 0xFF
                sumCG += (p shr 8) and 0xFF
                sumCB += p and 0xFF
                countC++
            }
        }

        if (countC > 0) {
            val avgCR = sumCR / countC
            val avgCG = sumCG / countC
            val avgCB = sumCB / countC
            val centerLum = 0.299f * avgCR + 0.587f * avgCG + 0.114f * avgCB

            // Empty slot silhouette is dark gray/blue with low luminance
            if (avgCR in 20..70 && avgCG in 20..70 && avgCB in 50..105 && centerLum < 75) {
                return null
            }
        }

        // 2. Slot is occupied: crop brawler face/portrait
        val faceLeft = rect.left + (cardW * 0.18f).toInt()
        val faceRight = rect.left + (cardW * 0.85f).toInt()
        val faceTop = rect.top + (cardH * 0.10f).toInt()
        val faceBottom = rect.top + (cardH * 0.62f).toInt()

        val portraitCrop = Bitmap.createBitmap(bitmap, faceLeft, faceTop, faceRight - faceLeft, faceBottom - faceTop)
        val matched = matchBrawlerFromBitmap(portraitCrop)
        portraitCrop.recycle()

        return matched
    }

    private fun evaluateBanSlot(bitmap: Bitmap, rect: Rect, state: SlotState): String? {
        if (rect.left < 0 || rect.top < 0 || rect.right > bitmap.width || rect.bottom > bitmap.height) {
            return state.brawler
        }

        // Inner circle crop (removes red outer border)
        val w = rect.width()
        val h = rect.height()
        val cx = rect.left + w / 2
        val cy = rect.top + h / 2
        val rw = (w * 0.38f).toInt()
        val rh = (h * 0.38f).toInt()

        val innerLeft = (cx - rw).coerceAtLeast(0)
        val innerTop = (cy - rh).coerceAtLeast(0)
        val innerW = (rw * 2).coerceAtMost(bitmap.width - innerLeft)
        val innerH = (rh * 2).coerceAtMost(bitmap.height - innerTop)

        if (innerW <= 0 || innerH <= 0) return null

        val crop = Bitmap.createBitmap(bitmap, innerLeft, innerTop, innerW, innerH)
        val matched = matchBanFromBitmap(crop)
        crop.recycle()

        return matched
    }

    private fun matchBrawlerFromBitmap(bitmap: Bitmap): String? {
        val scaled = Bitmap.createScaledBitmap(bitmap, SAMPLE_SIZE, SAMPLE_SIZE, true)
        val pixels = IntArray(SAMPLE_SIZE * SAMPLE_SIZE)
        scaled.getPixels(pixels, 0, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        scaled.recycle()

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
        scaled.recycle()

        var sumR = 0f
        var sumG = 0f
        var sumB = 0f
        val hist = FloatArray(HIST_BINS)
        var validCount = 0

        for (c in pixels) {
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF

            // Filter out bright red slash pixels
            if (r > 155 && g < 70 && b < 70) continue

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

        return if (bestScore >= 0.58f) bestName else null
    }

    /**
     * Reads Game Mode and Map Name from the top-left banner using on-device ML Kit text recognition.
     */
    private fun detectMapAndModeFromBanner(bitmap: Bitmap, width: Int, height: Int): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastOcrTimestamp < 3000L && cachedDetectedMap != null) return false
        lastOcrTimestamp = now

        val bannerW = (width * 0.35f).toInt().coerceAtMost(bitmap.width)
        val bannerH = (height * 0.15f).toInt().coerceAtMost(bitmap.height)
        val bannerCrop = Bitmap.createBitmap(bitmap, 0, 0, bannerW, bannerH)

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

            // Fallback for mode keywords
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
                Log.i(TAG, "Recognized Map: $foundMap")
            }
            if (foundMode != null && foundMode != cachedDetectedMode) {
                cachedDetectedMode = foundMode
                changed = true
                Log.i(TAG, "Recognized Mode: $foundMode")
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
        } catch (_: Exception) {}
    }
}
