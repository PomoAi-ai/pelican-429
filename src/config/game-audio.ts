export type GameSound = 'water' | 'fish' | 'dash' | 'gulp' | 'swallow' | 'photonCharge' | 'photonBurst'
  | 'keyboard' | 'codex' | 'bug' | 'overloadCharge' | 'overloadBurst' | 'jump' | 'land'
  | 'stepStone' | 'stepMetal' | 'stepGrate' | 'wing' | 'jet' | 'glide' | 'pedal' | 'coast'
  | 'brake' | 'mount' | 'hurt' | 'metalHit' | 'splash' | 'death' | 'respawn' | 'transform'
  | 'gate' | 'exit' | 'enemyWindup' | 'enemyStrike' | 'bomb' | 'thermite' | 'rotor';
export type FortressZone = 'outside' | 'gate' | 'racks' | 'network' | 'roof';
export type AudioChannel = 'music' | 'effects' | 'ambience';

export const FORTRESS_BEAT = 60 / 108;
export const AUDIO_VOLUMES = { music: 0.55, effects: 0.8, ambience: 0.32 } as const;
