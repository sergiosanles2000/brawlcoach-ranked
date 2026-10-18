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
 *      as exact offsets from (vs.cx, vs.cy) scaled by the screen height.
 *    - Seamlessly adapts to any phone aspect ratio (16:9, 19.5:9, 20:9, notch margins, black bars).
 * 3. State & Dual-Model Visual Classification:
 *    - Pick slots: evaluated against 107 portrait templates in assets/brawlers/.
 *      Luminance distribution & dark ratio distinguish empty question-mark slots from locked brawlers.
 *    - Ban slots: evaluated against 107 neutral pin templates in assets/brawler_pins/.
 *      Circular mask + team background filter + red badge rejection.
 * 4. Map & Mode Recognition:
 *    - Top banner OCR anchored on information button, scaled 2.5x for ML Kit Latin text recognition.
 */
class LocalDraftVisionEngine(private val context: Context) {

    companion object {
        private const val TAG = "LocalDraftVisionEngine"
        private const val SAMPLE_SIZE = 32
        private const val HIST_BINS = 64
        private const val PICK_MATCH_THRESHOLD = 0.58f
        private const val BAN_MATCH_THRESHOLD = 0.48f
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

    private val pickTemplates = mutableListOf<BrawlerTemplate>()
    private val banTemplates = mutableListOf<BrawlerTemplate>()
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

    // Comprehensive Spanish to English ranked map & mode dictionary
    private val mapTranslations = mapOf(
        // Hot Zone
        "pista ardiente" to Pair("Ring of Fire", "Hot Zone"),
        "anillo de fuego" to Pair("Ring of Fire", "Hot Zone"),
        "ring of fire" to Pair("Ring of Fire", "Hot Zone"),
        "escarabajos en duelo" to Pair("Dueling Beetles", "Hot Zone"),
        "dueling beetles" to Pair("Dueling Beetles", "Hot Zone"),
        "estrategias paralelas" to Pair("Parallel Plays", "Hot Zone"),
        "jugadas paralelas" to Pair("Parallel Plays", "Hot Zone"),
        "parallel plays" to Pair("Parallel Plays", "Hot Zone"),
        "negocio abierto" to Pair("Open Business", "Hot Zone"),
        "open business" to Pair("Open Business", "Hot Zone"),
        "viaje rápido" to Pair("Quick Travel", "Hot Zone"),
        "viaje rapido" to Pair("Quick Travel", "Hot Zone"),
        "quick travel" to Pair("Quick Travel", "Hot Zone"),
        "con cuidado" to Pair("Tread Carefully", "Hot Zone"),
        "tread carefully" to Pair("Tread Carefully", "Hot Zone"),
        "bajo presión" to Pair("Under Pressure", "Hot Zone"),
        "bajo presion" to Pair("Under Pressure", "Hot Zone"),
        "under pressure" to Pair("Under Pressure", "Hot Zone"),

        // Brawl Ball
        "estadio central" to Pair("Center Stage", "Brawl Ball"),
        "center stage" to Pair("Center Stage", "Brawl Ball"),
        "sueños de pinball" to Pair("Pinball Dreams", "Brawl Ball"),
        "suenos de pinball" to Pair("Pinball Dreams", "Brawl Ball"),
        "pinball dreams" to Pair("Pinball Dreams", "Brawl Ball"),
        "campos furtivos" to Pair("Sneaky Fields", "Brawl Ball"),
        "sneaky fields" to Pair("Sneaky Fields", "Brawl Ball"),
        "en espiral" to Pair("Spiraling Out", "Brawl Ball"),
        "spiraling out" to Pair("Spiraling Out", "Brawl Ball"),
        "triple regate" to Pair("Triple Dribble", "Brawl Ball"),
        "triple dribble" to Pair("Triple Dribble", "Brawl Ball"),
        "estadio furtivo" to Pair("Backyard Bowl", "Brawl Ball"),
        "backyard bowl" to Pair("Backyard Bowl", "Brawl Ball"),
        "pelota de playa" to Pair("Beach Ball", "Brawl Ball"),
        "beach ball" to Pair("Beach Ball", "Brawl Ball"),
        "nudo de hierba" to Pair("Grass Knot", "Brawl Ball"),
        "grass knot" to Pair("Grass Knot", "Brawl Ball"),
        "tiro de esquina" to Pair("Pinhole Punt", "Brawl Ball"),
        "pinhole punt" to Pair("Pinhole Punt", "Brawl Ball"),
        "fútbol soleado" to Pair("Sunny Soccer", "Brawl Ball"),
        "futbol soleado" to Pair("Sunny Soccer", "Brawl Ball"),
        "sunny soccer" to Pair("Sunny Soccer", "Brawl Ball"),
        "superplaya" to Pair("Super Beach", "Brawl Ball"),
        "super beach" to Pair("Super Beach", "Brawl Ball"),

        // Gem Grab
        "mina rocosa" to Pair("Hard Rock Mine", "Gem Grab"),
        "hard rock mine" to Pair("Hard Rock Mine", "Gem Grab"),
        "doble dilema" to Pair("Double Swoosh", "Gem Grab"),
        "doble curva" to Pair("Double Swoosh", "Gem Grab"),
        "fuerte de gemas" to Pair("Gem Fort", "Gem Grab"),
        "gem fort" to Pair("Gem Fort", "Gem Grab"),
        "double swoosh" to Pair("Double Swoosh", "Gem Grab"),
        "cueva subterránea" to Pair("Undermine", "Gem Grab"),
        "cueva subterranea" to Pair("Undermine", "Gem Grab"),
        "socavón" to Pair("Undermine", "Gem Grab"),
        "socavon" to Pair("Undermine", "Gem Grab"),
        "undermine" to Pair("Undermine", "Gem Grab"),

        // Heist
        "patata caliente" to Pair("Hot Potato", "Heist"),
        "hot potato" to Pair("Hot Potato", "Heist"),
        "zona segura" to Pair("Safe Zone", "Heist"),
        "safe zone" to Pair("Safe Zone", "Heist"),
        "cañón explosivo" to Pair("Kaboom Canyon", "Heist"),
        "canon explosivo" to Pair("Kaboom Canyon", "Heist"),
        "kaboom canyon" to Pair("Kaboom Canyon", "Heist"),
        "parada técnica" to Pair("Pit Stop", "Heist"),
        "parada tecnica" to Pair("Pit Stop", "Heist"),
        "pit stop" to Pair("Pit Stop", "Heist"),
        "aguas turbulentas" to Pair("Bridge Too Far", "Heist"),
        "un puente demasiado lejos" to Pair("Bridge Too Far", "Heist"),
        "bridge too far" to Pair("Bridge Too Far", "Heist"),

        // Knockout
        "fénix resplandeciente" to Pair("Flaring Phoenix", "Knockout"),
        "fenix resplandeciente" to Pair("Flaring Phoenix", "Knockout"),
        "fénix en llamas" to Pair("Flaring Phoenix", "Knockout"),
        "fenix en llamas" to Pair("Flaring Phoenix", "Knockout"),
        "flaring phoenix" to Pair("Flaring Phoenix", "Knockout"),
        "barranco de brazo dorado" to Pair("Goldarm Gulch", "Knockout"),
        "barranco del brazo de oro" to Pair("Goldarm Gulch", "Knockout"),
        "goldarm gulch" to Pair("Goldarm Gulch", "Knockout"),
        "nuevos horizontes" to Pair("New Horizons", "Knockout"),
        "new horizons" to Pair("New Horizons", "Knockout"),
        "a campo abierto" to Pair("Out in the Open", "Knockout"),
        "out in the open" to Pair("Out in the Open", "Knockout"),
        "roca de belle" to Pair("Belle's Rock", "Knockout"),
        "belle's rock" to Pair("Belle's Rock", "Knockout"),
        "doble piso" to Pair("Double Decker", "Knockout"),
        "double decker" to Pair("Double Decker", "Knockout"),
        "nueva perspectiva" to Pair("New Perspective", "Knockout"),
        "new perspective" to Pair("New Perspective", "Knockout"),
        "permanezcan de pie" to Pair("Please Remain Standing", "Knockout"),
        "please remain standing" to Pair("Please Remain Standing", "Knockout"),
        "piensa adelante" to Pair("Think Ahead", "Knockout"),
        "think ahead" to Pair("Think Ahead", "Knockout"),

        // Bounty
        "tiroteo estelar" to Pair("Shooting Star", "Bounty"),
        "estrella fugaz" to Pair("Shooting Star", "Bounty"),
        "shooting star" to Pair("Shooting Star", "Bounty"),
        "gran canal" to Pair("Canal Grande", "Bounty"),
        "canal grande" to Pair("Canal Grande", "Bounty"),
        "el escondite" to Pair("Hideout", "Bounty"),
        "hideout" to Pair("Hideout", "Bounty"),
        "estación seca" to Pair("Dry Season", "Bounty"),
        "estacion seca" to Pair("Dry Season", "Bounty"),
        "dry season" to Pair("Dry Season", "Bounty"),
        "pastel de capas" to Pair("Layer Cake", "Bounty"),
        "layer cake" to Pair("Layer Cake", "Bounty"),
        "sin excusas" to Pair("No Excuses", "Bounty"),
        "no excuses" to Pair("No Excuses", "Bounty"),
        "baya sabrosa" to Pair("Tasty Berry", "Bounty"),
        "tasty berry" to Pair("Tasty Berry", "Bounty"),

        // Wipeout
        "el tiempo vuela" to Pair("Time Flies", "Wipeout"),
        "time flies" to Pair("Time Flies", "Wipeout")
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

                // 2. Load 107 Brawler Portrait Templates (for Picks)
                val pickFiles = assetManager.list("brawlers") ?: emptyArray()
                val loadedPicks = mutableListOf<BrawlerTemplate>()
                for (filename in pickFiles) {
                    if (!filename.endsWith(".png", ignoreCase = true)) continue
                    val brawlerName = filename.substringBeforeLast(".png")
                    var inputStream: InputStream? = null
                    try {
                        inputStream = assetManager.open("brawlers/$filename")
                        val bitmap = BitmapFactory.decodeStream(inputStream)
                        if (bitmap != null) {
                            val template = extractPickTemplate(brawlerName, bitmap)
                            loadedPicks.add(template)
                            bitmap.recycle()
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Error loading pick template $filename: ${e.message}")
                    } finally {
                        try { inputStream?.close() } catch (_: Exception) {}
                    }
                }

                // 3. Load 107 Neutral Pin Templates (for Bans)
                val banFiles = assetManager.list("brawler_pins") ?: emptyArray()
                val loadedBans = mutableListOf<BrawlerTemplate>()
                for (filename in banFiles) {
                    if (!filename.endsWith(".png", ignoreCase = true)) continue
                    val brawlerName = filename.substringBeforeLast(".png")
                    var inputStream: InputStream? = null
                    try {
                        inputStream = assetManager.open("brawler_pins/$filename")
                        val bitmap = BitmapFactory.decodeStream(inputStream)
                        if (bitmap != null) {
                            val template = extractBanPinTemplate(brawlerName, bitmap)
                            if (template != null) {
                                loadedBans.add(template)
                            }
                            bitmap.recycle()
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Error loading ban pin template $filename: ${e.message}")
                    } finally {
                        try { inputStream?.close() } catch (_: Exception) {}
                    }
                }

                synchronized(this) {
                    pickTemplates.clear()
                    pickTemplates.addAll(loadedPicks)
                    banTemplates.clear()
                    banTemplates.addAll(loadedBans)
                    isTemplatesLoaded = true
                }
                Log.i(TAG, "Successfully loaded ${loadedPicks.size} pick templates and ${loadedBans.size} ban templates.")
            } catch (e: Exception) {
                Log.e(TAG, "Failed loading templates: ${e.message}")
            }
        }.start()
    }

    private fun extractPickTemplate(name: String, bitmap: Bitmap): BrawlerTemplate {
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

    private fun extractBanPinTemplate(name: String, bitmap: Bitmap): BrawlerTemplate? {
        val scaled = Bitmap.createScaledBitmap(bitmap, SAMPLE_SIZE, SAMPLE_SIZE, true)
        val pixels = IntArray(SAMPLE_SIZE * SAMPLE_SIZE)
        scaled.getPixels(pixels, 0, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        if (scaled != bitmap) scaled.recycle()

        var sumR = 0f
        var sumG = 0f
        var sumB = 0f
        var validCount = 0
        val hist = FloatArray(HIST_BINS)

        for (c in pixels) {
            val a = (c ushr 24) and 0xFF
            if (a < 50) continue // Skip transparent margins

            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
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

        return BrawlerTemplate(
            name = name,
            avgR = sumR / total,
            avgG = sumG / total,
            avgB = sumB / total,
            colorHist = hist
        )
    }

    /**
     * Finds the central "VS" emblem on the draft screen.
     * Uses template matching with normalized sum of absolute differences.
     * If not found with confidence > 0.55, returns null (not in draft phase).
     */
    fun findVsAnchor(frameBitmap: Bitmap): AnchorMatchResult? {
        val anchor = vsAnchorBitmap ?: return null
        val w = frameBitmap.width
        val h = frameBitmap.height

        val targetTh = (h * 0.088f).toInt().coerceAtLeast(16)
        val scale = targetTh.toFloat() / anchor.height.toFloat()
        val targetTw = (anchor.width * scale).toInt().coerceAtLeast(16)

        val scaledAnchor = Bitmap.createScaledBitmap(anchor, targetTw, targetTh, true)
        val anchorPixels = IntArray(targetTw * targetTh)
        scaledAnchor.getPixels(anchorPixels, 0, targetTw, 0, 0, targetTw, targetTh)
        if (scaledAnchor != anchor) scaledAnchor.recycle()

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

        // Search Region: y in [0.75 * h, 0.95 * h], x in [0.40 * w, 0.60 * w]
        val yMin = (h * 0.75f).toInt().coerceIn(0, h - targetTh)
        val yMax = (h * 0.95f).toInt().coerceIn(yMin, h - targetTh)
        val xMin = (w * 0.40f).toInt().coerceIn(0, w - targetTw)
        val xMax = (w * 0.60f).toInt().coerceIn(xMin, w - targetTw)

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

        // Relative metrics scaled strictly by screen height (consistent across aspect ratios)
        val cardW = (0.140f * height).toInt()
        val cardH = (0.200f * height).toInt()
        val cardTop = (vsCy - 0.100f * height).toInt()
        val cardBottom = cardTop + cardH

        val cardStep = 0.173f * height
        val innerOffset = 0.156f * height

        // 3 Ally Picks (to the left of VS: Ally 1 (leftmost), Ally 2 (mid), Ally 3 (rightmost))
        val allyCoords = listOf(
            Rect((vsCx - (innerOffset + 2 * cardStep) - cardW / 2).toInt(), cardTop, (vsCx - (innerOffset + 2 * cardStep) + cardW / 2).toInt(), cardBottom),
            Rect((vsCx - (innerOffset + 1 * cardStep) - cardW / 2).toInt(), cardTop, (vsCx - (innerOffset + 1 * cardStep) + cardW / 2).toInt(), cardBottom),
            Rect((vsCx - (innerOffset) - cardW / 2).toInt(), cardTop, (vsCx - (innerOffset) + cardW / 2).toInt(), cardBottom)
        )

        // 3 Enemy Picks (to the right of VS: Enemy 1 (leftmost), Enemy 2 (mid), Enemy 3 (rightmost))
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
        val allyBanCx = (vsCx - 0.659f * height).toInt()
        val enemyBanCx = (vsCx + 0.604f * height).toInt()
        val banRadius = (0.034f * height).toInt()

        val banTopY = (vsCy - 0.081f * height).toInt()
        val banMidY = vsCy
        val banBottomY = (vsCy + 0.074f * height).toInt()
        val banYs = listOf(banTopY, banMidY, banBottomY)

        val detectedBans = mutableListOf<String>()

        for (i in 0..2) {
            val banResult = evaluateBanSlot(frameBitmap, allyBanCx, banYs[i], banRadius, isAlly = true, state = allyBanStates[i])
            if (banResult != allyBanStates[i].brawler) {
                allyBanStates[i].brawler = banResult
                changesDetected = true
            }
            if (banResult != null && !detectedBans.contains(banResult)) {
                detectedBans.add(banResult)
            }
        }

        for (i in 0..2) {
            val banResult = evaluateBanSlot(frameBitmap, enemyBanCx, banYs[i], banRadius, isAlly = false, state = enemyBanStates[i])
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

        // 1. Portrait area: centers right on the brawler's face (skipping top "SIGUIENTE" badge, captain crown, level 11 badge, and bottom player name label)
        val faceLeft = clampedRect.left + (cardW * 0.15f).toInt()
        val faceRight = clampedRect.left + (cardW * 0.85f).toInt()
        val faceTop = clampedRect.top + (cardH * 0.30f).toInt()
        val faceBottom = clampedRect.top + (cardH * 0.75f).toInt()

        val portraitW = (faceRight - faceLeft).coerceIn(1, bitmap.width - faceLeft)
        val portraitH = (faceBottom - faceTop).coerceIn(1, bitmap.height - faceTop)

        // 2. Luminance distribution check for empty question-mark card
        var darkCount = 0
        var totalCount = 0
        var sumLum = 0f

        for (y in faceTop until faceBottom step 2) {
            for (x in faceLeft until faceRight step 2) {
                if (x in 0 until bitmap.width && y in 0 until bitmap.height) {
                    val p = bitmap.getPixel(x, y)
                    val r = (p shr 16) and 0xFF
                    val g = (p shr 8) and 0xFF
                    val b = p and 0xFF
                    val lum = 0.299f * r + 0.587f * g + 0.114f * b
                    if (lum < 85f) {
                        darkCount++
                    }
                    sumLum += lum
                    totalCount++
                }
            }
        }

        if (totalCount > 0) {
            val darkRatio = darkCount.toFloat() / totalCount.toFloat()
            val meanLum = sumLum / totalCount.toFloat()

            // Empty question-mark slots have > 82% dark pixels (< 85 lum) and mean luminance < 75
            if (darkRatio > 0.82f && meanLum < 75f) {
                return null
            }
        }

        // 3. Slot is occupied: crop brawler face and match against 107 pick templates
        val portraitCrop = Bitmap.createBitmap(bitmap, faceLeft, faceTop, portraitW, portraitH)
        val matched = matchPickFromBitmap(portraitCrop)
        portraitCrop.recycle()

        return matched
    }

    private fun evaluateBanSlot(bitmap: Bitmap, bcx: Int, bcy: Int, radius: Int, isAlly: Boolean, state: SlotState): String? {
        val left = (bcx - radius).coerceIn(0, bitmap.width)
        val right = (bcx + radius).coerceIn(0, bitmap.width)
        val top = (bcy - radius).coerceIn(0, bitmap.height)
        val bottom = (bcy + radius).coerceIn(0, bitmap.height)

        if (right - left <= 8 || bottom - top <= 8) return state.brawler

        val crop = Bitmap.createBitmap(bitmap, left, top, right - left, bottom - top)
        val matched = matchBanFromBitmap(crop, isAlly)
        crop.recycle()

        return matched
    }

    private fun matchPickFromBitmap(bitmap: Bitmap): String? {
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

        synchronized(this) {
            for (t in pickTemplates) {
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

        return if (bestScore >= PICK_MATCH_THRESHOLD) bestName else null
    }

    private fun matchBanFromBitmap(bitmap: Bitmap, isAlly: Boolean): String? {
        val cw = bitmap.width
        val ch = bitmap.height
        val ccx = cw / 2.0f
        val ccy = ch / 2.0f
        val rad = (min(cw, ch) / 2.0f) - 1f

        var sumR = 0f
        var sumG = 0f
        var sumB = 0f
        val hist = FloatArray(HIST_BINS)
        var validCount = 0

        for (y in 0 until ch) {
            for (x in 0 until cw) {
                val dx = x - ccx
                val dy = y - ccy
                if (dx * dx + dy * dy > rad * rad) continue

                // Exclude red prohibition slash / badge located at bottom-right
                if (dx > 1 && dy > 1) continue

                val p = bitmap.getPixel(x, y)
                val r = (p shr 16) and 0xFF
                val g = (p shr 8) and 0xFF
                val b = p and 0xFF

                // Exclude team background
                if (isAlly) {
                    if (b > 135 && r < 80 && g < 155) continue
                } else {
                    if (r > 135 && g < 50 && b < 80) continue
                }

                sumR += r
                sumG += g
                sumB += b
                val bin = (r / 64) * 16 + (g / 64) * 4 + (b / 64)
                hist[bin] += 1f
                validCount++
            }
        }

        // Empty ban slot has very few valid non-background pixels
        if (validCount < 15) return null

        val total = validCount.toFloat()
        for (i in hist.indices) hist[i] /= total
        val avgR = sumR / total
        val avgG = sumG / total
        val avgB = sumB / total

        var bestScore = -1f
        var bestName: String? = null

        synchronized(this) {
            for (t in banTemplates) {
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

        return if (bestScore >= BAN_MATCH_THRESHOLD) bestName else null
    }

    /**
     * Reads Game Mode and Map Name dynamically by anchoring on the top info button / banner.
     */
    private fun detectMapAndModeFromBanner(bitmap: Bitmap, width: Int, height: Int): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastOcrTimestamp < 2500L && cachedDetectedMap != null) return false
        lastOcrTimestamp = now

        // Find the blue 'i' info circle button (r < 40, g in [100, 180], b >= 200)
        var infoCx = -1
        var infoCy = -1
        var pCount = 0
        var pSumX = 0
        var pSumY = 0

        val scanH = (height * 0.18f).toInt()
        val scanXStart = (width * 0.10f).toInt()
        val scanXEnd = (width * 0.45f).toInt()

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
        val rawBanner = Bitmap.createBitmap(bitmap, cropLeft, cropTop, bannerW, bannerH)

        // Scale 2.5x with bilinear filter so small text like "Pista ardiente" is large enough for ML Kit
        val scaledBannerW = (bannerW * 2.5f).toInt()
        val scaledBannerH = (bannerH * 2.5f).toInt()
        val bannerCrop = Bitmap.createScaledBitmap(rawBanner, scaledBannerW, scaledBannerH, true)
        if (scaledBannerW != bannerW) rawBanner.recycle()

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
