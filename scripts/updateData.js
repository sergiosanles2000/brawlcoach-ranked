const fs = require('fs');
const path = require('path');

const BRAWLERS_FILE = path.join(__dirname, '..', 'frontend', 'src', 'data', 'brawlers.json');
const COUNTERS_FILE = path.join(__dirname, '..', 'frontend', 'src', 'data', 'counters.json');
const MAPS_FILE = path.join(__dirname, '..', 'frontend', 'src', 'data', 'maps.json');

// Archetypal relationships across Brawl Stars roles
const ARCHETYPE_RULES = {
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
const SPECIFIC_MATCHUPS = {
  Shelly: {
    counters: ['Mortis', 'Edgar', 'Buzz', 'Bull', 'El Primo', 'Fang', 'Kenji', 'Mico', 'Draco', 'Darryl'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Bea', 'Tick', 'Larry & Lawrie', 'Nani'],
    synergies: ['Max', 'Gene', 'Sandy', 'Tara']
  },
  Colt: {
    counters: ['Frank', '8-Bit', 'Bull', 'El Primo', 'Pam', 'Meg'],
    counteredBy: ['Piper', 'Nani', 'Belle', 'Leon', 'Mortis', 'Edgar'],
    synergies: ['Max', 'Buster', 'Belle']
  },
  Bull: {
    counters: ['Mortis', 'Frank', 'Rosa', 'Poco', 'Byron'],
    counteredBy: ['Colette', 'Surge', 'Gale', 'Shelly', 'Otis', 'Bea', 'Clancy', 'Emz'],
    synergies: ['Poco', 'Byron', 'Max', 'Buster']
  },
  Brock: {
    counters: ['Dynamike', 'Barley', 'Emz', '8-Bit', 'Bo', 'Tick'],
    counteredBy: ['Leon', 'Edgar', 'Mortis', 'Piper', 'Angelo', 'Mico', 'Lily'],
    synergies: ['Belle', 'Gene', 'Buster']
  },
  'El Primo': {
    counters: ['Frank', 'Rosa', 'Mortis', 'Buster'],
    counteredBy: ['Colette', 'Gale', 'Surge', 'Shelly', 'Bea', 'Clancy', 'Otis', 'Griff'],
    synergies: ['Poco', 'Byron', 'Sandy']
  },
  Barley: {
    counters: ['Frank', 'Rosa', '8-Bit', 'Pam', 'Bull'],
    counteredBy: ['Edgar', 'Mortis', 'Mico', 'Leon', 'Lily', 'Fang', 'Kenji'],
    synergies: ['Buster', 'Rosa', 'Frank']
  },
  Poco: {
    counters: ['Gene', 'Sandy', 'Leon'],
    counteredBy: ['Frank', 'Colette', 'Piper', 'Belle', 'Edgar'],
    synergies: ['Frank', 'Buster', 'Draco', 'Bull', 'Rosa', 'El Primo']
  },
  Dynamike: {
    counters: ['Frank', 'Rosa', 'Bull', '8-Bit', 'Bo'],
    counteredBy: ['Mortis', 'Edgar', 'Mico', 'Leon', 'Lily', 'Fang', 'Kenji', 'Cordelius'],
    synergies: ['Buster', 'Poco', 'Frank']
  },
  Piper: {
    counters: ['Brock', 'Bea', 'Colt', 'Bo', 'Emz', 'Dynamike', 'Penny', 'Pam'],
    counteredBy: ['Leon', 'Nani', 'Edgar', 'Mortis', 'Lily', 'Mico', 'Kenji', 'Cordelius'],
    synergies: ['Gene', 'Buster', 'Belle', 'Max', 'Byron']
  },
  Mortis: {
    counters: ['Dynamike', 'Barley', 'Tick', 'Sprout', 'Grom', 'Larry & Lawrie', 'Piper', 'Brock', 'Bea', 'Belle', 'Byron'],
    counteredBy: ['Shelly', 'Bull', 'El Primo', 'Frank', 'Rosa', 'Buster', 'Surge', 'Gale', 'Clancy', 'Otis', 'Jacky'],
    synergies: ['Max', 'Gene', 'Sandy', 'Poco']
  },
  Colette: {
    counters: ['Frank', 'Bull', 'El Primo', 'Rosa', 'Buster', 'Draco', 'Hank', 'Ash', '8-Bit', 'Pam', 'Meg'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Leon', 'Edgar', 'Mortis', 'Lily', 'Mandy'],
    synergies: ['Gene', 'Sandy', 'Buster', 'Piper']
  },
  Gale: {
    counters: ['Edgar', 'Mortis', 'Buzz', 'Bull', 'El Primo', 'Frank', 'Fang', 'Mico', 'Kenji', 'Draco', 'Darryl', 'Lily'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Brock', 'Nani', 'Mandy'],
    synergies: ['Colette', 'Piper', 'Sandy', 'Belle']
  },
  Surge: {
    counters: ['Edgar', 'Mortis', 'Buzz', 'Bull', 'El Primo', 'Frank', 'Fang', 'Mico', 'Darryl', 'Kenji'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Brock', 'Tick', 'Bea', 'Mandy'],
    synergies: ['Max', 'Gene', 'Buster']
  },
  Clancy: {
    counters: ['Frank', 'Bull', 'El Primo', 'Rosa', 'Buster', 'Draco', 'Ash', 'Hank', 'Jacky', 'Darryl'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Nani', 'Brock', 'Tick', 'Sprout'],
    synergies: ['Max', 'Buster', 'Poco', 'Gene']
  },
  Kenji: {
    counters: ['Dynamike', 'Barley', 'Tick', 'Piper', 'Brock', 'Bea', 'Belle', 'Grom', 'Sprout'],
    counteredBy: ['Shelly', 'Bull', 'Gale', 'Surge', 'Otis', 'Frank', 'Chester'],
    synergies: ['Poco', 'Byron', 'Max', 'Gene']
  },
  Frank: {
    counters: ['Poco', 'Sandy', 'Gene', 'Pam', 'Nita', 'Ash'],
    counteredBy: ['Colette', 'Surge', 'Gale', 'Shelly', 'Clancy', 'Otis', 'Bea', 'Griff', 'Emz', 'Lou', 'Chester'],
    synergies: ['Poco', 'Byron', 'Max', 'Kit']
  },
  Draco: {
    counters: ['Mortis', 'Poco', 'Gene', 'Sandy', 'Nita'],
    counteredBy: ['Colette', 'Surge', 'Gale', 'Clancy', 'Otis', 'Shelly', 'Bea'],
    synergies: ['Poco', 'Byron', 'Kit', 'Max']
  },
  Lily: {
    counters: ['Piper', 'Belle', 'Angelo', 'Brock', 'Dynamike', 'Tick', 'Barley', 'Mandy'],
    counteredBy: ['Shelly', 'Bull', 'Buster', 'Rosa', 'Gale', 'Surge', 'Frank'],
    synergies: ['Max', 'Gene', 'Tara']
  },
  Berry: {
    counters: ['Frank', 'Rosa', '8-Bit', 'Bull', 'Pam'],
    counteredBy: ['Mortis', 'Edgar', 'Mico', 'Lily', 'Kenji', 'Leon'],
    synergies: ['Frank', 'Buster', 'Draco', 'Bull']
  },
  Moe: {
    counters: ['Frank', 'Rosa', '8-Bit', 'Pam', 'Meg'],
    counteredBy: ['Piper', 'Belle', 'Angelo', 'Edgar', 'Mortis'],
    synergies: ['Gene', 'Sandy', 'Buster']
  }
};

async function updateMetadata() {
  console.log('Fetching all official brawlers from BrawlAPI...');
  let rawBrawlers = [];
  try {
    const res = await fetch('https://api.brawlapi.com/v1/brawlers');
    const json = await res.json();
    rawBrawlers = json.list || [];
  } catch (err) {
    console.error('Failed to fetch from BrawlAPI, trying fallback:', err.message);
  }

  if (rawBrawlers.length === 0) {
    console.error('Could not fetch brawlers list.');
    return;
  }

  console.log(`Fetched ${rawBrawlers.length} brawlers!`);

  // Transform to our Brawler schema
  const brawlers = rawBrawlers.map((b) => {
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
      iconUrl: b.imageUrl2 || b.imageUrl || `https://cdn.brawlify.com/brawlers/borderless/${b.id}.png`,
    };
  });

  // Group brawlers by class for archetype filling
  const brawlersByClass = {};
  brawlers.forEach((b) => {
    if (!brawlersByClass[b.class]) brawlersByClass[b.class] = [];
    brawlersByClass[b.class].push(b.displayName);
  });

  // Generate exhaustive counters matrix
  const countersMap = {};

  brawlers.forEach((b) => {
    const name = b.displayName;
    const bClass = b.class;
    const rule = ARCHETYPE_RULES[bClass] || ARCHETYPE_RULES['Damage Dealer'];
    const specific = SPECIFIC_MATCHUPS[name] || {};

    // Base counters from specific matchups or archetypes
    const countersSet = new Set(specific.counters || []);
    const counteredBySet = new Set(specific.counteredBy || []);
    const synergiesSet = new Set(specific.synergies || []);

    // Fill archetypal counters if specific list is small
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

    // Fill archetypal counteredBy if specific list is small
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

    // Fill archetypal synergies if specific list is small
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

    countersMap[name] = {
      counters: Array.from(countersSet),
      counteredBy: Array.from(counteredBySet),
      synergies: Array.from(synergiesSet),
    };
  });

  // Write files
  fs.writeFileSync(BRAWLERS_FILE, JSON.stringify(brawlers, null, 2), 'utf-8');
  console.log(`Saved ${brawlers.length} brawlers to ${BRAWLERS_FILE}`);

  fs.writeFileSync(COUNTERS_FILE, JSON.stringify(countersMap, null, 2), 'utf-8');
  console.log(`Saved ${Object.keys(countersMap).length} counter profiles to ${COUNTERS_FILE}`);
}

updateMetadata();
