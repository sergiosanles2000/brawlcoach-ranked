import type { PlayerProfile } from '../types/brawl';
import sergioRealProfile from '../data/sergio_real_profile.json';

// In-app generator for player profile when running fully standalone in Android APK
export function generateStandalonePlayer(tag: string): PlayerProfile {
  const cleanTag = tag.trim().replace(/^#/, '').toUpperCase();
  
  if (cleanTag === 'GGJ2QLJY') {
    return sergioRealProfile as PlayerProfile;
  }
  
  // For other tags without network data
  return {
    isMock: true,
    tag: `#${cleanTag}`,
    name: `Jugador #${cleanTag}`,
    trophies: 0,
    highestTrophies: 0,
    expLevel: 1,
    brawlers: [],
    battles: [],
  };
}
