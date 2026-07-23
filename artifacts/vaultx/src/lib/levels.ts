export type ConditionType = 'skp' | 'invites' | 'miningLevel' | 'adsWatched' | 'tasksCompleted' | 'passiveCards';

export type LevelCondition = {
  type: ConditionType;
  value: number;
  label: string;
  labelAr: string;
  icon: string;
};

export type LevelTier = {
  name: string;
  nameAr: string;
  color: string;
  glow: string;
  icon: string;
  from: number;
  to: number;
};

export type LevelDef = {
  level: number;
  name: string;
  nameAr: string;
  tier: LevelTier;
  skpRequired: number;
  videosRequired: number;
  starsSkipCost: number;
  conditions: LevelCondition[];
  unlocks?: { feature: string; featureAr: string; icon: string };
  miningBonus?: number;
};

export const TIERS: LevelTier[] = [
  { name: 'Rookie',      nameAr: 'مبتدئ',      color: '#94a3b8', glow: 'rgba(148,163,184,0.3)', icon: '🥉', from: 1,  to: 10  },
  { name: 'Explorer',    nameAr: 'مستكشف',     color: '#60a5fa', glow: 'rgba(96,165,250,0.3)',   icon: '🔵', from: 11, to: 20  },
  { name: 'Hunter',      nameAr: 'صياد',        color: '#34d399', glow: 'rgba(52,211,153,0.3)',   icon: '🟢', from: 21, to: 30  },
  { name: 'Warrior',     nameAr: 'محارب',       color: '#fbbf24', glow: 'rgba(251,191,36,0.3)',   icon: '🟡', from: 31, to: 40  },
  { name: 'Champion',    nameAr: 'بطل',         color: '#f97316', glow: 'rgba(249,115,22,0.35)',  icon: '🟠', from: 41, to: 50  },
  { name: 'Master',      nameAr: 'ماستر',       color: '#f87171', glow: 'rgba(248,113,113,0.35)', icon: '🔴', from: 51, to: 60  },
  { name: 'Legend',      nameAr: 'أسطورة',      color: '#c084fc', glow: 'rgba(192,132,252,0.4)',  icon: '🟣', from: 61, to: 70  },
  { name: 'Titan',       nameAr: 'تيتان',       color: '#818cf8', glow: 'rgba(129,140,248,0.4)',  icon: '🔷', from: 71, to: 80  },
  { name: 'Immortal',    nameAr: 'خالد',        color: '#e879f9', glow: 'rgba(232,121,249,0.4)',  icon: '💜', from: 81, to: 90  },
  { name: 'Grandmaster', nameAr: 'جراند ماستر', color: '#f5c518', glow: 'rgba(245,197,24,0.5)',   icon: '👑', from: 91, to: 100 },
];

function getTier(level: number): LevelTier {
  return TIERS.find(t => level >= t.from && level <= t.to) ?? TIERS[0];
}

// SKP required per level (lifetime points)
const SKP_TABLE: number[] = [
  /* 01 */          0,
  /* 02 */      2_000,
  /* 03 */      6_000,
  /* 04 */     14_000,
  /* 05 */     30_000,
  /* 06 */     65_000,
  /* 07 */    130_000,
  /* 08 */    260_000,
  /* 09 */    520_000,
  /* 10 */  1_000_000,
  /* 11 */  2_000_000,
  /* 12 */  4_000_000,
  /* 13 */  8_000_000,
  /* 14 */ 15_000_000,
  /* 15 */ 30_000_000,
  /* 16 */ 60_000_000,
  /* 17 */110_000_000,
  /* 18 */200_000_000,
  /* 19 */380_000_000,
  /* 20 */700_000_000,
  /* 21 */   1_300_000_000,
  /* 22 */   2_400_000_000,
  /* 23 */   4_500_000_000,
  /* 24 */   8_500_000_000,
  /* 25 */  16_000_000_000,
  /* 26 */  30_000_000_000,
  /* 27 */  56_000_000_000,
  /* 28 */ 104_000_000_000,
  /* 29 */ 194_000_000_000,
  /* 30 */ 360_000_000_000,
  /* 31 */    670_000_000_000,
  /* 32 */  1_250_000_000_000,
  /* 33 */  2_300_000_000_000,
  /* 34 */  4_300_000_000_000,
  /* 35 */  8_000_000_000_000,
  /* 36 */ 15_000_000_000_000,
  /* 37 */ 28_000_000_000_000,
  /* 38 */ 52_000_000_000_000,
  /* 39 */ 97_000_000_000_000,
  /* 40 */180_000_000_000_000,
  /* 41 */    335_000_000_000_000,
  /* 42 */    625_000_000_000_000,
  /* 43 */  1_160_000_000_000_000,
  /* 44 */  2_160_000_000_000_000,
  /* 45 */  4_000_000_000_000_000,
  /* 46 */  7_500_000_000_000_000,
  /* 47 */ 14_000_000_000_000_000,
  /* 48 */ 26_000_000_000_000_000,
  /* 49 */ 48_000_000_000_000_000,
  /* 50 */ 90_000_000_000_000_000,
  /* 51 */    170_000_000_000_000_000,
  /* 52 */    315_000_000_000_000_000,
  /* 53 */    590_000_000_000_000_000,
  /* 54 */  1_100_000_000_000_000_000,
  /* 55 */  2_000_000_000_000_000_000,
  /* 56 */  3_700_000_000_000_000_000,
  /* 57 */  6_900_000_000_000_000_000,
  /* 58 */ 12_800_000_000_000_000_000,
  /* 59 */ 24_000_000_000_000_000_000,
  /* 60 */ 44_000_000_000_000_000_000,
  /* 61 */  82_000_000_000_000_000_000,
  /* 62 */ 153_000_000_000_000_000_000,
  /* 63 */ 284_000_000_000_000_000_000,
  /* 64 */ 530_000_000_000_000_000_000,
  /* 65 */ 986_000_000_000_000_000_000,
  /* 66 */ 1_835_000_000_000_000_000_000,
  /* 67 */ 3_415_000_000_000_000_000_000,
  /* 68 */ 6_360_000_000_000_000_000_000,
  /* 69 */ 11_830_000_000_000_000_000_000,
  /* 70 */ 22_010_000_000_000_000_000_000,
  /* 71 */  41_000_000_000_000_000_000_000,
  /* 72 */  76_000_000_000_000_000_000_000,
  /* 73 */ 142_000_000_000_000_000_000_000,
  /* 74 */ 264_000_000_000_000_000_000_000,
  /* 75 */ 492_000_000_000_000_000_000_000,
  /* 76 */ 915_000_000_000_000_000_000_000,
  /* 77 */ 1_703_000_000_000_000_000_000_000,
  /* 78 */ 3_170_000_000_000_000_000_000_000,
  /* 79 */ 5_900_000_000_000_000_000_000_000,
  /* 80 */ 10_980_000_000_000_000_000_000_000,
  /* 81 */  20_000_000_000_000_000_000_000_000,
  /* 82 */  38_000_000_000_000_000_000_000_000,
  /* 83 */  70_000_000_000_000_000_000_000_000,
  /* 84 */ 130_000_000_000_000_000_000_000_000,
  /* 85 */ 242_000_000_000_000_000_000_000_000,
  /* 86 */ 450_000_000_000_000_000_000_000_000,
  /* 87 */ 840_000_000_000_000_000_000_000_000,
  /* 88 */ 1_560_000_000_000_000_000_000_000_000,
  /* 89 */ 2_900_000_000_000_000_000_000_000_000,
  /* 90 */ 5_400_000_000_000_000_000_000_000_000,
  /* 91 */  10_000_000_000_000_000_000_000_000_000,
  /* 92 */  18_600_000_000_000_000_000_000_000_000,
  /* 93 */  34_600_000_000_000_000_000_000_000_000,
  /* 94 */  64_400_000_000_000_000_000_000_000_000,
  /* 95 */ 119_800_000_000_000_000_000_000_000_000,
  /* 96 */ 222_900_000_000_000_000_000_000_000_000,
  /* 97 */ 414_600_000_000_000_000_000_000_000_000,
  /* 98 */ 771_000_000_000_000_000_000_000_000_000,
  /* 99 */ 1_434_000_000_000_000_000_000_000_000_000,
  /* 100 */2_668_000_000_000_000_000_000_000_000_000,
];

// Level names
const LEVEL_NAMES: [string, string][] = [
  ['Newcomer',      'وافد جديد'],    // 1
  ['Beginner',      'مبتدئ'],        // 2
  ['Apprentice',    'متدرب'],        // 3
  ['Initiate',      'متعلم'],        // 4
  ['Recruit',       'مجند'],         // 5
  ['Seeker',        'باحث'],         // 6
  ['Learner',       'دارس'],         // 7
  ['Trainee',       'متدرب II'],     // 8
  ['Novice',        'مستجد'],        // 9
  ['Adept',         'ماهر'],         // 10
  ['Scout',         'كشاف'],         // 11
  ['Wanderer',      'جوّال'],        // 12
  ['Pathfinder',    'مكتشف طريق'],  // 13
  ['Trailblazer',   'رائد'],         // 14
  ['Prospector',    'مستكشف كنوز'], // 15
  ['Rover',         'مستكشف'],      // 16
  ['Pioneer',       'رائد II'],      // 17
  ['Voyager',       'مسافر'],        // 18
  ['Navigator',     'ملاح'],         // 19
  ['Ranger',        'حارس الغابة'], // 20
  ['Soldier',       'جندي'],         // 21
  ['Guard',         'حارس'],         // 22
  ['Knight',        'فارس'],         // 23
  ['Squire',        'درع'],          // 24
  ['Sentinel',      'حارس الحدود'], // 25
  ['Protector',     'حامي'],         // 26
  ['Defender',      'مدافع'],        // 27
  ['Warrior',       'محارب'],        // 28
  ['Gladiator',     'مصارع'],        // 29
  ['Champion',      'بطل الساحة'],  // 30
  ['Enforcer',      'منفذ'],         // 31
  ['Striker',       'مهاجم'],        // 32
  ['Raider',        'غازي'],         // 33
  ['Marauder',      'غارة'],         // 34
  ['Crusader',      'صليبي'],        // 35
  ['Conqueror',     'فاتح'],         // 36
  ['Vanquisher',    'قاهر'],         // 37
  ['Overlord',      'سيد الأرض'],   // 38
  ['Sovereign',     'سيادة'],        // 39
  ['Warlord',       'أمير الحرب'],  // 40
  ['Veteran',       'محارب قديم'],  // 41
  ['Elite',         'نخبة'],         // 42
  ['Expert',        'خبير'],         // 43
  ['Specialist',    'متخصص'],        // 44
  ['Sharpshooter',  'قناص'],         // 45
  ['Commander',     'قائد'],         // 46
  ['Captain',       'كابتن'],        // 47
  ['Major',         'رائد'],         // 48
  ['Colonel',       'عقيد'],         // 49
  ['General',       'جنرال'],        // 50
  ['Sage',          'حكيم'],         // 51
  ['Sorcerer',      'ساحر'],         // 52
  ['Mystic',        'صوفي'],         // 53
  ['Oracle',        'عرّاف'],        // 54
  ['Warlock',       'شعوذة'],        // 55
  ['Wizard',        'ساحر II'],      // 56
  ['Enchanter',     'ساحر فتنة'],   // 57
  ['Archmage',      'الساحر الأكبر'], // 58
  ['Grand Wizard',  'ساحر عظيم'],   // 59
  ['Supreme Mage',  'سيد السحر'],   // 60
  ['Hero',          'بطل'],          // 61
  ['Legend',        'أسطورة'],       // 62
  ['Myth',          'ملحمة'],        // 63
  ['Paragon',       'نموذج'],        // 64
  ['Pinnacle',      'قمة'],          // 65
  ['Ascendant',     'صاعد'],         // 66
  ['Celestial',     'سماوي'],        // 67
  ['Ethereal',      'أثيري'],        // 68
  ['Transcendent',  'متسام'],        // 69
  ['Apex',          'القمة المطلقة'], // 70
  ['Titan',         'تيتان'],         // 71
  ['Colossus',      'عملاق'],        // 72
  ['Behemoth',      'بهيموث'],       // 73
  ['Leviathan',     'لويثان'],       // 74
  ['Juggernaut',    'جاغرناوت'],     // 75
  ['Primordial',    'أزلي'],         // 76
  ['Ancient',       'قديم'],         // 77
  ['Archon',        'آرخون'],        // 78
  ['Sovereign II',  'سيادة II'],     // 79
  ['Emperor',       'إمبراطور'],     // 80
  ['Immortal',      'خالد'],         // 81
  ['Undying',       'لا يموت'],      // 82
  ['Eternal',       'أبدي'],         // 83
  ['Infinite',      'لا نهائي'],     // 84
  ['Boundless',     'بلا حدود'],     // 85
  ['Omnipotent',    'كلي القدرة'],   // 86
  ['Omniscient',    'كلي المعرفة'],  // 87
  ['Almighty',      'العظيم'],       // 88
  ['Divine',        'إلهي'],         // 89
  ['Supreme',       'الأعلى'],       // 90
  ['Grand Legend',  'أسطورة عظمى'],  // 91
  ['Grand Master',  'ماستر عظيم'],   // 92
  ['Royal Master',  'ماستر ملكي'],   // 93
  ['Celestial Master', 'ماستر سماوي'], // 94
  ['Supreme Master', 'الماستر الأعلى'], // 95
  ['Ascended',      'المرتقي'],       // 96
  ['Transcended',   'المتخطي'],       // 97
  ['Absolute',      'المطلق'],        // 98
  ['Infinite Master', 'ماستر أبدي'],  // 99
  ['Grandmaster',   'جراند ماستر'],   // 100
];

// Feature unlocks by level
const UNLOCKS: Record<number, { feature: string; featureAr: string; icon: string }> = {
  2:  { feature: 'Friends Tab',    featureAr: 'تبويب الأصدقاء',  icon: '👥' },
  4:  { feature: 'Games Tab',      featureAr: 'تبويب الألعاب',   icon: '🎮' },
  6:  { feature: 'Tasks Tab',      featureAr: 'تبويب المهام',    icon: '📋' },
  10: { feature: 'Squad Tab',      featureAr: 'تبويب الفرقة',    icon: '🛡️' },
  15: { feature: 'Pixels Tab',     featureAr: 'تبويب البيكسل',   icon: '🔲' },
  20: { feature: 'Stars Tab',      featureAr: 'تبويب النجوم',    icon: '⭐' },
  25: { feature: 'SKX Conversion', featureAr: 'تحويل SKX',       icon: '💱' },
  30: { feature: '+5% Mining Bonus', featureAr: '+٥٪ مكافأة تعدين', icon: '⚡' },
  40: { feature: '+10% Mining Bonus', featureAr: '+١٠٪ مكافأة تعدين', icon: '⚡' },
  50: { feature: '+20% Mining Bonus', featureAr: '+٢٠٪ مكافأة تعدين', icon: '⚡' },
  60: { feature: 'Elite Badge',    featureAr: 'شارة النخبة',     icon: '🏅' },
  75: { feature: 'Legend Badge',   featureAr: 'شارة الأسطورة',   icon: '🎖️' },
  100:{ feature: 'Grandmaster Crown', featureAr: 'تاج الجراند ماستر', icon: '👑' },
};

// Mining bonus percentage (cumulative) per level
const MINING_BONUS: Record<number, number> = {
  10: 2, 15: 3, 20: 4, 25: 5, 30: 5, 35: 6, 40: 10, 45: 12, 50: 20,
  55: 22, 60: 25, 65: 28, 70: 30, 75: 33, 80: 36, 90: 40, 100: 50,
};

function buildConditions(level: number): LevelCondition[] {
  const conds: LevelCondition[] = [];

  // Invite conditions (every 5 levels)
  const inviteMap: Record<number, number> = {
    5: 1, 10: 3, 15: 5, 20: 10, 25: 15, 30: 25,
    35: 35, 40: 50, 45: 75, 50: 100,
    55: 150, 60: 200, 65: 300, 70: 400,
    75: 500, 80: 700, 85: 900, 90: 1200,
    95: 1600, 100: 2000,
  };
  if (inviteMap[level]) {
    conds.push({
      type: 'invites',
      value: inviteMap[level],
      label: `Invite ${inviteMap[level]} friend${inviteMap[level] > 1 ? 's' : ''}`,
      labelAr: `دعوة ${inviteMap[level]} صديق`,
      icon: '👥',
    });
  }

  // Ads watched conditions (every 3 levels starting from 3)
  const adsMap: Record<number, number> = {
    3: 3, 6: 10, 9: 25, 12: 50, 15: 100,
    18: 200, 21: 350, 24: 550, 27: 800, 30: 1100,
    33: 1500, 36: 2000, 39: 2700, 42: 3600, 45: 4700,
    48: 6000, 51: 7500, 54: 9500, 57: 12000, 60: 15000,
    63: 19000, 66: 24000, 69: 30000, 72: 37000, 75: 45000,
    78: 55000, 81: 67000, 84: 82000, 87: 100000, 90: 120000,
    93: 145000, 96: 175000, 99: 210000,
  };
  if (adsMap[level]) {
    conds.push({
      type: 'adsWatched',
      value: adsMap[level],
      label: `Watch ${adsMap[level].toLocaleString()} ads total`,
      labelAr: `مشاهدة ${adsMap[level].toLocaleString()} إعلان إجمالياً`,
      icon: '📺',
    });
  }

  // Mining level conditions
  const miningMap: Record<number, number> = {
    5: 2, 8: 3, 10: 5, 13: 7, 15: 9, 18: 12, 20: 14, 23: 17,
    25: 19, 28: 22, 30: 25,
  };
  if (miningMap[level]) {
    conds.push({
      type: 'miningLevel',
      value: miningMap[level],
      label: `Reach Mining Level ${miningMap[level]}`,
      labelAr: `الوصول لمستوى التعدين ${miningMap[level]}`,
      icon: '⛏️',
    });
  }

  // Tasks completed conditions
  const tasksMap: Record<number, number> = {
    7: 5, 14: 15, 21: 30, 28: 50, 35: 80, 42: 120,
    49: 180, 56: 260, 63: 380, 70: 550, 77: 800, 84: 1200, 91: 2000, 98: 3000,
  };
  if (tasksMap[level]) {
    conds.push({
      type: 'tasksCompleted',
      value: tasksMap[level],
      label: `Complete ${tasksMap[level]} tasks`,
      labelAr: `إنجاز ${tasksMap[level]} مهمة`,
      icon: '✅',
    });
  }

  // Passive cards conditions
  const passiveMap: Record<number, number> = {
    11: 1, 16: 2, 22: 3, 29: 4, 36: 5, 43: 6,
  };
  if (passiveMap[level]) {
    conds.push({
      type: 'passiveCards',
      value: passiveMap[level],
      label: `Own ${passiveMap[level]} passive card${passiveMap[level] > 1 ? 's' : ''}`,
      labelAr: `امتلاك ${passiveMap[level]} بطاقة دخل`,
      icon: '💳',
    });
  }

  return conds;
}

// Videos required per level: floor((i)^1.5 * 0.4) — level 10≈6, level 50≈137, level 100≈394
const VIDEOS_TABLE: number[] = Array.from({ length: 100 }, (_, i) =>
  Math.floor(Math.pow(i, 1.5) * 0.4)
);

// Stars skip cost by tier index (Rookie→Grandmaster)
const TIER_STARS_COSTS = [50, 75, 100, 150, 200, 250, 300, 350, 400, 400];
function getStarsSkipCost(level: number): number {
  const tierIdx = TIERS.findIndex(t => level >= t.from && level <= t.to);
  return TIER_STARS_COSTS[Math.max(0, tierIdx)] ?? 400;
}

// Build all 100 levels
export const LEVELS: LevelDef[] = Array.from({ length: 100 }, (_, i) => {
  const level = i + 1;
  const [name, nameAr] = LEVEL_NAMES[i];
  const tier = getTier(level);
  const miningBonus = MINING_BONUS[level];

  return {
    level,
    name,
    nameAr,
    tier,
    skpRequired: SKP_TABLE[i],
    videosRequired: VIDEOS_TABLE[i],
    starsSkipCost: getStarsSkipCost(level),
    conditions: buildConditions(level),
    unlocks: UNLOCKS[level],
    miningBonus,
  };
});

// Helpers
export function getLevelDef(level: number): LevelDef {
  return LEVELS[Math.max(0, Math.min(level - 1, 99))];
}

export function computeLevel(
  lifetimePoints: number,
  videosWatched: number,
  starsPaidLevel: number,
): number {
  // Find highest level reachable by SKP
  let skpLevel = 1;
  for (let i = 0; i < LEVELS.length; i++) {
    if (lifetimePoints >= LEVELS[i].skpRequired) skpLevel = LEVELS[i].level;
    else break;
  }
  // Find highest level reachable by videos
  let videoLevel = 1;
  for (let i = 0; i < LEVELS.length; i++) {
    if (videosWatched >= LEVELS[i].videosRequired) videoLevel = LEVELS[i].level;
    else break;
  }
  // Both SKP and videos must be earned; Stars skip overrides
  const earnedLevel = Math.min(skpLevel, videoLevel);
  return Math.max(earnedLevel, Math.min(Math.max(starsPaidLevel, 0), 100));
}

export function getLevelProgress(
  lifetimePoints: number,
  currentLevel: number,
): { progress: number; currentSkp: number; nextSkp: number } {
  const currentDef = LEVELS[currentLevel - 1];
  const nextDef = LEVELS[currentLevel]; // may be undefined at level 100
  if (!nextDef) return { progress: 100, currentSkp: lifetimePoints, nextSkp: currentDef.skpRequired };

  const range = nextDef.skpRequired - currentDef.skpRequired;
  const earned = lifetimePoints - currentDef.skpRequired;
  const progress = range <= 0 ? 100 : Math.min(100, Math.floor((earned / range) * 100));
  return { progress, currentSkp: lifetimePoints, nextSkp: nextDef.skpRequired };
}

export function formatSkpShort(n: number): string {
  if (n >= 1e33) return `${(n / 1e33).toFixed(1)}D`;
  if (n >= 1e30) return `${(n / 1e30).toFixed(1)}N`;
  if (n >= 1e27) return `${(n / 1e27).toFixed(1)}O`;
  if (n >= 1e24) return `${(n / 1e24).toFixed(1)}S`;
  if (n >= 1e21) return `${(n / 1e21).toFixed(1)}Sx`;
  if (n >= 1e18) return `${(n / 1e18).toFixed(1)}Qt`;
  if (n >= 1e15) return `${(n / 1e15).toFixed(1)}Q`;
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

// Which tab/feature each level gates
export const FEATURE_LEVEL_REQUIRED: Record<string, number> = {
  friends: 2,
  games:   4,
  tasks:   6,
  squad:   10,
  pixels:  15,
  stars:   20,
};
