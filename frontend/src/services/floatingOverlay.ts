import { registerPlugin, Capacitor } from '@capacitor/core';
import brawlPickData from '../data/brawlpick_maps.json';

interface FloatingOverlayPluginType {
  checkPermission(): Promise<{ hasPermission: boolean }>;
  requestPermission(): Promise<void>;
  startOverlay(options: {
    brawlersJson: string;
    countersJson: string;
    mapsJson: string;
    brawlPickJson: string;
    currentMapId: string;
    apiKey: string;
    model: string;
    playerProfileJson?: string;
  }): Promise<{ success: boolean }>;
  stopOverlay(): Promise<{ success: boolean }>;
  isOverlayRunning(): Promise<{ isRunning: boolean }>;
}

export const FloatingOverlay = registerPlugin<FloatingOverlayPluginType>('FloatingOverlay');

export async function launchFloatingModMenu({
  brawlers,
  counters,
  maps,
  currentMapId,
  apiKey,
  model,
  playerProfile,
}: {
  brawlers: any[];
  counters: any;
  maps: any[];
  currentMapId: string;
  apiKey: string;
  model: string;
  playerProfile?: any;
}) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('El Mod Menu Flotante solo está disponible en la app Android nativa.');
  }

  const { hasPermission } = await FloatingOverlay.checkPermission();
  if (!hasPermission) {
    await FloatingOverlay.requestPermission();
    return { needsPermission: true };
  }

  await FloatingOverlay.startOverlay({
    brawlersJson: JSON.stringify(brawlers),
    countersJson: JSON.stringify(counters),
    mapsJson: JSON.stringify(maps),
    brawlPickJson: JSON.stringify(brawlPickData),
    currentMapId,
    apiKey,
    model,
    playerProfileJson: playerProfile ? JSON.stringify(playerProfile) : undefined,
  });

  return { success: true };
}
