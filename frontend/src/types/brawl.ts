export type BrawlerClass =
  | 'Tank'
  | 'Damage Dealer'
  | 'Marksman'
  | 'Assassin'
  | 'Controller'
  | 'Artillery'
  | 'Support';

export interface BrawlerAbility {
  id: number;
  name: string;
  imageUrl?: string;
  description?: string;
}

export interface Brawler {
  id: number;
  name: string;
  displayName: string;
  rarity: string;
  class: BrawlerClass;
  attackRange: string;
  hasHypercharge: boolean;
  iconUrl: string;
  gadgets?: BrawlerAbility[];
  starPowers?: BrawlerAbility[];
}

export interface CounterInfo {
  counters: string[];
  counteredBy: string[];
  synergies: string[];
}

export type CountersMap = Record<string, CounterInfo>;

export type GameMode =
  | 'Brawl Ball'
  | 'Gem Grab'
  | 'Knockout'
  | 'Bounty'
  | 'Hot Zone'
  | 'Heist';

export interface GameMap {
  id: string;
  mode: GameMode;
  modeKey: string;
  name: string;
  environment: string;
  tiers: {
    S: string[];
    A: string[];
    B: string[];
  };
}

export interface PlayerGear {
  id: number;
  name: string;
}

export interface PlayerStarPower {
  id: number;
  name: string;
}

export interface PlayerGadget {
  id: number;
  name: string;
}

export interface PlayerBrawler {
  id: number;
  name: string;
  power: number;
  rank: number;
  trophies: number;
  highestTrophies: number;
  gears?: PlayerGear[];
  starPowers?: PlayerStarPower[];
  gadgets?: PlayerGadget[];
}

export interface BattlePlayer {
  tag: string;
  name: string;
  brawler: string;
  brawlerTrophies?: number;
}

export interface BattleRecord {
  timestamp: string;
  ranked?: boolean;
  victory?: boolean;
  result?: string;
  event?: {
    id?: number;
    mode?: string;
    map?: string;
  };
  teams?: BattlePlayer[][];
}

export interface PlayerProfile {
  tag: string;
  name: string;
  trophies: number;
  highestTrophies?: number;
  expLevel?: number;
  brawlers: PlayerBrawler[];
  battles?: BattleRecord[];
  isMock?: boolean;
  warning?: string;
  fromCache?: boolean;
}

export interface RecommendationScore {
  brawler: Brawler;
  totalScore: number;
  tierScore: number;
  counterScore: number;
  synergyScore: number;
  tier: 'S' | 'A' | 'B' | 'C';
  reasons: {
    text: string;
    type: 'positive' | 'negative' | 'neutral';
    points: number;
  }[];
  isRankedReady: boolean;
  playerLevel?: number;
  hasStarPower?: boolean;
  hasGadget?: boolean;
}
