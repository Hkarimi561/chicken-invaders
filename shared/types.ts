// Core data shapes shared by the simulation, renderer, server and UI.
// Entities keep an open index signature because the sim attaches behaviour-specific fields (boss phases, beams,
// shields...) that only some kinds use; the fields every entity has are typed explicitly.

export interface Input {
  left: number; right: number; up: number; down: number; fire: number; ab: number;
  tx: number | null; ty: number | null;
}

export interface Player {
  id: string; name: string; color: string; role: string; skin: string; trail: string;
  mods: Record<string, number>; base: string; weapon: string;
  x: number; y: number; lives: number; score: number; power: number; keys: number;
  cd: number; heat: number; oh: boolean; ice: number; inv: number; alive: boolean; rv: number;
  shots: number; hits: number; kills: number; charge: number; abHeld: number;
  st: { bosses: number; flawless: number; novas: number; mends: number; revives: number };
  input: Input;
  ping?: number; away?: boolean;
  [k: string]: any;
}

export interface Chicken { id: number; x: number; y: number; hp: number; max?: number; tier?: number; boss?: boolean; r: number; [k: string]: any }
export interface Bullet { x: number; y: number; vx: number; vy: number; o: string; w: string; d: number; [k: string]: any }
export interface Egg { x: number; y: number; vx?: number; vy: number; [k: string]: any }
export interface Gift { id: number; x: number; y: number; k: string; w?: string; dead?: boolean }

export interface State {
  seed: number; t: number; tick: number; wave: number; eff: number; nid: number; over: boolean; delay: number;
  banner: string; bt: number; pattern: string; gx: number; gy: number; gdir: number; hw: number; flaw: boolean; cleared: boolean;
  mut: string[]; rush: boolean; daily: boolean; ev: string | null; smul: number; kmul: number;
  players: Record<string, Player>; chickens: Chicken[]; bullets: Bullet[]; eggs: Egg[]; gifts: Gift[];
  fxArcs: any[]; fxPulse: any[];
  zones: any[]; // boss hazards: bombs, lava, clock bubbles, disco lanes, frost
  meteors: any[]; meteorWave: boolean; mt: number; // meteor-strike waves: warned rocks fall instead of eggs
  [k: string]: any;
}

export interface Loadout { color?: string; skin?: string; trail?: string; gun?: string; mods?: Record<string, number>; role?: string }
