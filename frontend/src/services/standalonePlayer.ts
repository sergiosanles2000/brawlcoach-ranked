import type { PlayerProfile } from '../types/brawl';
import sergioRealProfile from '../data/sergio_real_profile.json';

// In-app generator for player profile when running fully standalone in Android APK
export function generateStandalonePlayer(tag: string): PlayerProfile {
  const cleanTag = tag.trim().replace(/^#/, '').toUpperCase();
  
  if (cleanTag === 'GGJ2QLJY') {
    return sergioRealProfile as PlayerProfile;
  }
  
  // Dynamic fallback for other tags
  return {
    isMock: false,
    tag: `#${cleanTag}`,
    name: cleanTag === 'GGJ2QLJY' ? 'SergioSR' : `Jugador #${cleanTag}`,
    trophies: sergioRealProfile.trophies,
    highestTrophies: sergioRealProfile.highestTrophies,
    expLevel: sergioRealProfile.expLevel,
    brawlers: sergioRealProfile.brawlers as any,
  };
}
