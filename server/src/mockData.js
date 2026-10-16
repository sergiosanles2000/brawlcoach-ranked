// Mock player profile used when API token is missing or IP is not whitelisted by Supercell

export function generateMockPlayer(tag) {
  const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
  
  return {
    isMock: true,
    tag: cleanTag,
    name: "RankedPro",
    nameColor: "0xffd700",
    icon: { id: 28000000 },
    trophies: 34500,
    highestTrophies: 36200,
    expLevel: 185,
    expPoints: 48500,
    isQualifiedFromChampionshipChallenge: true,
    "3vs3Victories": 8900,
    soloVictories: 1200,
    duoVictories: 1450,
    bestRoboRumbleTime: 16,
    bestTimeAsBigBrawler: 195,
    club: {
      tag: "#2Y9UQL",
      name: "Masters Elite"
    },
    brawlers: [
      {
        id: 16000000,
        name: "SHELLY",
        power: 11,
        rank: 30,
        trophies: 1000,
        highestTrophies: 1020,
        gears: [{ id: 62000000, name: "Speed" }, { id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000076, name: "Band-Aid" }],
        gadgets: [{ id: 23000255, name: "Fast Forward" }]
      },
      {
        id: 16000015,
        name: "PIPER",
        power: 11,
        rank: 32,
        trophies: 1100,
        highestTrophies: 1150,
        gears: [{ id: 62000001, name: "Health" }, { id: 62000004, name: "Shield" }],
        starPowers: [{ id: 23000085, name: "Snappy Sniping" }],
        gadgets: [{ id: 23000264, name: "Auto Aimer" }]
      },
      {
        id: 16000020,
        name: "FRANK",
        power: 11,
        rank: 29,
        trophies: 950,
        highestTrophies: 980,
        gears: [{ id: 62000002, name: "Damage" }, { id: 62000001, name: "Health" }],
        starPowers: [{ id: 23000095, name: "Power Grab" }],
        gadgets: [{ id: 23000274, name: "Active Noise Canceling" }]
      },
      {
        id: 16000036,
        name: "GALE",
        power: 11,
        rank: 28,
        trophies: 900,
        highestTrophies: 940,
        gears: [{ id: 62000000, name: "Speed" }, { id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000150, name: "Freezing Snow" }],
        gadgets: [{ id: 23000329, name: "Twister" }]
      },
      {
        id: 16000046,
        name: "BELLE",
        power: 11,
        rank: 30,
        trophies: 1000,
        highestTrophies: 1030,
        gears: [{ id: 62000003, name: "Reload" }, { id: 62000004, name: "Shield" }],
        starPowers: [{ id: 23000185, name: "Positive Feedback" }],
        gadgets: [{ id: 23000364, name: "Nest Egg" }]
      },
      {
        id: 16000062,
        name: "BUSTER",
        power: 11,
        rank: 29,
        trophies: 950,
        highestTrophies: 990,
        gears: [{ id: 62000002, name: "Damage" }, { id: 62000001, name: "Health" }],
        starPowers: [{ id: 23000230, name: "Blockbuster" }],
        gadgets: [{ id: 23000409, name: "Slo-Mo Replay" }]
      },
      {
        id: 16000075,
        name: "LARRY & LAWRIE",
        power: 10,
        rank: 27,
        trophies: 850,
        highestTrophies: 890,
        gears: [{ id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000270, name: "Protocol: Protect" }],
        gadgets: [{ id: 23000449, name: "Order: Swap" }]
      },
      {
        id: 16000077,
        name: "ANGELO",
        power: 11,
        rank: 31,
        trophies: 1050,
        highestTrophies: 1090,
        gears: [{ id: 62000000, name: "Speed" }, { id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000278, name: "Empower" }],
        gadgets: [{ id: 23000457, name: "Stinging Flight" }]
      },
      {
        id: 16000041,
        name: "LOU",
        power: 10,
        rank: 26,
        trophies: 800,
        highestTrophies: 840,
        gears: [{ id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000165, name: "Supercool" }],
        gadgets: [{ id: 23000344, name: "Ice Block" }]
      },
      {
        id: 16000021,
        name: "GENE",
        power: 11,
        rank: 28,
        trophies: 900,
        highestTrophies: 920,
        gears: [{ id: 62000004, name: "Shield" }, { id: 62000001, name: "Health" }],
        starPowers: [{ id: 23000098, name: "Magic Puffs" }],
        gadgets: [{ id: 23000277, name: "Lamp Blowout" }]
      },
      {
        id: 16000028,
        name: "SANDY",
        power: 11,
        rank: 29,
        trophies: 950,
        highestTrophies: 970,
        gears: [{ id: 62000000, name: "Speed" }, { id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000120, name: "Rude Sands" }],
        gadgets: [{ id: 23000299, name: "Sleep Stimulator" }]
      },
      {
        id: 16000038,
        name: "SURGE",
        power: 11,
        rank: 30,
        trophies: 1000,
        highestTrophies: 1040,
        gears: [{ id: 62000004, name: "Shield" }, { id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000155, name: "Serve Ice Cold" }],
        gadgets: [{ id: 23000334, name: "Power Surge" }]
      },
      {
        id: 16000023,
        name: "LEON",
        power: 11,
        rank: 28,
        trophies: 900,
        highestTrophies: 930,
        gears: [{ id: 62000002, name: "Damage" }, { id: 62000000, name: "Speed" }],
        starPowers: [{ id: 23000105, name: "Invisiheal" }],
        gadgets: [{ id: 23000284, name: "Lollipop Drop" }]
      },
      {
        id: 16000043,
        name: "EDGAR",
        power: 9,
        rank: 24,
        trophies: 700,
        highestTrophies: 750,
        gears: [{ id: 62000004, name: "Shield" }],
        starPowers: [{ id: 23000170, name: "Hard Landing" }],
        gadgets: [{ id: 23000349, name: "Let's Fly" }]
      },
      {
        id: 16000081,
        name: "CLANCY",
        power: 11,
        rank: 31,
        trophies: 1050,
        highestTrophies: 1080,
        gears: [{ id: 62000002, name: "Damage" }, { id: 62000000, name: "Speed" }],
        starPowers: [{ id: 23000290, name: "Recon" }],
        gadgets: [{ id: 23000470, name: "Snappy Shooting" }]
      },
      {
        id: 16000076,
        name: "MELODIE",
        power: 11,
        rank: 30,
        trophies: 1000,
        highestTrophies: 1030,
        gears: [{ id: 62000004, name: "Shield" }, { id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000275, name: "Fast Beats" }],
        gadgets: [{ id: 23000454, name: "Perfect Pitch" }]
      },
      {
        id: 16000039,
        name: "COLETTE",
        power: 11,
        rank: 29,
        trophies: 950,
        highestTrophies: 980,
        gears: [{ id: 62000004, name: "Shield" }, { id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000160, name: "Push It" }],
        gadgets: [{ id: 23000339, name: "Na-Ah!" }]
      },
      {
        id: 16000002,
        name: "BULL",
        power: 9,
        rank: 23,
        trophies: 650,
        highestTrophies: 700,
        gears: [{ id: 62000001, name: "Health" }],
        starPowers: [{ id: 23000080, name: "Tough Guy" }],
        gadgets: [{ id: 23000259, name: "T-Bone Injector" }]
      },
      {
        id: 16000007,
        name: "POCO",
        power: 10,
        rank: 25,
        trophies: 750,
        highestTrophies: 800,
        gears: [{ id: 62000001, name: "Health" }],
        starPowers: [{ id: 23000090, name: "Da Capo!" }],
        gadgets: [{ id: 23000269, name: "Tuning Fork" }]
      },
      {
        id: 16000024,
        name: "ROSA",
        power: 9,
        rank: 23,
        trophies: 650,
        highestTrophies: 710,
        gears: [{ id: 62000000, name: "Speed" }],
        starPowers: [{ id: 23000110, name: "Plant Life" }],
        gadgets: [{ id: 23000289, name: "Grow Light" }]
      },
      {
        id: 16000079,
        name: "DRACO",
        power: 11,
        rank: 29,
        trophies: 950,
        highestTrophies: 990,
        gears: [{ id: 62000002, name: "Damage" }, { id: 62000001, name: "Health" }],
        starPowers: [{ id: 23000285, name: "Expose" }],
        gadgets: [{ id: 23000465, name: "Upper Cut" }]
      },
      {
        id: 16000083,
        name: "KENJI",
        power: 11,
        rank: 30,
        trophies: 1000,
        highestTrophies: 1020,
        gears: [{ id: 62000004, name: "Shield" }, { id: 62000002, name: "Damage" }],
        starPowers: [{ id: 23000295, name: "Nigiri Nemesis" }],
        gadgets: [{ id: 23000475, name: "Dashi Dash" }]
      }
    ]
  };
}
