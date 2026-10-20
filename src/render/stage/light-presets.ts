import * as THREE from 'three';
import { UNDERGROUND_INSPECTION } from '../../config/character-stage-look.ts';
import type { Tuning } from '../../config/tuning.ts';

/**
 * 摄影棚灯组（渲染实验与头发预览共用）：暖主光投影、冷轮廓光、正前暖补光与半球环境光。
 * 主光绕角色半径 4 格、高 6 格，默认方位 −35°；阴影相机只框住角色周围 8 × 8 格。
 */
export function createStudioLights(shadowMapSize: number) {
  const key = new THREE.DirectionalLight('#fff3e5', 3);
  key.target.position.set(0, 1.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.setScalar(shadowMapSize);
  key.shadow.radius = 3;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .1, far: 16 });
  key.shadow.normalBias = .025;
  key.shadow.bias = -.00008;
  const rim = new THREE.DirectionalLight('#e6eeff', .65);
  rim.position.set(3, 4, -4);
  const fill = new THREE.DirectionalLight('#fff1e6', 1.8);
  fill.position.set(-1, 3, 6);
  const hemi = new THREE.HemisphereLight('#e7ecf5', '#b7aaa0', 1.5);
  const setAngle = (degrees: number): void => {
    const angle = THREE.MathUtils.degToRad(degrees);
    key.position.set(Math.sin(angle) * 4, 6, Math.cos(angle) * 4);
  };
  setAngle(-35);
  return {
    key,
    objects: [key, key.target, rim, fill, hemi] as readonly THREE.Object3D[],
    setAngle,
    dispose(): void { key.dispose(); rim.dispose(); fill.dispose(); hemi.dispose(); },
  };
}

/** 地下检视光的舞台背景与灯强度，取值见 config/character-stage-look 的 UNDERGROUND_INSPECTION。 */
export function undergroundInspectionLight(tuning: Tuning) {
  return {
    background: new THREE.Color(UNDERGROUND_INSPECTION.background),
    hemi: tuning.render.hemi * UNDERGROUND_INSPECTION.hemi,
    key: tuning.render.keyLight * UNDERGROUND_INSPECTION.key,
  };
}
