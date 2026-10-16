import { registerPlugin, Capacitor } from '@capacitor/core';

interface AppUpdaterPluginType {
  getAppVersion(): Promise<{ versionName: string; versionCode: number }>;
  downloadAndInstallApk(options: { apkUrl: string }): Promise<{ success: boolean }>;
}

export const AppUpdater = registerPlugin<AppUpdaterPluginType>('AppUpdater');

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  apkDownloadUrl: string;
}

// GitHub repository details
export const GITHUB_REPO = 'sergiosanles2000/brawlcoach-ranked';

/**
 * Checks GitHub Releases for a newer version compared to the currently installed app
 */
export async function checkForAppUpdates(): Promise<UpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }

  try {
    const { versionName } = await AppUpdater.getAppVersion();
    const currentVersion = versionName || '1.0.0';

    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const release = await response.json();
    const latestVersion = (release.tag_name || release.name || '').replace(/^v/, '').trim();
    if (!latestVersion) return null;

    // Compare versions (semver style)
    const isNewer = compareVersions(latestVersion, currentVersion) > 0;

    // Find .apk asset in release
    const apkAsset = release.assets?.find((a: any) =>
      typeof a.name === 'string' && a.name.endsWith('.apk')
    );

    const apkDownloadUrl = apkAsset ? apkAsset.browser_download_url : '';

    if (isNewer && apkDownloadUrl) {
      return {
        hasUpdate: true,
        currentVersion,
        latestVersion,
        releaseNotes: release.body || 'Correcciones de mapas y mejoras de rendimiento.',
        apkDownloadUrl,
      };
    }

    return {
      hasUpdate: false,
      currentVersion,
      latestVersion,
      releaseNotes: '',
      apkDownloadUrl: '',
    };
  } catch (err) {
    console.warn('[AutoUpdater] No se pudo verificar actualizaciones en GitHub:', err);
    return null;
  }
}

/**
 * Normalize any version string into standard [major, minor, patch] numbers.
 * Supports "1.0.2", "102", "v1.0.2", "v102", etc.
 */
function parseVersionNumbers(versionStr: string): number[] {
  const clean = versionStr.toLowerCase().replace(/^v/, '').trim();
  
  // If dot-separated (e.g. "1.0.2" or "1.0")
  if (clean.includes('.')) {
    const parts = clean.split('.').map((p) => parseInt(p, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts;
  }

  // If compact digits (e.g. "102" -> 1.0.2)
  if (/^\d{2,4}$/.test(clean)) {
    const digits = clean.split('').map((d) => parseInt(d, 10));
    if (digits.length === 3) {
      return [digits[0], digits[1], digits[2]]; // 102 -> [1, 0, 2]
    }
  }

  const singleNum = parseInt(clean, 10) || 0;
  return [singleNum, 0, 0];
}

/**
 * Compare two semver strings: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = parseVersionNumbers(v1);
  const parts2 = parseVersionNumbers(v2);

  const len = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * Downloads the APK and prompts the system PackageInstaller to update
 */
export async function downloadAndInstall(apkUrl: string): Promise<boolean> {
  try {
    const res = await AppUpdater.downloadAndInstallApk({ apkUrl });
    return res.success;
  } catch (err) {
    console.error('[AutoUpdater] Fallo al actualizar APK:', err);
    throw err;
  }
}
