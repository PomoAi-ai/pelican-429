import * as THREE from 'three';
import type { FacilitySceneId } from '../config/facility-scenes.ts';
import { TUNING } from '../config/tuning.ts';
import type { Tuning } from '../config/tuning.ts';
import { createFacilityView } from '../render/facility-view.ts';
import { createFortressView } from '../render/facility-fortress.ts';
import { createCathedralView } from '../render/facility-cathedral.ts';
import { createAbyssView } from '../render/facility-abyss.ts';
import type { Stage } from '../render/stage.ts';

const FACTORIES = { original: createFacilityView, cathedral: createCathedralView, abyss: createAbyssView };

async function loadFortressView() {
  const loader = new THREE.TextureLoader();
  const textures: THREE.Texture[] = [];
  try {
    for (const name of ['city-depth-v3/sky', 'city-depth-v3/far-city', 'city-depth-v3/middle-district', 'city-depth-v3/near-rooftops', 'fortress-black-hole-tear']) {
      textures.push(await loader.loadAsync(`./environments/${name}.png`));
    }
    return createFortressView({
      sky: textures[0]!, farCity: textures[1]!, middleDistrict: textures[2]!, nearRooftops: textures[3]!,
    }, textures[4]!);
  } catch (error) {
    for (const texture of textures) texture.dispose();
    throw error;
  }
}

/** Configure the scene before precipitation captures its baseline lighting. */
export async function createFacilityPresentation(stage: Stage, sceneId: FacilitySceneId) {
  const view = sceneId === 'fortress'
    ? await loadFortressView()
    : FACTORIES[sceneId]();
  if (sceneId === 'fortress') {
    stage.scene.background = new THREE.Color('#0a182c');
    // Rain dims these baselines again; broad fill keeps the route and indoor equipment readable.
    stage.hemiLight.intensity = 1.65;
    stage.hemiLight.color.set('#c8e6ff');
    stage.hemiLight.groundColor.set('#879aaa');
    stage.keyLight.intensity = 2.9;
    stage.keyLight.color.set('#edf6ff');
    stage.keyLight.shadow.intensity = 0.4;
    stage.rimLight.intensity = 1.35;
    stage.rimLight.color.set('#89dce7');
    stage.scene.environmentIntensity = 0.66;
    stage.postFx.grade.uTint.value.set('#ffffff');
    stage.postFx.grade.uSaturation.value = 1.04;
  } else if (sceneId === 'cathedral' || sceneId === 'abyss') {
    stage.scene.background = new THREE.Color(sceneId === 'cathedral' ? '#071522' : '#05131c');
    stage.hemiLight.intensity = 0.65;
    stage.hemiLight.color.set('#b7d6e6');
    stage.hemiLight.groundColor.set('#526f7b');
    stage.keyLight.intensity = 1.05;
    stage.keyLight.color.set('#eaf7ff');
    stage.keyLight.shadow.intensity = 0.45;
    stage.rimLight.intensity = 0.65;
    stage.rimLight.color.set('#79cce2');
    stage.scene.environmentIntensity = 0.35;
  }
  stage.scene.add(view.root);
  return {
    root: view.root,
    update(time: number) { view.update(time, stage.camera); },
    dispose() { view.dispose(); },
  };
}

/** Powered rooms retain ambient visibility below their structural roof tiles. */
export function facilityGameTuning(): Tuning {
  return {
    ...TUNING,
    camera: { ...TUNING.camera, distance: 44, framingOffsetY: 2.5, lookAhead: 3 },
    render: {
      ...TUNING.render,
      lighting: {
        ...TUNING.render.lighting,
        lightMap: { ...TUNING.render.lighting.lightMap, minLight: 0.8 },
        shadow: { ...TUNING.render.lighting.shadow, zMin: -30, zMax: 6 },
      },
    },
  };
}
