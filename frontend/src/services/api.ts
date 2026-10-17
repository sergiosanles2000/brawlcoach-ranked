import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { PlayerProfile } from '../types/brawl';
import { generateStandalonePlayer } from './standalonePlayer';

// Fetches live profile for any player tag via Brawl Time Ninja public tRPC API,
// with immediate offline fallback to real cached data
export async function fetchPlayerProfile(tag: string): Promise<PlayerProfile> {
  const cleanTag = tag.trim().replace(/^#/, '').toUpperCase();
  if (!cleanTag) {
    throw new Error('Por favor ingresa un #TAG válido');
  }

  // 1. Query Brawl Time Ninja tRPC API
  // On native Android, use CapacitorHttp to bypass Android WebView CORS / Origin blocking!
  try {
    const inputParam = encodeURIComponent(JSON.stringify({ json: cleanTag }));
    const url = `https://brawltime.ninja/api/trpc/player.byTag?input=${inputParam}`;
    
    let raw: any = null;
    let isOk = false;
    let status = 0;

    if (Capacitor.isNativePlatform()) {
      const capRes = await CapacitorHttp.get({
        url,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Android; Mobile)'
        }
      });
      status = capRes.status;
      isOk = status >= 200 && status < 300;
      const data = typeof capRes.data === 'string' ? JSON.parse(capRes.data) : capRes.data;
      raw = data?.result?.data?.json;
      if (!isOk) {
        if (
          data?.error?.json?.data?.code === 'NOT_FOUND' ||
          data?.error?.json?.message?.toLowerCase().includes('not found') ||
          status === 404
        ) {
          throw new Error(`El tag #${cleanTag} no existe o no tiene partidas registradas en Brawl Stars.`);
        }
      }
    } else {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });
      status = response.status;
      isOk = response.ok;
      if (isOk) {
        const data = await response.json();
        raw = data?.result?.data?.json;
      } else {
        try {
          const errJson = await response.json();
          if (
            errJson?.error?.json?.data?.code === 'NOT_FOUND' ||
            errJson?.error?.json?.message?.toLowerCase().includes('not found') ||
            status === 404
          ) {
            throw new Error(`El tag #${cleanTag} no existe o no tiene partidas registradas en Brawl Stars.`);
          }
        } catch (parseErr: any) {
          if (parseErr.message?.includes('no existe')) {
            throw parseErr;
          }
        }
      }
    }
    if (raw && raw.brawlers) {
      const brawlers = Object.values(raw.brawlers).map((b: any) => ({
        id: b.id,
        name: (b.name || '').toUpperCase(),
        power: b.power || 1,
        rank: b.rank || 0,
        trophies: b.trophies || 0,
        highestTrophies: b.highestTrophies || 0,
        gears: (b.gears || []).map((g: any) => ({ id: g.id, name: g.name })),
        starPowers: (b.starPowers || []).map((s: any) => ({ id: s.id, name: s.name })),
        gadgets: (b.gadgets || []).map((g: any) => ({ id: g.id, name: g.name })),
      }));

      const battles = (raw.battles || []).map((bt: any) => ({
        timestamp: bt.timestamp,
        ranked: bt.ranked,
        victory: bt.victory,
        result: bt.result,
        event: bt.event ? {
          id: bt.event.id,
          mode: bt.event.mode,
          map: bt.event.map,
        } : undefined,
        teams: (bt.teams || []).map((tm: any[]) =>
          (tm || []).map((p: any) => ({
            tag: p.tag,
            name: p.name,
            brawler: p.brawler,
            brawlerTrophies: p.brawlerTrophies,
          }))
        ),
      }));

      const profile: PlayerProfile = {
        isMock: false,
        tag: `#${cleanTag}`,
        name: raw.name || cleanTag,
        trophies: raw.trophies || 0,
        highestTrophies: raw.highestTrophies || raw.trophies || 0,
        expLevel: raw.expLevel || 100,
        brawlers,
        battles,
      };

      // Save successfully fetched tag to localStorage
      try {
        localStorage.setItem('brawl_player_tag', cleanTag);
      } catch {}

      return profile;
    }
  } catch (err: any) {
    if (err.message && err.message.includes('no existe')) {
      throw err;
    }
    console.warn('[Player Profile] Direct network fetch failed, using fallback:', err);
  }

  // 2. Try local backend server if running
  try {
    const response = await fetch(`/api/player/${cleanTag}`);
    if (response.ok) {
      const data: PlayerProfile = await response.json();
      try {
        localStorage.setItem('brawl_player_tag', cleanTag);
      } catch {}
      return data;
    }
  } catch {
    // Ignore and proceed to standalone fallback
  }

  // 3. Standalone fallback (only uses Sergio's preloaded profile for his exact tag)
  return generateStandalonePlayer(cleanTag);
}
