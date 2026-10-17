package com.brawlcoach.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            Context context = getContext();
            String versionName = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
            long versionCode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                versionCode = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).getLongVersionCode();
            } else {
                versionCode = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
            }

            JSObject ret = new JSObject();
            ret.put("versionName", versionName != null ? versionName : "1.0.0");
            ret.put("versionCode", versionCode);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Error obteniendo versión de la app: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String apkUrl = call.getString("apkUrl");
        if (apkUrl == null || apkUrl.isEmpty()) {
            call.reject("Falta la URL del archivo APK");
            return;
        }

        Context context = getContext();
        Activity activity = getActivity();
        if (context == null || activity == null) {
            call.reject("Contexto o actividad no disponible");
            return;
        }

        new Thread(() -> {
            try {
                URL currentUrl = new URL(apkUrl);
                HttpURLConnection downloadConn = null;
                int redirects = 0;
                while (redirects < 6) {
                    downloadConn = (HttpURLConnection) currentUrl.openConnection();
                    downloadConn.setInstanceFollowRedirects(true);
                    downloadConn.setRequestMethod("GET");
                    downloadConn.setConnectTimeout(20000);
                    downloadConn.setReadTimeout(60000);
                    downloadConn.setRequestProperty("User-Agent", "BrawlDraft-App");
                    downloadConn.connect();

                    int code = downloadConn.getResponseCode();
                    if (code == HttpURLConnection.HTTP_MOVED_PERM ||
                        code == HttpURLConnection.HTTP_MOVED_TEMP ||
                        code == HttpURLConnection.HTTP_SEE_OTHER ||
                        code == 307 || code == 308) {
                        String loc = downloadConn.getHeaderField("Location");
                        if (loc != null && !loc.isEmpty()) {
                            currentUrl = new URL(currentUrl, loc);
                            downloadConn.disconnect();
                            redirects++;
                            continue;
                        }
                    }
                    if (code != HttpURLConnection.HTTP_OK) {
                        final int finalCode = code;
                        activity.runOnUiThread(() -> call.reject("Error del servidor HTTP: " + finalCode));
                        return;
                    }
                    break;
                }

                File cacheDir = context.getExternalCacheDir() != null ? context.getExternalCacheDir() : context.getCacheDir();
                File apkFile = new File(cacheDir, "update.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                InputStream is = downloadConn.getInputStream();
                FileOutputStream fos = new FileOutputStream(apkFile);

                byte[] buffer = new byte[8192];
                int len;
                while ((len = is.read(buffer)) > 0) {
                    fos.write(buffer, 0, len);
                }

                fos.flush();
                fos.close();
                is.close();

                if (apkFile.length() < 1000000) {
                    activity.runOnUiThread(() -> call.reject("Error: El archivo descargado está incompleto (" + apkFile.length() + " bytes)"));
                    return;
                }

                // Launch Android Package Installer
                Uri apkUri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    apkFile
                );

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                context.startActivity(intent);

                activity.runOnUiThread(() -> {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    call.resolve(ret);
                });

            } catch (Exception e) {
                activity.runOnUiThread(() -> call.reject("Fallo al descargar o instalar: " + e.getMessage()));
            }
        }).start();
    }
}
