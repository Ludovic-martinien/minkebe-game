// © ONOKO-CRÉATIONS — Tous droits réservés.

// =========================================================
// NIVEAUX D'ÉVOLUTION — du Novice au Prix de Survie
// =========================================================

export interface LevelDef {
  level: number;
  name: string;
  xpRequired: number; // XP cumulée nécessaire pour atteindre ce niveau
  color: string;
}

export const LEVELS: LevelDef[] = [
  { level: 1, name: "Novice", xpRequired: 0, color: "#9ca3af" },
  { level: 2, name: "Survivant", xpRequired: 100, color: "#84cc16" },
  { level: 3, name: "Explorateur", xpRequired: 300, color: "#22c55e" },
  { level: 4, name: "Chasseur", xpRequired: 650, color: "#eab308" },
  { level: 5, name: "Survivant aguerri", xpRequired: 1200, color: "#f59e0b" },
  { level: 6, name: "Maître de la forêt", xpRequired: 1800, color: "#a855f7" },
  { level: 7, name: "Prix de Survie", xpRequired: 2500, color: "#fbbf24" },
];

export const MAX_LEVEL = LEVELS[LEVELS.length - 1].level;
export const MAX_XP = LEVELS[LEVELS.length - 1].xpRequired;
export const FINAL_LEVEL_NAME = LEVELS[LEVELS.length - 1].name;

export function levelFromXp(xp: number): number {
  let level = 1;
  for (const def of LEVELS) {
    if (xp >= def.xpRequired) level = def.level;
    else break;
  }
  return level;
}

export function levelInfo(level: number): LevelDef {
  return LEVELS.find((l) => l.level === level) ?? LEVELS[LEVELS.length - 1];
}

export function xpProgress(xp: number): { level: number; levelName: string; xp: number; next: number; progress: number; isMax: boolean } {
  const level = levelFromXp(xp);
  const def = levelInfo(level);
  const isMax = level >= MAX_LEVEL;
  const next = LEVELS[level] ?? def; // niveau suivant
  const nextXp = isMax ? def.xpRequired : next.xpRequired;
  const progress = isMax ? 1 : Math.min(1, Math.max(0, (xp - def.xpRequired) / (nextXp - def.xpRequired)));
  return { level, levelName: def.name, xp: xp, next: nextXp, progress, isMax };
}

// Récompenses d'XP par activité
export const XP = {
  perHour: 5, // XP par heure de jeu de survie
  resource: 10,
  spear: 80,
  shelter: 250,
  weapon: 60,
  nsisim: 40,
  rest: 60,
  kill: {
    cephalophe: 40,
    potamochere: 80,
    buffle: 200,
  } as Record<string, number>,
};
