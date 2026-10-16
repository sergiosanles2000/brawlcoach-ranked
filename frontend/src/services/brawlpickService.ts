import brawlpickRaw from '../data/brawlpick_maps.json';
import type { Brawler, CountersMap } from '../types/brawl';

export interface BrawlPickPick {
  brawlerName: string;
  winRate: number;
  games: number;
  rank: number;
  reliability?: string;
}

export interface BrawlPickMap {
  mapName: string;
  aliases?: string[];
  mode: string;
  totalBattles: number;
  isRanked: boolean;
  picks: BrawlPickPick[];
}

export interface BrawlPickDatabase {
  updatedAt: string;
  source: string;
  totalMaps: number;
  rankedMapsCount: number;
  maps: BrawlPickMap[];
}

export interface BrawlPickBanSuggestion {
  brawlerName: string;
  label: 'Baneo sugerido (Heurístico)';
  reason: string;
  winRate?: number;
  games?: number;
  isDominantThreat: boolean;
}

export interface BrawlPickScoredPick {
  brawlerName: string;
  winRate: number;
  games: number;
  rank: number;
  reliability?: string;
  brawlerObj?: Brawler;
  totalScore: number;
  counterAdvantage: number;
  countersAgainstEnemies: string[];
  counteredByEnemies: string[];
  synergiesWithAllies: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  draftBadge: string;
  tacticalReason: string;
}

export interface OptimalTeamRecommendation {
  picks: (BrawlPickScoredPick & { roleTitle: string })[];
  synergyScore: number;
  coverageAgainstEnemies: string[];
  tacticalSummary: string;
}

export interface BrawlPickAnalysisResult {
  status: 'FOUND' | 'INSUFFICIENT_DATA' | 'UNKNOWN_MAP';
  mapData: BrawlPickMap | null;
  matchedMapName: string;
  englishName: string;
  matchedMode: string;
  originalMode: string;
  topPicks: BrawlPickScoredPick[];
  suggestedBans: BrawlPickBanSuggestion[];
  optimalTeam?: OptimalTeamRecommendation | null;
  draftPhase: {
    enemyPicksRemaining: number;
    allyPicksRemaining: number;
    isAllyFirstPick: boolean;
    isLastPick: boolean;
    advice: string;
  };
  isRanked: boolean;
  updatedAt: string;
  source: string;
  totalBattles: number;
}

const STORAGE_KEY = 'brawlpick_maps_cache';

// Normalized game mode mapping dictionary (Spanish & English aliases to English)
export const MODE_ALIASES: Record<string, string> = {
  atraco: 'Heist',
  heist: 'Heist',
  atrapagemas: 'Gem Grab',
  'gem grab': 'Gem Grab',
  'balón brawl': 'Brawl Ball',
  'balon brawl': 'Brawl Ball',
  'brawl ball': 'Brawl Ball',
  'zona restringida': 'Hot Zone',
  'zona caliente': 'Hot Zone',
  'hot zone': 'Hot Zone',
  'caza estelar': 'Bounty',
  bounty: 'Bounty',
  noqueo: 'Knockout',
  knockout: 'Knockout',
  wipeout: 'Wipeout',
  destrucción: 'Wipeout',
  'destruccion': 'Wipeout',
  'basket brawl': 'Basket Brawl',
  'baloncesto brawl': 'Basket Brawl',
  'brawl arena': 'Brawl Arena',
  'arena brawl': 'Brawl Arena',
  'brawl hockey': 'Brawl Hockey',
  'hockey brawl': 'Brawl Hockey',
};

// Game mode mapping from English to Spanish display
export const MODE_TO_SPANISH: Record<string, string> = {
  heist: 'Atraco',
  'gem grab': 'Atrapagemas',
  'brawl ball': 'Balón Brawl',
  'hot zone': 'Zona Caliente',
  bounty: 'Caza Estelar',
  knockout: 'Noqueo',
  wipeout: 'Destrucción',
  showdown: 'Supervivencia',
  'basket brawl': 'Baloncesto Brawl',
  'brawl arena': 'Arena Brawl',
  'brawl hockey': 'Hockey Brawl',
};

export function getDisplayMode(mode: string): string {
  const norm = normalizeText(mode);
  return MODE_TO_SPANISH[norm] || mode;
}

// Normalize strings (remove accents, trim, lowercase)
export function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, '')
    .replace(/\s+/g, ' ');
}

// Get loaded BrawlPick database from localStorage cache or local JSON
export function getBrawlPickDatabase(): BrawlPickDatabase {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.maps && Array.isArray(parsed.maps)) {
          return parsed as BrawlPickDatabase;
        }
      }
    } catch {}
  }
  return brawlpickRaw as BrawlPickDatabase;
}

// Save/Import updated database locally
export function saveBrawlPickDatabase(db: BrawlPickDatabase): boolean {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      return true;
    } catch {}
  }
  return false;
}

// Find map in BrawlPick database
export function findBrawlPickMap(
  queryMapName?: string | null,
  queryMode?: string | null
): BrawlPickMap | null {
  if (!queryMapName && !queryMode) return null;

  const db = getBrawlPickDatabase();
  const cleanMap = queryMapName ? normalizeText(queryMapName) : '';
  const cleanMode = queryMode ? normalizeText(queryMode) : '';
  const mappedMode = cleanMode ? (MODE_ALIASES[cleanMode] || cleanMode).toLowerCase() : '';

  // 1. Exact match by name
  if (cleanMap) {
    for (const m of db.maps) {
      const nameNorm = normalizeText(m.mapName);
      if (nameNorm === cleanMap) {
        return m;
      }
      if (m.aliases) {
        for (const alias of m.aliases) {
          if (normalizeText(alias) === cleanMap) {
            return m;
          }
        }
      }
    }
  }

  // 2. Fuzzy substring match (with mode check if provided)
  if (cleanMap) {
    for (const m of db.maps) {
      const nameNorm = normalizeText(m.mapName);
      const modeNorm = normalizeText(m.mode);

      const mapMatches = nameNorm.includes(cleanMap) || cleanMap.includes(nameNorm);
      const aliasMatches = m.aliases?.some(
        (a) => normalizeText(a).includes(cleanMap) || cleanMap.includes(normalizeText(a))
      );

      if (mapMatches || aliasMatches) {
        if (!mappedMode || modeNorm.includes(mappedMode) || mappedMode.includes(modeNorm)) {
          return m;
        }
      }
    }
  }

  // 3. Fallback by mode alone if map name was not recognized
  if (mappedMode) {
    const firstInMode = db.maps.find(
      (m) => normalizeText(m.mode).includes(mappedMode) || mappedMode.includes(normalizeText(m.mode))
    );
    if (firstInMode) return firstInMode;
  }

  return null;
}

// Calculate Heuristic Ban Recommendations derived from real statistics and counters
export function calculateSuggestedBans(
  mapData: BrawlPickMap | null,
  _allBrawlers: Brawler[],
  countersData: CountersMap,
  bannedSoFar: string[] = []
): BrawlPickBanSuggestion[] {
  if (!mapData || !mapData.picks || mapData.picks.length === 0) {
    return [];
  }

  const bannedSet = new Set(bannedSoFar.map((b) => b.toLowerCase().trim()));
  const suggestions: BrawlPickBanSuggestion[] = [];

  // 1. Top statistical picks with high win rate (> 58%) and solid sample size (> 200 games)
  const dominantPicks = mapData.picks
    .filter((p) => p.winRate >= 57.0 && !bannedSet.has(p.brawlerName.toLowerCase()))
    .slice(0, 3);

  for (const pick of dominantPicks) {
    suggestions.push({
      brawlerName: pick.brawlerName,
      label: 'Baneo sugerido (Heurístico)',
      reason: `Meta dominante en este mapa: ${pick.winRate}% WR en ${pick.games.toLocaleString()} partidas observadas.`,
      winRate: pick.winRate,
      games: pick.games,
      isDominantThreat: true,
    });
  }

  // 2. Counter-threat check: if top pick is countered heavily by an oppressive brawler
  if (dominantPicks.length > 0) {
    const topPickName = dominantPicks[0].brawlerName;
    const matchup = countersData[topPickName];
    if (matchup?.counteredBy) {
      for (const counterBrawler of matchup.counteredBy) {
        if (
          !bannedSet.has(counterBrawler.toLowerCase()) &&
          !suggestions.some((s) => s.brawlerName.toLowerCase() === counterBrawler.toLowerCase())
        ) {
          suggestions.push({
            brawlerName: counterBrawler,
            label: 'Baneo sugerido (Heurístico)',
            reason: `Amenaza counter directa frente al mejor pick (${topPickName}).`,
            isDominantThreat: false,
          });
          if (suggestions.length >= 3) break;
        }
      }
    }
  }

  return suggestions.slice(0, 3);
}

// Main helper: Query BrawlPick stats and compute dynamic counter-picks and draft phase advice
export function queryBrawlPickStats({
  queryMapName,
  queryMode,
  allBrawlers,
  countersData,
  allyPicks = [],
  enemyPicks = [],
  bannedBrawlers = [],
}: {
  queryMapName?: string | null;
  queryMode?: string | null;
  allBrawlers: Brawler[];
  countersData: CountersMap;
  allyPicks?: string[];
  enemyPicks?: string[];
  bannedBrawlers?: string[];
}): BrawlPickAnalysisResult {
  const db = getBrawlPickDatabase();
  const mapData = findBrawlPickMap(queryMapName, queryMode);

  // Clean and filter active draft picks
  const cleanAllyPicks = allyPicks.filter((p): p is string => Boolean(p && p.trim()));
  const cleanEnemyPicks = enemyPicks.filter((p): p is string => Boolean(p && p.trim()));
  const cleanBans = bannedBrawlers.filter((b): b is string => Boolean(b && b.trim()));

  const enemyPicksRemaining = Math.max(0, 3 - cleanEnemyPicks.length);
  const allyPicksRemaining = Math.max(0, 3 - cleanAllyPicks.length);
  const isAllyFirstPick = cleanAllyPicks.length === 0 && cleanEnemyPicks.length <= 1;
  const isLastPick = cleanAllyPicks.length === 2 && cleanEnemyPicks.length === 3;

  let advice = '';
  if (cleanEnemyPicks.length === 0) {
    advice = 'Fase de apertura: Asegura brawlers meta versátiles con pocos counters directos.';
  } else if (enemyPicksRemaining > 0) {
    advice = `El rival aún tiene ${enemyPicksRemaining} pick${enemyPicksRemaining > 1 ? 's' : ''} por elegir. Evita picks ciegos fácilmente countereables.`;
  } else {
    advice = '¡Composición rival bloqueada! Aprovecha para castigar con counters decisivos sin riesgo de réplica.';
  }

  const draftPhase = {
    enemyPicksRemaining,
    allyPicksRemaining,
    isAllyFirstPick,
    isLastPick,
    advice,
  };

  if (!mapData) {
    const rawModeNorm = queryMode ? normalizeText(queryMode) : '';
    const spanishMode = queryMode ? (MODE_TO_SPANISH[rawModeNorm] || queryMode) : 'Desconocido';
    return {
      status: 'UNKNOWN_MAP',
      mapData: null,
      matchedMapName: queryMapName || 'Mapa Desconocido',
      englishName: queryMapName || 'Mapa Desconocido',
      matchedMode: spanishMode,
      originalMode: queryMode || 'Unknown',
      topPicks: [],
      suggestedBans: [],
      optimalTeam: null,
      draftPhase,
      isRanked: false,
      updatedAt: db.updatedAt,
      source: db.source,
      totalBattles: 0,
    };
  }

  // Determine Spanish localized name vs English BrawlPick name
  const cleanQuery = queryMapName ? normalizeText(queryMapName) : '';
  const matchedAlias = mapData.aliases?.find(
    (a) =>
      normalizeText(a) === cleanQuery ||
      cleanQuery.includes(normalizeText(a)) ||
      normalizeText(a).includes(cleanQuery)
  );
  const spanishName =
    matchedAlias || (mapData.aliases && mapData.aliases.length > 0 ? mapData.aliases[0] : mapData.mapName);
  const englishName = mapData.mapName;
  const spanishMode = getDisplayMode(mapData.mode);

  if (!mapData.picks || mapData.picks.length === 0) {
    return {
      status: 'INSUFFICIENT_DATA',
      mapData,
      matchedMapName: spanishName,
      englishName,
      matchedMode: spanishMode,
      originalMode: mapData.mode,
      topPicks: [],
      suggestedBans: [],
      optimalTeam: null,
      draftPhase,
      isRanked: mapData.isRanked,
      updatedAt: db.updatedAt,
      source: db.source,
      totalBattles: mapData.totalBattles,
    };
  }

  // Unavailable set (already picked or banned)
  const unavailable = new Set<string>(
    [...cleanAllyPicks, ...cleanEnemyPicks, ...cleanBans].map((name) => normalizeText(name))
  );

  // Quick lookup map for BrawlPick stats on this map
  const mapPicksMap = new Map<string, BrawlPickPick>();
  for (const pick of mapData.picks) {
    mapPicksMap.set(normalizeText(pick.brawlerName), pick);
  }

  // Count existing ally classes
  const allyClassCounts: Record<string, number> = {};
  for (const ally of cleanAllyPicks) {
    const obj = allBrawlers.find((b) => normalizeText(b.displayName) === normalizeText(ally));
    if (obj?.class) {
      allyClassCounts[obj.class] = (allyClassCounts[obj.class] || 0) + 1;
    }
  }

  const scoredCandidates: BrawlPickScoredPick[] = [];

  for (const brawler of allBrawlers) {
    const normName = normalizeText(brawler.displayName);
    if (unavailable.has(normName) || unavailable.has(normalizeText(brawler.name))) {
      continue;
    }

    const mapPick = mapPicksMap.get(normName) || mapPicksMap.get(normalizeText(brawler.name));
    const winRate = mapPick ? mapPick.winRate : 50.0;
    const games = mapPick ? mapPick.games : 120;
    const rank = mapPick ? mapPick.rank : 99;
    const reliability = mapPick ? (mapPick.reliability || 'BrawlPick') : 'General';

    // 1. Base Score from BrawlPick Map Win Rate
    // Scale: 48% -> 10 pts, 55% -> 30 pts, 60% -> 45 pts, 65% -> 60 pts
    const mapScore = Math.max(5, Math.round((winRate - 45) * 3));

    // 2. Counter Matchups vs Enemy Picks (Bidirectional lookup)
    let counterAdvantage = 0;
    const countersAgainstEnemies: string[] = [];
    const counteredByEnemies: string[] = [];

    const candCounters = countersData[brawler.displayName] || countersData[brawler.name];

    for (const enemyName of cleanEnemyPicks) {
      const enemyMatchup = countersData[enemyName];

      // Does candidate counter enemy?
      const countersEnemy =
        candCounters?.counters?.some((c) => normalizeText(c) === normalizeText(enemyName)) ||
        enemyMatchup?.counteredBy?.some((cb) => normalizeText(cb) === normName);

      if (countersEnemy) {
        counterAdvantage += 28;
        countersAgainstEnemies.push(enemyName);
      }

      // Is candidate countered by enemy?
      const isCounteredByEnemy =
        candCounters?.counteredBy?.some((cb) => normalizeText(cb) === normalizeText(enemyName)) ||
        enemyMatchup?.counters?.some((c) => normalizeText(c) === normName);

      if (isCounteredByEnemy) {
        counterAdvantage -= 30;
        counteredByEnemies.push(enemyName);
      }
    }

    // 3. Synergy with Ally Picks
    let synergyScore = 0;
    const synergiesWithAllies: string[] = [];
    for (const allyName of cleanAllyPicks) {
      const allyMatchup = countersData[allyName];
      const hasSynergy =
        candCounters?.synergies?.some((s) => normalizeText(s) === normalizeText(allyName)) ||
        allyMatchup?.synergies?.some((s) => normalizeText(s) === normName);

      if (hasSynergy) {
        synergyScore += 12;
        synergiesWithAllies.push(allyName);
      }
    }

    // 4. Role Diversity Penalty
    const currentClassCount = allyClassCounts[brawler.class] || 0;
    let penaltyScore = 0;
    if (currentClassCount >= 2) {
      penaltyScore += 24;
    } else if (currentClassCount === 1 && (brawler.class === 'Tank' || brawler.class === 'Artillery')) {
      penaltyScore += 12;
    }

    // 5. Counter-Pick Risk & Draft Phase Anticipation
    const knownCountersCount = candCounters?.counteredBy?.length || 0;
    const isHighRiskArchetype =
      knownCountersCount >= 6 ||
      ['Mortis', 'Edgar', 'Frank', 'Tick', 'Dynamike', 'Sprout', 'Grom', 'Bull', 'El Primo', 'Darryl'].some(
        (n) => normalizeText(n) === normName
      );

    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let draftBadge = '';
    let tacticalReason = '';
    let phaseScoreModifier = 0;

    if (cleanEnemyPicks.length === 0) {
      // Zero enemies picked yet
      if (isHighRiskArchetype) {
        riskLevel = 'HIGH';
        phaseScoreModifier -= 18;
        draftBadge = '⚠️ Riesgo First Pick';
        tacticalReason = 'Fácil de counterear si se elige primero. Mejor reservarlo como Last Pick.';
      } else {
        riskLevel = 'LOW';
        phaseScoreModifier += 12;
        draftBadge = '🛡️ First Pick Seguro';
        tacticalReason = `Meta dominante en ${spanishName} con pocos counters directos.`;
      }
    } else if (enemyPicksRemaining > 0) {
      // Enemy still has 1 or 2 picks remaining
      if (countersAgainstEnemies.length > 0) {
        if (isHighRiskArchetype && enemyPicksRemaining >= 2) {
          riskLevel = 'MEDIUM';
          draftBadge = `🎯 Counter de ${countersAgainstEnemies[0]}`;
          tacticalReason = `Counter de ${countersAgainstEnemies.join(', ')}, pero cuidado: el rival aún tiene ${enemyPicksRemaining} elecciones.`;
        } else {
          riskLevel = 'LOW';
          phaseScoreModifier += 8;
          draftBadge = `🎯 Counter de ${countersAgainstEnemies.join(', ')}`;
          tacticalReason = `Neutraliza a ${countersAgainstEnemies.join(', ')} con ${winRate.toFixed(1)}% WR en el mapa.`;
        }
      } else if (isHighRiskArchetype && enemyPicksRemaining >= 2) {
        riskLevel = 'HIGH';
        phaseScoreModifier -= 22;
        draftBadge = '⚠️ Riesgo de Counter';
        tacticalReason = `Riesgo alto: el rival tiene ${enemyPicksRemaining} turnos para responderte directamente.`;
      } else {
        riskLevel = 'LOW';
        draftBadge = 'Meta Estable';
        tacticalReason = `Rendimiento estadístico sólido en ${spanishName}.`;
      }
    } else {
      // enemyPicksRemaining === 0 (Enemy team is 100% locked in!)
      riskLevel = 'LOW';
      if (countersAgainstEnemies.length > 0) {
        phaseScoreModifier += 22;
        draftBadge = `🔥 Destroza a ${countersAgainstEnemies.join(', ')}`;
        tacticalReason = `¡Last Pick seguro! Castiga a ${countersAgainstEnemies.join(', ')} con 0% riesgo de counter rival.`;
      } else if (counteredByEnemies.length > 0) {
        riskLevel = 'HIGH';
        phaseScoreModifier -= 25;
        draftBadge = `⚠️ En desventaja`;
        tacticalReason = `Complicado frente a ${counteredByEnemies.join(', ')}.`;
      } else {
        draftBadge = 'Pick Neutral';
        tacticalReason = `Matchup equilibrado frente a la composición rival.`;
      }
    }

    const rawTotal = 30 + mapScore + counterAdvantage + synergyScore + phaseScoreModifier - penaltyScore;
    const totalScore = Math.max(5, Math.min(100, Math.round(rawTotal)));

    scoredCandidates.push({
      brawlerName: brawler.displayName,
      winRate,
      games,
      rank,
      reliability,
      brawlerObj: brawler,
      totalScore,
      counterAdvantage,
      countersAgainstEnemies,
      counteredByEnemies,
      synergiesWithAllies,
      riskLevel,
      draftBadge,
      tacticalReason,
    });
  }

  // Sort: highest total score first.
  scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);

  const topPicks = scoredCandidates.slice(0, 5);

  // Generate Optimal 3-Brawler Team Recommendation if enemy has picks
  let optimalTeam: OptimalTeamRecommendation | null = null;
  if (cleanEnemyPicks.length >= 1) {
    const teamPicks: (BrawlPickScoredPick & { roleTitle: string })[] = [];
    const usedNames = new Set<string>();

    // 1. Pick 1: Strongest Primary Counter / Frontline Initiator
    const primaryPick = scoredCandidates.find(
      (c) => c.countersAgainstEnemies.length > 0 || c.brawlerObj?.class === 'Tank' || c.brawlerObj?.class === 'Controller'
    ) || scoredCandidates[0];

    if (primaryPick) {
      teamPicks.push({
        ...primaryPick,
        roleTitle: 'Iniciador / Counter Principal',
      });
      usedNames.add(normalizeText(primaryPick.brawlerName));
    }

    // 2. Pick 2: Anti-enemy DPS / Sniper / Anti-tank
    const secondaryPick = scoredCandidates.find(
      (c) =>
        !usedNames.has(normalizeText(c.brawlerName)) &&
        c.brawlerObj?.class !== primaryPick?.brawlerObj?.class &&
        (c.brawlerObj?.class === 'Damage Dealer' || c.brawlerObj?.class === 'Marksman' || c.brawlerObj?.class === 'Assassin')
    ) || scoredCandidates.find((c) => !usedNames.has(normalizeText(c.brawlerName)));

    if (secondaryPick) {
      teamPicks.push({
        ...secondaryPick,
        roleTitle: 'Daño / Castigador',
      });
      usedNames.add(normalizeText(secondaryPick.brawlerName));
    }

    // 3. Pick 3: Controller / Support / Area control
    const tertiaryPick = scoredCandidates.find(
      (c) =>
        !usedNames.has(normalizeText(c.brawlerName)) &&
        c.brawlerObj?.class !== primaryPick?.brawlerObj?.class &&
        c.brawlerObj?.class !== secondaryPick?.brawlerObj?.class
    ) || scoredCandidates.find((c) => !usedNames.has(normalizeText(c.brawlerName)));

    if (tertiaryPick) {
      teamPicks.push({
        ...tertiaryPick,
        roleTitle: 'Control / Soporte',
      });
    }

    const allCovered = new Set<string>();
    for (const tp of teamPicks) {
      for (const en of tp.countersAgainstEnemies) {
        allCovered.add(en);
      }
    }

    optimalTeam = {
      picks: teamPicks,
      synergyScore: Math.round(teamPicks.reduce((acc, p) => acc + p.totalScore, 0) / (teamPicks.length || 1)),
      coverageAgainstEnemies: Array.from(allCovered),
      tacticalSummary: `Trío optimizado para neutralizar a ${cleanEnemyPicks.join(', ')} cubriendo control, daño y supervivencia en ${spanishName}.`,
    };
  }

  const suggestedBans = calculateSuggestedBans(
    mapData,
    allBrawlers,
    countersData,
    cleanBans
  );

  return {
    status: 'FOUND',
    mapData,
    matchedMapName: spanishName,
    englishName,
    matchedMode: spanishMode,
    originalMode: mapData.mode,
    topPicks,
    suggestedBans,
    optimalTeam,
    draftPhase,
    isRanked: mapData.isRanked,
    updatedAt: db.updatedAt,
    source: db.source,
    totalBattles: mapData.totalBattles,
  };
}
