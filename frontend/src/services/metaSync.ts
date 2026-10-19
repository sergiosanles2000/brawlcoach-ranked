import type { Brawler, CountersMap } from '../types/brawl';
import defaultBrawlersData from '../data/brawlers.json';

const bundledBrawlers = defaultBrawlersData as Brawler[];
const bundledBrawlersByName = new Map(bundledBrawlers.map((b) => [b.displayName.toUpperCase(), b]));

/**
 * Keeps the Spanish (Spain) descriptions and ability names from the bundled
 * dataset even after syncing with the API (the API only serves English text
 * and "x" placeholders).
 */
function withLocalizedText(brawler: Brawler): Brawler {
  const local = bundledBrawlersByName.get((brawler.displayName || '').toUpperCase());
  if (!local) return brawler;

  const localGadgets = new Map((local.gadgets || []).map((g) => [g.id, g]));
  const localStarPowers = new Map((local.starPowers || []).map((s) => [s.id, s]));

  return {
    ...brawler,
    description: local.description || brawler.description,
    gadgets: (brawler.gadgets || []).map((g) => {
      const localized = localGadgets.get(g.id);
      return localized
        ? { ...g, name: localized.name, description: localized.description }
        : g;
    }),
    starPowers: (brawler.starPowers || []).map((s) => {
      const localized = localStarPowers.get(s.id);
      return localized
        ? { ...s, name: localized.name, description: localized.description }
        : s;
    }),
  };
}

export const STORAGE_META_BRAWLERS = 'brawl_meta_brawlers';
export const STORAGE_META_COUNTERS = 'brawl_meta_counters';
export const STORAGE_META_UPDATED_AT = 'brawl_meta_last_updated';

const PRIMARY_BRAWLERS_API = 'https://api.brawlapi.com/v1/brawlers';
const FALLBACK_BRAWLERS_API = 'https://api.brawlify.com/v1/brawlers';

// Archetype rules for computing interactions on the fly
const ARCHETYPE_RULES: Record<
  string,
  { counters: string[]; counteredBy: string[]; synergies: string[] }
> = {
  Tank: {
    counters: ['Assassin'],
    counteredBy: ['Damage Dealer', 'Controller'],
    synergies: ['Support', 'Controller'],
  },
  Assassin: {
    counters: ['Marksman', 'Artillery'],
    counteredBy: ['Tank', 'Controller'],
    synergies: ['Support', 'Controller'],
  },
  Marksman: {
    counters: ['Artillery', 'Damage Dealer'],
    counteredBy: ['Assassin'],
    synergies: ['Controller', 'Tank'],
  },
  Artillery: {
    counters: ['Tank'],
    counteredBy: ['Assassin'],
    synergies: ['Tank', 'Controller'],
  },
  'Damage Dealer': {
    counters: ['Tank'],
    counteredBy: ['Marksman', 'Assassin'],
    synergies: ['Tank', 'Support'],
  },
  Controller: {
    counters: ['Tank', 'Assassin'],
    counteredBy: ['Marksman', 'Artillery'],
    synergies: ['Damage Dealer', 'Assassin'],
  },
  Support: {
    counters: [],
    counteredBy: ['Assassin'],
    synergies: ['Tank', 'Damage Dealer'],
  },
};

// Known key specific matchups in the Ranked meta
const SPECIFIC_MATCHUPS: Record<
  string,
  { counters?: string[]; counteredBy?: string[]; synergies?: string[] }
> = {
  Shelly: {
    counters: ['Mortis', 'Edgar', 'Buzz', 'Bull', 'El Primo', 'Fang', 'Kenji', 'Mico', 'Draco', 'Darryl'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Bea', 'Tick', 'Larry & Lawrie', 'Nani'],
    synergies: ['Max', 'Gene', 'Sandy', 'Tara'],
  },
  Colt: {
    counters: ['Frank', '8-Bit', 'Bull', 'El Primo', 'Pam', 'Meg'],
    counteredBy: ['Piper', 'Nani', 'Belle', 'Leon', 'Mortis', 'Edgar'],
    synergies: ['Max', 'Buster', 'Belle'],
  },
  Bull: {
    counters: ['Mortis', 'Frank', 'Rosa', 'Poco', 'Byron'],
    counteredBy: ['Colette', 'Surge', 'Gale', 'Shelly', 'Otis', 'Bea', 'Clancy', 'Emz'],
    synergies: ['Poco', 'Byron', 'Max', 'Buster'],
  },
  Brock: {
    counters: ['Dynamike', 'Barley', 'Emz', '8-Bit', 'Bo', 'Tick'],
    counteredBy: ['Leon', 'Edgar', 'Mortis', 'Piper', 'Angelo', 'Mico', 'Lily'],
    synergies: ['Belle', 'Gene', 'Buster'],
  },
  'El Primo': {
    counters: ['Frank', 'Rosa', 'Mortis', 'Buster'],
    counteredBy: ['Colette', 'Gale', 'Surge', 'Shelly', 'Bea', 'Clancy', 'Otis', 'Griff'],
    synergies: ['Poco', 'Byron', 'Sandy'],
  },
  Barley: {
    counters: ['Frank', 'Rosa', '8-Bit', 'Pam', 'Bull'],
    counteredBy: ['Edgar', 'Mortis', 'Mico', 'Leon', 'Lily', 'Fang', 'Kenji'],
    synergies: ['Buster', 'Rosa', 'Frank'],
  },
  Poco: {
    counters: ['Gene', 'Sandy', 'Leon'],
    counteredBy: ['Frank', 'Colette', 'Piper', 'Belle', 'Edgar'],
    synergies: ['Frank', 'Buster', 'Draco', 'Bull', 'Rosa', 'El Primo'],
  },
  Dynamike: {
    counters: ['Frank', 'Rosa', 'Bull', '8-Bit', 'Bo'],
    counteredBy: ['Mortis', 'Edgar', 'Mico', 'Leon', 'Lily', 'Fang', 'Kenji', 'Cordelius'],
    synergies: ['Buster', 'Poco', 'Frank'],
  },
  Piper: {
    counters: ['Brock', 'Bea', 'Colt', 'Bo', 'Emz', 'Dynamike', 'Penny', 'Pam'],
    counteredBy: ['Leon', 'Nani', 'Edgar', 'Mortis', 'Lily', 'Mico', 'Kenji', 'Cordelius'],
    synergies: ['Gene', 'Buster', 'Belle', 'Max', 'Byron'],
  },
  Mortis: {
    counters: ['Dynamike', 'Barley', 'Tick', 'Sprout', 'Grom', 'Larry & Lawrie', 'Piper', 'Brock', 'Bea', 'Belle', 'Byron'],
    counteredBy: ['Shelly', 'Bull', 'El Primo', 'Frank', 'Rosa', 'Buster', 'Surge', 'Gale', 'Clancy', 'Otis', 'Jacky'],
    synergies: ['Max', 'Gene', 'Sandy', 'Poco'],
  },
  Colette: {
    counters: ['Frank', 'Bull', 'El Primo', 'Rosa', 'Buster', 'Draco', 'Hank', 'Ash', '8-Bit', 'Pam', 'Meg'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Leon', 'Edgar', 'Mortis', 'Lily', 'Mandy'],
    synergies: ['Gene', 'Sandy', 'Buster', 'Piper'],
  },
  Gale: {
    counters: ['Edgar', 'Mortis', 'Buzz', 'Bull', 'El Primo', 'Frank', 'Fang', 'Mico', 'Kenji', 'Draco', 'Darryl', 'Lily'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Brock', 'Nani', 'Mandy'],
    synergies: ['Colette', 'Piper', 'Sandy', 'Belle'],
  },
  Surge: {
    counters: ['Edgar', 'Mortis', 'Buzz', 'Bull', 'El Primo', 'Frank', 'Fang', 'Mico', 'Darryl', 'Kenji'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Brock', 'Tick', 'Bea', 'Mandy'],
    synergies: ['Max', 'Gene', 'Buster'],
  },
  Clancy: {
    counters: ['Frank', 'Bull', 'El Primo', 'Rosa', 'Buster', 'Draco', 'Ash', 'Hank', 'Jacky', 'Darryl'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Nani', 'Brock', 'Tick', 'Sprout'],
    synergies: ['Max', 'Buster', 'Poco', 'Gene'],
  },
  Kenji: {
    counters: ['Dynamike', 'Barley', 'Tick', 'Piper', 'Brock', 'Bea', 'Belle', 'Grom', 'Sprout'],
    counteredBy: ['Shelly', 'Bull', 'Gale', 'Surge', 'Otis', 'Frank', 'Chester'],
    synergies: ['Poco', 'Byron', 'Max', 'Gene'],
  },
  Frank: {
    counters: ['Poco', 'Sandy', 'Gene', 'Pam', 'Nita', 'Ash'],
    counteredBy: ['Colette', 'Surge', 'Gale', 'Shelly', 'Clancy', 'Otis', 'Bea', 'Griff', 'Emz', 'Lou', 'Chester'],
    synergies: ['Poco', 'Byron', 'Max', 'Kit'],
  },
  Draco: {
    counters: ['Mortis', 'Poco', 'Gene', 'Sandy', 'Nita'],
    counteredBy: ['Colette', 'Surge', 'Gale', 'Clancy', 'Otis', 'Shelly', 'Bea'],
    synergies: ['Poco', 'Byron', 'Kit', 'Max'],
  },
  Lily: {
    counters: ['Piper', 'Belle', 'Angelo', 'Brock', 'Dynamike', 'Tick', 'Barley', 'Mandy'],
    counteredBy: ['Shelly', 'Bull', 'Buster', 'Rosa', 'Gale', 'Surge', 'Frank'],
    synergies: ['Max', 'Gene', 'Tara'],
  },
  Berry: {
    counters: ['Frank', 'Rosa', '8-Bit', 'Bull', 'Pam'],
    counteredBy: ['Mortis', 'Edgar', 'Mico', 'Lily', 'Kenji', 'Leon'],
    synergies: ['Frank', 'Buster', 'Draco', 'Bull'],
  },
  Moe: {
    counters: ['Frank', 'Rosa', '8-Bit', 'Pam', 'Meg'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Edgar', 'Mortis'],
    synergies: ['Gene', 'Sandy', 'Buster'],
  },
};

export async function syncMetaFromApi(): Promise<{
  brawlers: Brawler[];
  counters: CountersMap;
  lastUpdated: string;
}> {
  let rawBrawlers: any[] = [];

  try {
    const res = await fetch(PRIMARY_BRAWLERS_API);
    if (res.ok) {
      const data = await res.json();
      rawBrawlers = data.list || [];
    }
  } catch {
    // Fallback attempt
    try {
      const res = await fetch(FALLBACK_BRAWLERS_API);
      if (res.ok) {
        const data = await res.json();
        rawBrawlers = data.list || [];
      }
    } catch (e: any) {
      throw new Error('No se pudo conectar con la API de Brawlify/BrawlAPI: ' + e.message);
    }
  }

  if (rawBrawlers.length === 0) {
    throw new Error('La API devolvió una lista vacía de brawlers.');
  }

  // Format into clean Brawler objects
  const brawlers: Brawler[] = rawBrawlers.map((b) => {
    const rawClass = b.class?.name || 'Damage Dealer';
    let range = 'Mid';
    if (rawClass === 'Marksman' || rawClass === 'Artillery') range = 'Long';
    else if (rawClass === 'Tank' || rawClass === 'Assassin') range = 'Short';

    return {
      id: b.id,
      name: (b.name || '').toUpperCase(),
      displayName: b.name || '',
      rarity: b.rarity?.name || 'Rare',
      class: rawClass,
      attackRange: range,
      hasHypercharge: Boolean(b.starPowers && b.starPowers.length > 0),
      iconUrl:
        b.imageUrl2 ||
        b.imageUrl ||
        `https://cdn.brawlify.com/brawlers/borderless/${b.id}.png`,
      modelUrl: `https://cdn.brawlify.com/brawlers/model/${b.id}.png`,
      gadgets: (b.gadgets || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        imageUrl: g.imageUrl || `https://cdn.brawlify.com/gadgets/borderless/${g.id}.png`,
        description: g.description,
      })),
      starPowers: (b.starPowers || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        imageUrl: s.imageUrl || `https://cdn.brawlify.com/star-powers/borderless/${s.id}.png`,
        description: s.description,
      })),
    };
  }).map(withLocalizedText);

  // Group by class for archetypal resolution
  const brawlersByClass: Record<string, string[]> = {};
  brawlers.forEach((b) => {
    if (!brawlersByClass[b.class]) brawlersByClass[b.class] = [];
    brawlersByClass[b.class].push(b.displayName);
  });

  // Build full counters map
  const counters: CountersMap = {};
  brawlers.forEach((b) => {
    const name = b.displayName;
    const bClass = b.class;
    const rule = ARCHETYPE_RULES[bClass] || ARCHETYPE_RULES['Damage Dealer'];
    const specific = SPECIFIC_MATCHUPS[name] || {};

    const countersSet = new Set(specific.counters || []);
    const counteredBySet = new Set(specific.counteredBy || []);
    const synergiesSet = new Set(specific.synergies || []);

    if (countersSet.size < 5) {
      for (const targetClass of rule.counters) {
        const pool = brawlersByClass[targetClass] || [];
        for (const candidate of pool) {
          if (candidate !== name && !counteredBySet.has(candidate)) {
            countersSet.add(candidate);
            if (countersSet.size >= 8) break;
          }
        }
      }
    }

    if (counteredBySet.size < 5) {
      for (const threatClass of rule.counteredBy) {
        const pool = brawlersByClass[threatClass] || [];
        for (const threat of pool) {
          if (threat !== name && !countersSet.has(threat)) {
            counteredBySet.add(threat);
            if (counteredBySet.size >= 8) break;
          }
        }
      }
    }

    if (synergiesSet.size < 4) {
      for (const partnerClass of rule.synergies) {
        const pool = brawlersByClass[partnerClass] || [];
        for (const partner of pool) {
          if (partner !== name) {
            synergiesSet.add(partner);
            if (synergiesSet.size >= 6) break;
          }
        }
      }
    }

    counters[name] = {
      counters: Array.from(countersSet),
      counteredBy: Array.from(counteredBySet),
      synergies: Array.from(synergiesSet),
    };
  });

  const now = new Date().toISOString();

  // Save to LocalStorage
  try {
    localStorage.setItem(STORAGE_META_BRAWLERS, JSON.stringify(brawlers));
    localStorage.setItem(STORAGE_META_COUNTERS, JSON.stringify(counters));
    localStorage.setItem(STORAGE_META_UPDATED_AT, now);
  } catch (err) {
    console.warn('No se pudo guardar en LocalStorage:', err);
  }

  return { brawlers, counters, lastUpdated: now };
}

/**
 * Ensures every Brawler has a `modelUrl` (full-body render from the Fan Kit CDN)
 * regardless of where the data came from (localStorage, default JSON, API).
 */
const ensureModelUrls = (brawlers: Brawler[]): Brawler[] =>
  brawlers.map((b) =>
    b.modelUrl ? b : { ...b, modelUrl: `https://cdn.brawlify.com/brawlers/model/${b.id}.png` }
  );

export function getStoredBrawlers(defaultBrawlers: Brawler[]): Brawler[] {
  try {
    const raw = localStorage.getItem(STORAGE_META_BRAWLERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // If cached brawlers don't have gadgets yet, populate them from defaultBrawlers
        if (!parsed[0].gadgets || parsed[0].gadgets.length === 0) {
          const map = new Map(defaultBrawlers.map((b) => [b.name.toUpperCase(), b]));
          return ensureModelUrls(
            parsed.map((b) => {
              const def = map.get(b.name.toUpperCase());
              return withLocalizedText(
                def ? { ...b, gadgets: def.gadgets, starPowers: def.starPowers } : b
              );
            })
          );
        }
        return ensureModelUrls(parsed.map(withLocalizedText));
      }
    }
  } catch {}
  return ensureModelUrls(defaultBrawlers.map(withLocalizedText));
}

export function getStoredCounters(defaultCounters: CountersMap): CountersMap {
  try {
    const raw = localStorage.getItem(STORAGE_META_COUNTERS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return defaultCounters;
}

export function getLastUpdatedMeta(): string | null {
  try {
    return localStorage.getItem(STORAGE_META_UPDATED_AT);
  } catch {
    return null;
  }
}
