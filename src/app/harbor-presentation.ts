import * as THREE from 'three';
import type { Stage, StageRenderer } from '../render/stage.ts';
import { createHarborSideScene } from '../render/harbor-side-scene.ts';
import { DEPTH_HAZE_HALF_DISTANCE } from '../render/depth-haze.ts';
import type { LevelData } from '../world/level.ts';

/** 横版玩法保持 XY；城市只在规范的背景层中沿 X 延展。 */
export async function createHarborPresentation(stage: Stage<StageRenderer>, level: LevelData) {
  const harbor = await createHarborSideScene({ minX: 0, maxX: level.map.width, homeCenter: level.map.width / 2 });
  harbor.root.position.y = level.spawn.y;
  stage.scene.add(harbor.root);
  stage.camera.far = 800;
  stage.camera.updateProjectionMatrix();
  stage.scene.background = new THREE.Color('#d5edee');
  const fog = new THREE.Fog('#d5edee', 30.3, 30.3 + DEPTH_HAZE_HALF_DISTANCE);
  stage.scene.fog = fog;
  stage.hemiLight.color.set('#d9f2ff');
  stage.hemiLight.groundColor.set('#abb4ae');
  stage.hemiLight.intensity = 1.4;
  stage.keyLight.color.set('#fff4de');
  stage.keyLight.intensity = 2.5;
  stage.keyLight.shadow.intensity = .6;
  stage.setSunDirection({ x: -180, y: 140, z: 80 });
  stage.rimLight.color.set('#a6c5ee');
  stage.rimLight.intensity = .65;
  stage.scene.environmentIntensity = .65;
  stage.postFx.grade.uTint.value.set('#ffffff');
  stage.postFx.grade.uSaturation.value = .92;
  return { root: harbor.root,
    update(time: number): void {
      fog.near = stage.camera.position.z + .3;
      fog.far = fog.near + DEPTH_HAZE_HALF_DISTANCE;
      harbor.update(time);
    },
    dispose: harbor.dispose };
}
