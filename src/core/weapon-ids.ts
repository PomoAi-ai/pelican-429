/**
 * 远程武器与投射物种类的字面量集合（任务 018）。放在 core：事件（game-events）与配置（config/weapon-rules）共用，
 * core 不能依赖 config。武器 ID 表示嘴部动作，不再对应数字技能槽。
 */
export const WEAPON_IDS = ['water', 'fish', 'orb', 'swallow'] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

export const PROJECTILE_KINDS = ['orb', 'waterShot', 'fishShot', 'enemyShot', 'photonBug', 'photonWheel', 'codexShot', 'bugShot', 'droneBomb', 'droneThermite'] as const;
export type ProjectileKind = (typeof PROJECTILE_KINDS)[number];

/** 投射物结束原因：撞地形 / 命中满额 / 寿命到期 / 入水 / 被吞。 */
export type ProjectileEndReason = 'terrain' | 'hit' | 'expire' | 'water' | 'swallowed';
