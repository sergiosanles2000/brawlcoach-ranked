package com.brawlcoach.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle

class CaptureTrampolineActivity : Activity() {

    companion object {
        private const val REQUEST_CODE = 8812

        fun start(context: Context) {
            val intent = Intent(context, CaptureTrampolineActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION or Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS)
            }
            context.startActivity(intent)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val captureIntent = projectionManager.createScreenCaptureIntent()
            startActivityForResult(captureIntent, REQUEST_CODE)
        } catch (e: Exception) {
            FloatingOverlayService.onScreenCapturePermissionDenied()
            finish()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_CODE) {
            if (resultCode == RESULT_OK && data != null) {
                FloatingOverlayService.onScreenCapturePermissionGranted(resultCode, data)
            } else {
                FloatingOverlayService.onScreenCapturePermissionDenied()
            }
            finish()
            overridePendingTransition(0, 0)
        }
    }
}
