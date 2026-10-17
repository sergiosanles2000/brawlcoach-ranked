import { AdMob, BannerAdSize, BannerAdPosition, type BannerAdOptions, type RewardAdOptions } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { logger } from './logger';

// Google Official Test IDs (Safe for testing without real ad accounts or bans)
// Banner: ca-app-pub-3940256099942544/6300978111
// Rewarded: ca-app-pub-3940256099942544/5224354917
const TEST_BANNER_ID = 'ca-app-pub-3940256099942544/6300978111';
const TEST_REWARDED_ID = 'ca-app-pub-3940256099942544/5224354917';

let isAdMobInitialized = false;
let isBannerShowing = false;

/**
 * Initializes AdMob service
 */
export async function initializeAdMob(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  if (isAdMobInitialized) return true;

  try {
    await AdMob.initialize({
      testingDevices: ['EMULATOR'],
      initializeForTesting: true,
    });
    isAdMobInitialized = true;
    logger.add('INFO', 'AdMob inicializado correctamente', 'Modo seguro');
    return true;
  } catch (err: any) {
    logger.add('ERROR', 'Error al inicializar AdMob', err?.message || String(err));
    return false;
  }
}

/**
 * Shows non-invasive adaptive banner at the bottom
 */
export async function showBottomBanner(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    await initializeAdMob();
    if (isBannerShowing) return true;

    const options: BannerAdOptions = {
      adId: TEST_BANNER_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: true,
    };

    await AdMob.showBanner(options);
    isBannerShowing = true;
    return true;
  } catch (err: any) {
    logger.add('INFO', 'Banner no disponible', err?.message || String(err));
    return false;
  }
}

/**
 * Hides bottom banner
 */
export async function hideBottomBanner(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isBannerShowing) return;
  try {
    await AdMob.hideBanner();
    isBannerShowing = false;
  } catch (err) {
    // Ignore hide errors
  }
}

/**
 * Shows voluntary rewarded video ad to support creator
 */
export async function showRewardedAdSupport(): Promise<{ rewarded: boolean; message: string }> {
  if (!Capacitor.isNativePlatform()) {
    return {
      rewarded: true,
      message: '¡Gracias por tu apoyo! En versión web/escritorio los anuncios están desactivados.',
    };
  }

  try {
    await initializeAdMob();

    const options: RewardAdOptions = {
      adId: TEST_REWARDED_ID,
      isTesting: true,
    };

    logger.add('INFO', 'Cargando anuncio bonificado...', 'Apoyo voluntario');
    await AdMob.prepareRewardVideoAd(options);
    const rewardItem = await AdMob.showRewardVideoAd();

    logger.add('SUCCESS', '¡Anuncio visto completamente!', `Recompensa: ${rewardItem?.type || 'Apoyo'}`);
    return {
      rewarded: true,
      message: '¡Muchísimas gracias por apoyar el desarrollo de la app! ❤️',
    };
  } catch (err: any) {
    logger.add('INFO', 'Anuncio no disponible en este momento', err?.message || String(err));
    return {
      rewarded: false,
      message: 'No hay anuncios disponibles en este momento. ¡Gracias de todos modos por intentarlo!',
    };
  }
}
