import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type Inventory = {
  Fruits: number;
  Bois: number;
  Pierres: number;
  Viande: number;
};

// Sauvegardes nommées (équivalent de user://minkebe_save.json)
export const saves = pgTable("saves", {
  id: serial("id").primaryKey(),
  slotName: text("slot_name").notNull().unique(),
  character: text("character").notNull().default("ANNIQUE"),
  health: real("health").notNull().default(100),
  hunger: real("hunger").notNull().default(100),
  thirst: real("thirst").notNull().default(100),
  stamina: real("stamina").notNull().default(100),
  positionX: real("position_x").notNull().default(0),
  positionY: real("position_y").notNull().default(1.1),
  positionZ: real("position_z").notNull().default(0),
  inventory: jsonb("inventory")
    .$type<Inventory>()
    .notNull()
    .default({ Fruits: 0, Bois: 0, Pierres: 0, Viande: 0 }),
  weapons: jsonb("weapons").$type<string[]>().notNull().default(["couteau"]),
  currentWeapon: text("current_weapon").notNull().default("couteau"),
  ammoPistol: integer("ammo_pistol").notNull().default(0),
  ammoRifle: integer("ammo_rifle").notNull().default(0),
  ammoShotgun: integer("ammo_shotgun").notNull().default(0),
  kills: integer("kills").notNull().default(0),
  hasGps: boolean("has_gps").notNull().default(false),
  hasNightVision: boolean("has_night_vision").notNull().default(false),
  nvBattery: real("nv_battery").notNull().default(1),
  gameHour: real("game_hour").notNull().default(6.5),
  outfits: jsonb("outfits").$type<string[]>().notNull().default(["explo"]),
  currentOutfit: text("current_outfit").notNull().default("explo"),
  stylePieces: jsonb("style_pieces").$type<Record<string, number>>().notNull().default({ fleurs: 0, plumes: 0, perles: 0, fil: 0 }),
  collectedWhimsy: jsonb("collected_whimsy").$type<number[]>().notNull().default([]),
  styleScore: integer("style_score").notNull().default(0),
  whimstars: integer("whimstars").notNull().default(0),
  xp: integer("xp").notNull().default(0),
  hasSpear: boolean("has_spear").notNull().default(false),
  hasShelter: boolean("has_shelter").notNull().default(false),
  shelterX: real("shelter_x"),
  shelterZ: real("shelter_z"),
  collectedIds: jsonb("collected_ids").$type<number[]>().notNull().default([]),
  worldSeed: integer("world_seed").notNull().default(1),
  timeSurvived: real("time_survived").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Journal des expéditions terminées (classement de survie)
export const expeditions = pgTable("expeditions", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  character: text("character").notNull(),
  timeSurvived: real("time_survived").notNull(),
  resourcesCollected: integer("resources_collected").notNull().default(0),
  builtShelter: boolean("built_shelter").notNull().default(false),
  craftedSpear: boolean("crafted_spear").notNull().default(false),
  kills: integer("kills").notNull().default(0),
  weaponsFound: jsonb("weapons_found").$type<string[]>().notNull().default([]),
  causeOfDeath: text("cause_of_death").notNull().default("inconnue"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Save = typeof saves.$inferSelect;
export type NewSave = typeof saves.$inferInsert;
export type Expedition = typeof expeditions.$inferSelect;

// =========================================================
// MULTIJOUEUR EN LIGNE : salons, joueurs connectés, chat
// =========================================================

export type NetPlayerState = {
  x: number;
  z: number;
  yaw: number;
  move: "idle" | "walk" | "run";
  weapon: string;
  aiming: boolean;
  dead: boolean;
  health: number;
  shelterX: number | null;
  shelterZ: number | null;
  voice?: { enabled: boolean; speaking: boolean };
};

export type NetAnimalState = {
  x: number;
  z: number;
  yaw: number;
  hp: number;
  dead: boolean;
  butchered: boolean;
};

export type NetHit = { index: number; damage: number; fromX: number; fromZ: number };

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  hostPlayerId: text("host_player_id").notNull(),
  worldSeed: integer("world_seed").notNull(),
  collectedIds: jsonb("collected_ids").$type<number[]>().notNull().default([]),
  animalState: jsonb("animal_state").$type<NetAnimalState[]>().notNull().default([]),
  pendingHits: jsonb("pending_hits").$type<NetHit[]>().notNull().default([]),
  dayTime: real("day_time").notNull().default(66),
  huntingEnabled: boolean("hunting_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roomPlayers = pgTable(
  "room_players",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    playerId: text("player_id").notNull(),
    name: text("name").notNull(),
    character: text("character").notNull().default("ANNIQUE"),
    state: jsonb("state").$type<NetPlayerState>().notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("room_players_room_player_idx").on(t.roomId, t.playerId)]
);

export const roomMessages = pgTable("room_messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  playerId: text("player_id").notNull(),
  name: text("name").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Room = typeof rooms.$inferSelect;
export type RoomPlayer = typeof roomPlayers.$inferSelect;
export type RoomMessage = typeof roomMessages.$inferSelect;

// Signalisation WebRTC pour le chat vocal (offres, réponses, candidats ICE)
export const roomSignals = pgTable("room_signals", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  fromPlayerId: text("from_player_id").notNull(),
  toPlayerId: text("to_player_id").notNull(),
  kind: text("kind").notNull(), // offer | answer | ice
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RoomSignal = typeof roomSignals.$inferSelect;

// =========================================================
// PAIEMENT : Pass Explorateur (achat unique, petit prix)
// =========================================================

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  playerName: text("player_name").notNull(),
  product: text("product").notNull().default("pass_explorateur"),
  provider: text("provider").notNull().default("stripe"), // stripe | paypal | demo | airtel | moov
  sessionId: text("session_id").notNull().unique(),
  amountCents: integer("amount_cents").notNull().default(299),
  currency: text("currency").notNull().default("eur"),
  status: text("status").notNull().default("pending"), // pending | paid | failed
  licenseKey: text("license_key").notNull().unique(),
  payerPhone: text("payer_phone"),
  txRef: text("tx_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export type Purchase = typeof purchases.$inferSelect;
