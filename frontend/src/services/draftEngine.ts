import type {
  Brawler,
  GameMap,
  CountersMap,
  PlayerProfile,
  RecommendationScore,
} from '../types/brawl';

export interface LaneAssignment {
  lane: 'Izquierda' | 'Centro' | 'Derecha';
  ally: string;
  enemy: string;
  advantage: 'ally' | 'enemy' | 'even';
  tip: string;
}

export interface MatchPrediction {
  allyWinRate: number;
  enemyWinRate: number;
  advantageTeam: 'ally' | 'enemy' | 'even';
  verdict: string;
  tacticalTips: string[];
  laneAssignments: LaneAssignment[];
}

export interface DraftAnalysis {
  phase: 'BANS' | 'DRAFT' | 'COMPLETE';
  totalPicks: number;
  priorityBans: Brawler[];
  firstPicks: Brawler[];
  matchPrediction?: MatchPrediction;
}

interface EngineParams {
  allBrawlers: Brawler[];
  map: GameMap;
  allyPicks: string[];
  enemyPicks: string[];
  bannedBrawlers: string[];
  countersData: CountersMap;
  playerProfile: PlayerProfile | null;
  onlyRankedReady: boolean;
}

export function calculateDraftRecommendations({
  allBrawlers,
  map,
  allyPicks,
  enemyPicks,
  bannedBrawlers,
  countersData,
  playerProfile,
  onlyRankedReady,
}: EngineParams): RecommendationScore[] {
  // Set of brawlers not eligible for picking (already chosen or banned)
  const unavailableNames = new Set<string>([
    ...allyPicks.filter(Boolean),
    ...enemyPicks.filter(Boolean),
    ...bannedBrawlers.filter(Boolean),
  ]);

  const totalPicks = allyPicks.length + enemyPicks.length;
  const isOpeningOrBan = totalPicks === 0;

  // Index player brawlers for quick O(1) lookup
  const playerBrawlersMap = new Map<string, {
    power: number;
    hasStarPower: boolean;
    hasGadget: boolean;
  }>();

  if (playerProfile?.brawlers) {
    for (const pb of playerProfile.brawlers) {
      playerBrawlersMap.set(pb.name.toUpperCase(), {
        power: pb.power,
        hasStarPower: Boolean(pb.starPowers && pb.starPowers.length > 0),
        hasGadget: Boolean(pb.gadgets && pb.gadgets.length > 0),
      });
    }
  }

  // Count existing ally classes to prevent redundant compositions
  const allyClassCounts: Record<string, number> = {};
  for (const allyName of allyPicks) {
    if (!allyName) continue;
    const brawlerObj = allBrawlers.find(
      (b) => b.displayName.toLowerCase() === allyName.toLowerCase()
    );
    if (brawlerObj) {
      allyClassCounts[brawlerObj.class] = (allyClassCounts[brawlerObj.class] || 0) + 1;
    }
  }

  const results: RecommendationScore[] = [];

  for (const brawler of allBrawlers) {
    // Skip if already banned or picked
    if (unavailableNames.has(brawler.displayName)) {
      continue;
    }

    // Player inventory check
    const playerData = playerBrawlersMap.get(brawler.name.toUpperCase()) ||
      playerBrawlersMap.get(brawler.displayName.toUpperCase());

    const playerLevel = playerData ? playerData.power : (playerProfile ? 0 : 11);
    const hasStarPower = playerData ? playerData.hasStarPower : true;
    const hasGadget = playerData ? playerData.hasGadget : true;
    const isRankedReady = playerLevel >= 9;

    // Filter if user requested only ranked ready
    if (onlyRankedReady && playerProfile && !isRankedReady) {
      continue;
    }

    const reasons: RecommendationScore['reasons'] = [];
    let tierScore = 0;
    let counterScore = 0;
    let synergyScore = 0;
    let penaltyScore = 0;
    let tier: 'S' | 'A' | 'B' | 'C' = 'C';

    // 1. Map Tier Evaluation
    if (map.tiers.S.some((name) => name.toLowerCase() === brawler.displayName.toLowerCase())) {
      tier = 'S';
      tierScore = 40;
      reasons.push({
        text: 'Excelente en este mapa',
        type: 'positive',
        points: 40,
      });
      if (isOpeningOrBan) {
        reasons.push({
          text: 'First Pick / Ban prioritario',
          type: 'positive',
          points: 20,
        });
      }
    } else if (map.tiers.A.some((name) => name.toLowerCase() === brawler.displayName.toLowerCase())) {
      tier = 'A';
      tierScore = 25;
      reasons.push({
        text: `A-Tier en ${map.name}`,
        type: 'positive',
        points: 25,
      });
    } else if (map.tiers.B.some((name) => name.toLowerCase() === brawler.displayName.toLowerCase())) {
      tier = 'B';
      tierScore = 12;
      reasons.push({
        text: 'B-Tier viable en mapa',
        type: 'neutral',
        points: 12,
      });
    } else {
      reasons.push({
        text: 'Fuera del tier principal del mapa',
        type: 'neutral',
        points: 0,
      });
    }

    // 2. Counters vs Enemy Picks (Adaptive Mode)
    const brawlerMatchup = countersData[brawler.displayName];
    if (brawlerMatchup) {
      for (const enemyName of enemyPicks) {
        if (!enemyName) continue;

        // Does candidate counter this enemy?
        if (
          brawlerMatchup.counters?.some(
            (c) => c.toLowerCase() === enemyName.toLowerCase()
          )
        ) {
          counterScore += 20;
          reasons.push({
            text: `Counter directo de ${enemyName}`,
            type: 'positive',
            points: 20,
          });
        }

        // Is candidate countered by this enemy?
        if (
          brawlerMatchup.counteredBy?.some(
            (cb) => cb.toLowerCase() === enemyName.toLowerCase()
          )
        ) {
          counterScore -= 22;
          reasons.push({
            text: `Débil contra ${enemyName}`,
            type: 'negative',
            points: -22,
          });
        }
      }

      // 3. Synergies with Ally Picks
      for (const allyName of allyPicks) {
        if (!allyName) continue;
        if (
          brawlerMatchup.synergies?.some(
            (s) => s.toLowerCase() === allyName.toLowerCase()
          )
        ) {
          synergyScore += 14;
          reasons.push({
            text: `Sinergia con ${allyName}`,
            type: 'positive',
            points: 14,
          });
        }
      }
    }

    // 4. Role Composition & Redundancy Penalties
    const currentClassCount = allyClassCounts[brawler.class] || 0;
    if (currentClassCount >= 2) {
      penaltyScore += 20;
      reasons.push({
        text: `Composición redundante (Ya hay ${currentClassCount} ${brawler.class}s)`,
        type: 'negative',
        points: -20,
      });
    } else if (
      currentClassCount === 1 &&
      (brawler.class === 'Artillery' || brawler.class === 'Marksman')
    ) {
      if (enemyPicks.some((e) => ['Mortis', 'Edgar', 'Leon', 'Lily', 'Mico'].includes(e))) {
        penaltyScore += 10;
        reasons.push({
          text: `Riesgo contra asesinos rivales`,
          type: 'negative',
          points: -10,
        });
      }
    }

    // Base score so solid picks scale smoothly 5-100
    const rawTotal = 25 + tierScore + counterScore + synergyScore - penaltyScore;
    const totalScore = Math.max(5, Math.min(100, Math.round(rawTotal)));

    results.push({
      brawler,
      totalScore,
      tierScore,
      counterScore,
      synergyScore,
      tier,
      reasons,
      isRankedReady,
      playerLevel: playerData ? playerData.power : undefined,
      hasStarPower,
      hasGadget,
    });
  }

  // Sort: Highest total score first. If tied, prioritize higher map tier then hasHypercharge
  results.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    const tierWeights: Record<string, number> = { S: 3, A: 2, B: 1, C: 0 };
    const diff = tierWeights[b.tier] - tierWeights[a.tier];
    if (diff !== 0) return diff;
    return (b.brawler.hasHypercharge ? 1 : 0) - (a.brawler.hasHypercharge ? 1 : 0);
  });

  return results;
}

export function calculateDraftAnalysis({
  allBrawlers,
  map,
  allyPicks,
  enemyPicks,
  bannedBrawlers,
  countersData,
}: {
  allBrawlers: Brawler[];
  map: GameMap;
  allyPicks: string[];
  enemyPicks: string[];
  bannedBrawlers: string[];
  countersData: CountersMap;
}): DraftAnalysis {
  const totalPicks = allyPicks.length + enemyPicks.length;
  const phase: 'BANS' | 'DRAFT' | 'COMPLETE' =
    allyPicks.length === 3 && enemyPicks.length === 3
      ? 'COMPLETE'
      : totalPicks === 0
      ? 'BANS'
      : 'DRAFT';

  const unavailable = new Set([
    ...allyPicks.filter(Boolean),
    ...enemyPicks.filter(Boolean),
    ...bannedBrawlers.filter(Boolean),
  ]);

  // Priority bans: Top S-Tier in this map
  const sTierBrawlers = map.tiers.S
    .map((name) => allBrawlers.find((b) => b.displayName.toLowerCase() === name.toLowerCase()))
    .filter((b): b is Brawler => Boolean(b && !unavailable.has(b.displayName)));

  const aTierBrawlers = map.tiers.A
    .map((name) => allBrawlers.find((b) => b.displayName.toLowerCase() === name.toLowerCase()))
    .filter((b): b is Brawler => Boolean(b && !unavailable.has(b.displayName)));

  const priorityBans = [...sTierBrawlers, ...aTierBrawlers].slice(0, 3);
  const firstPicks = [...sTierBrawlers, ...aTierBrawlers].slice(0, 5);

  let matchPrediction: MatchPrediction | undefined = undefined;

  if (phase === 'COMPLETE') {
    let allyPoints = 50;
    let enemyPoints = 50;

    // Evaluate map tiers for allies and enemies
    for (const name of allyPicks) {
      if (map.tiers.S.some((s) => s.toLowerCase() === name.toLowerCase())) allyPoints += 20;
      else if (map.tiers.A.some((a) => a.toLowerCase() === name.toLowerCase())) allyPoints += 12;
      else if (map.tiers.B.some((b) => b.toLowerCase() === name.toLowerCase())) allyPoints += 5;
    }

    for (const name of enemyPicks) {
      if (map.tiers.S.some((s) => s.toLowerCase() === name.toLowerCase())) enemyPoints += 20;
      else if (map.tiers.A.some((a) => a.toLowerCase() === name.toLowerCase())) enemyPoints += 12;
      else if (map.tiers.B.some((b) => b.toLowerCase() === name.toLowerCase())) enemyPoints += 5;
    }

    // Evaluate counters and synergies
    for (const ally of allyPicks) {
      const match = countersData[ally];
      if (!match) continue;
      for (const enemy of enemyPicks) {
        if (match.counters?.some((c) => c.toLowerCase() === enemy.toLowerCase())) {
          allyPoints += 15;
        }
        if (match.counteredBy?.some((cb) => cb.toLowerCase() === enemy.toLowerCase())) {
          enemyPoints += 15;
        }
      }
      for (const otherAlly of allyPicks) {
        if (otherAlly !== ally && match.synergies?.some((s) => s.toLowerCase() === otherAlly.toLowerCase())) {
          allyPoints += 8;
        }
      }
    }

    for (const enemy of enemyPicks) {
      const match = countersData[enemy];
      if (!match) continue;
      for (const otherEnemy of enemyPicks) {
        if (otherEnemy !== enemy && match.synergies?.some((s) => s.toLowerCase() === otherEnemy.toLowerCase())) {
          enemyPoints += 8;
        }
      }
    }

    const totalCalculated = allyPoints + enemyPoints;
    const rawRate = Math.round((allyPoints / Math.max(1, totalCalculated)) * 100);
    const allyWinRate = Math.min(80, Math.max(20, rawRate));
    const enemyWinRate = 100 - allyWinRate;

    const advantageTeam: 'ally' | 'enemy' | 'even' =
      allyWinRate >= 54 ? 'ally' : enemyWinRate >= 54 ? 'enemy' : 'even';

    let verdict = '';
    if (allyWinRate >= 60) {
      verdict = 'Gran ventaja de draft para tu equipo: Tenéis mayor control de mapa y counters directos.';
    } else if (allyWinRate >= 52) {
      verdict = 'Ligera ventaja aliada: Composición sólida y equilibrada para los objetivos del modo.';
    } else if (allyWinRate >= 48) {
      verdict = 'Enfrentamiento muy reñido (50/50): La victoria dependerá de la precisión mecánica y el control de carril.';
    } else {
      verdict = 'Composición enemiga con ventaja: Tienen counters sobre vuestros brawlers. Jugad agrupados y castigad errores.';
    }

    // Lane assignments: Left, Mid, Right
    const lanes: ('Izquierda' | 'Centro' | 'Derecha')[] = ['Izquierda', 'Centro', 'Derecha'];
    const laneAssignments: LaneAssignment[] = allyPicks.slice(0, 3).map((ally, idx) => {
      const enemy = enemyPicks[idx] || enemyPicks[0] || 'Rival';
      const lane = lanes[idx];
      const match = countersData[ally];
      let advantage: 'ally' | 'enemy' | 'even' = 'even';
      let tip = '';

      if (match?.counters?.some((c) => c.toLowerCase() === enemy.toLowerCase())) {
        advantage = 'ally';
        tip = `${ally} tiene counter sobre ${enemy}. Presiona agresivamente para ganar la línea.`;
      } else if (match?.counteredBy?.some((cb) => cb.toLowerCase() === enemy.toLowerCase())) {
        advantage = 'enemy';
        tip = `${enemy} es peligroso contra ${ally}. Mantén distancia defensiva y pide apoyo al centro.`;
      } else {
        tip = `Duelo neutral contra ${enemy}. Controla el espacio y no pierdas posición de cobertura.`;
      }

      return {
        lane,
        ally,
        enemy,
        advantage,
        tip,
      };
    });

    // Mode-specific tips
    const tacticalTips: string[] = [];
    const mode = map.mode?.toLowerCase() || '';

    if (mode.includes('heist') || mode.includes('atraco')) {
      tacticalTips.push('Atraco: Dividid roles entre 1 defensa estricto y 2 atacantes con daño continuo a la caja.');
      tacticalTips.push('No descuidéis la caja propia: nunca vayáis los 3 al ataque sin control de campo.');
    } else if (mode.includes('brawl ball') || mode.includes('balón')) {
      tacticalTips.push('Balón Brawl: Asegurad al menos una baja enemiga antes de avanzar el balón hacia portería.');
      tacticalTips.push('Rompizanjas y supers destructivas deben usarse para abrir la portería rival tempranamente.');
    } else if (mode.includes('hot zone') || mode.includes('zona')) {
      tacticalTips.push('Zona Caliente: El brawler de mayor aguante debe mantener la zona mientras los tiradores cortan el paso.');
      tacticalTips.push('Entrar a la zona de uno en uno es una derrota segura; reagrupaos antes de contestar.');
    } else if (mode.includes('knockout') || mode.includes('noqueo')) {
      tacticalTips.push('Noqueo: No arriesguéis la primera vida. El primer equipo que consigue una baja gana el 80% de las rondas.');
      tacticalTips.push('Forzad el retroceso rival hacia el humo tóxico usando ataques de control de área.');
    } else if (mode.includes('gem') || mode.includes('atrapagemas')) {
      tacticalTips.push('Atrapagemas: Concentrad las gemas en un único portador con alta movilidad o rango defensivo.');
      tacticalTips.push('Al llegar a la cuenta atrás de 10 gemas, retroceded inmediatamente a vuestra base.');
    } else {
      tacticalTips.push('Mantened el espaciado para no recibir daño en área conjunto y aprovechad los muros clave del mapa.');
    }

    matchPrediction = {
      allyWinRate,
      enemyWinRate,
      advantageTeam,
      verdict,
      tacticalTips,
      laneAssignments,
    };
  }

  return {
    phase,
    totalPicks,
    priorityBans,
    firstPicks,
    matchPrediction,
  };
}
