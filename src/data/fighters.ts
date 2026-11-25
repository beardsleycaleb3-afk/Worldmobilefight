export type HeadStyle =
  | 'topknot'
  | 'headband_braid'
  | 'flattop'
  | 'swept'
  | 'turban_beard'
  | 'locks'
  | 'fade'
  | 'bandana';

export type LandmarkType =
  | 'taj_arch'
  | 'pagoda'
  | 'steel_bridge'
  | 'volcano_temple'
  | 'fort_minaret'
  | 'lagos_skyline'
  | 'rio_peaks'
  | 'river_arch';

export interface FighterProfile {
  id: string;
  rank: number;
  country: string;
  countryCode: string;
  populationLabel: string;
  name: string;
  epithet: string;
  discipline: string;
  signatureMove: string;
  heightCm: number;
  weightKg: number;
  stats: {
    power: number;
    speed: number;
    reach: number;
  };
  appearance: {
    skinHex: string;
    hairHex: string;
    trunksHex: string;
    accentHex: string;
    wrapHex: string;
    headStyle: HeadStyle;
    hasBeard: boolean;
    hasMustache: boolean;
    shoulderScale: number;
    chestScale: number;
    armScale: number;
    legScale: number;
    heightScale: number;
  };
  arena: {
    name: string;
    skyTop: string;
    skyBottom: string;
    horizonHex: string;
    matPrimary: string;
    matAccent: string;
    landmark: LandmarkType;
  };
}

export const FIGHTERS: FighterProfile[] = [
  {
    id: 'india-vikram',
    rank: 1,
    country: 'India',
    countryCode: 'IND',
    populationLabel: '1.45B',
    name: 'Vikram Rathore',
    epithet: 'Iron Pehelwan',
    discipline: 'Kushti Wrestling',
    signatureMove: 'Vajra Palm Slam',
    heightCm: 193,
    weightKg: 132,
    stats: { power: 93, speed: 75, reach: 86 },
    appearance: {
      skinHex: '#9c6644',
      hairHex: '#181412',
      trunksHex: '#ea580c',
      accentHex: '#facc15',
      wrapHex: '#f5efe6',
      headStyle: 'topknot',
      hasBeard: false,
      hasMustache: true,
      shoulderScale: 1.14,
      chestScale: 1.16,
      armScale: 1.12,
      legScale: 1.15,
      heightScale: 1.03,
    },
    arena: {
      name: 'Jaipur Akhara Pit',
      skyTop: '#24142c',
      skyBottom: '#9a3412',
      horizonHex: '#f59e0b',
      matPrimary: '#7c4a2d',
      matAccent: '#d97706',
      landmark: 'taj_arch',
    },
  },
  {
    id: 'china-zhao',
    rank: 2,
    country: 'China',
    countryCode: 'CHN',
    populationLabel: '1.41B',
    name: 'Zhao Shen',
    epithet: 'Jade Colossus',
    discipline: 'Bajiquan Iron Body',
    signatureMove: 'Dragon Shoulder Ram',
    heightCm: 190,
    weightKg: 124,
    stats: { power: 89, speed: 84, reach: 83 },
    appearance: {
      skinHex: '#d4a373',
      hairHex: '#111216',
      trunksHex: '#b91c1c',
      accentHex: '#10b981',
      wrapHex: '#fef3c7',
      headStyle: 'headband_braid',
      hasBeard: false,
      hasMustache: false,
      shoulderScale: 1.1,
      chestScale: 1.12,
      armScale: 1.08,
      legScale: 1.1,
      heightScale: 1.0,
    },
    arena: {
      name: 'Mount Song Courtyard',
      skyTop: '#0f172a',
      skyBottom: '#7f1d1d',
      horizonHex: '#fbbf24',
      matPrimary: '#334155',
      matAccent: '#dc2626',
      landmark: 'pagoda',
    },
  },
  {
    id: 'usa-marcus',
    rank: 3,
    country: 'United States',
    countryCode: 'USA',
    populationLabel: '345M',
    name: 'Marcus Vance',
    epithet: 'Gridiron Titan',
    discipline: 'Heavyweight Boxing',
    signatureMove: 'Haymaker Blitz',
    heightCm: 196,
    weightKg: 136,
    stats: { power: 95, speed: 78, reach: 89 },
    appearance: {
      skinHex: '#6c4331',
      hairHex: '#171717',
      trunksHex: '#1d4ed8',
      accentHex: '#e2e8f0',
      wrapHex: '#dc2626',
      headStyle: 'flattop',
      hasBeard: true,
      hasMustache: true,
      shoulderScale: 1.16,
      chestScale: 1.15,
      armScale: 1.18,
      legScale: 1.1,
      heightScale: 1.05,
    },
    arena: {
      name: 'Brooklyn Steel Dock',
      skyTop: '#090d16',
      skyBottom: '#1e3a8a',
      horizonHex: '#60a5fa',
      matPrimary: '#1e293b',
      matAccent: '#3b82f6',
      landmark: 'steel_bridge',
    },
  },
  {
    id: 'indonesia-bima',
    rank: 4,
    country: 'Indonesia',
    countryCode: 'IDN',
    populationLabel: '283M',
    name: 'Bima Santoso',
    epithet: 'Volcanic Garuda',
    discipline: 'Pencak Silat Heavy',
    signatureMove: 'Krakatoa Elbow',
    heightCm: 186,
    weightKg: 118,
    stats: { power: 86, speed: 90, reach: 80 },
    appearance: {
      skinHex: '#a47148',
      hairHex: '#141414',
      trunksHex: '#1c1917',
      accentHex: '#f59e0b',
      wrapHex: '#b45309',
      headStyle: 'swept',
      hasBeard: false,
      hasMustache: false,
      shoulderScale: 1.08,
      chestScale: 1.1,
      armScale: 1.06,
      legScale: 1.12,
      heightScale: 0.97,
    },
    arena: {
      name: 'Merapi Stone Ring',
      skyTop: '#18111c',
      skyBottom: '#7c2d12',
      horizonHex: '#fb923c',
      matPrimary: '#292524',
      matAccent: '#f59e0b',
      landmark: 'volcano_temple',
    },
  },
  {
    id: 'pakistan-tariq',
    rank: 5,
    country: 'Pakistan',
    countryCode: 'PAK',
    populationLabel: '251M',
    name: 'Tariq Khan',
    epithet: 'Sher-e-Punjab',
    discipline: 'Kabaddi & Pehlwani',
    signatureMove: 'Lion Tackle',
    heightCm: 195,
    weightKg: 138,
    stats: { power: 96, speed: 72, reach: 90 },
    appearance: {
      skinHex: '#b07d56',
      hairHex: '#161616',
      trunksHex: '#047857',
      accentHex: '#f8fafc',
      wrapHex: '#10b981',
      headStyle: 'turban_beard',
      hasBeard: true,
      hasMustache: true,
      shoulderScale: 1.18,
      chestScale: 1.2,
      armScale: 1.15,
      legScale: 1.16,
      heightScale: 1.04,
    },
    arena: {
      name: 'Lahore Fort Arena',
      skyTop: '#062019',
      skyBottom: '#065f46',
      horizonHex: '#34d399',
      matPrimary: '#1f2937',
      matAccent: '#10b981',
      landmark: 'fort_minaret',
    },
  },
  {
    id: 'nigeria-chukwuemeka',
    rank: 6,
    country: 'Nigeria',
    countryCode: 'NGA',
    populationLabel: '233M',
    name: 'Chukwuemeka Okafor',
    epithet: 'Lagos Thunder',
    discipline: 'Dambe Heavy Fist',
    signatureMove: 'Thunder Spear Fist',
    heightCm: 194,
    weightKg: 130,
    stats: { power: 97, speed: 77, reach: 87 },
    appearance: {
      skinHex: '#4f3122',
      hairHex: '#0f0f0f',
      trunksHex: '#15803d',
      accentHex: '#facc15',
      wrapHex: '#facc15',
      headStyle: 'locks',
      hasBeard: true,
      hasMustache: false,
      shoulderScale: 1.15,
      chestScale: 1.14,
      armScale: 1.2,
      legScale: 1.1,
      heightScale: 1.03,
    },
    arena: {
      name: 'Eko Waterfront Ring',
      skyTop: '#081c15',
      skyBottom: '#1b4332',
      horizonHex: '#eab308',
      matPrimary: '#262626',
      matAccent: '#22c55e',
      landmark: 'lagos_skyline',
    },
  },
  {
    id: 'brazil-rafael',
    rank: 7,
    country: 'Brazil',
    countryCode: 'BRA',
    populationLabel: '212M',
    name: 'Rafael Silva',
    epithet: 'Rio Colosso',
    discipline: 'Luta Livre Heavy',
    signatureMove: 'Martelo Crusher',
    heightCm: 189,
    weightKg: 122,
    stats: { power: 88, speed: 89, reach: 84 },
    appearance: {
      skinHex: '#8d5b3c',
      hairHex: '#121010',
      trunksHex: '#0284c7',
      accentHex: '#facc15',
      wrapHex: '#38bdf8',
      headStyle: 'fade',
      hasBeard: true,
      hasMustache: true,
      shoulderScale: 1.12,
      chestScale: 1.11,
      armScale: 1.1,
      legScale: 1.16,
      heightScale: 0.99,
    },
    arena: {
      name: 'Copacabana Night Stage',
      skyTop: '#081226',
      skyBottom: '#0369a1',
      horizonHex: '#facc15',
      matPrimary: '#1e293b',
      matAccent: '#eab308',
      landmark: 'rio_peaks',
    },
  },
  {
    id: 'bangladesh-arif',
    rank: 8,
    country: 'Bangladesh',
    countryCode: 'BGD',
    populationLabel: '174M',
    name: 'Arif Rahman',
    epithet: 'Bengal Titan',
    discipline: 'Boli Khela Wrestling',
    signatureMove: 'Padma Uppercut',
    heightCm: 191,
    weightKg: 126,
    stats: { power: 91, speed: 81, reach: 83 },
    appearance: {
      skinHex: '#8f5f40',
      hairHex: '#141414',
      trunksHex: '#065f46',
      accentHex: '#ef4444',
      wrapHex: '#f43f5e',
      headStyle: 'bandana',
      hasBeard: true,
      hasMustache: true,
      shoulderScale: 1.13,
      chestScale: 1.14,
      armScale: 1.12,
      legScale: 1.12,
      heightScale: 1.01,
    },
    arena: {
      name: 'Chittagong Boli Arena',
      skyTop: '#0b1915',
      skyBottom: '#881337',
      horizonHex: '#34d399',
      matPrimary: '#3f2e26',
      matAccent: '#ef4444',
      landmark: 'river_arch',
    },
  },
];
