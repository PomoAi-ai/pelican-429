import * as THREE from 'three';

/** The near-side shoe lamps cast a small pool onto the real guideway surface. */
export function createMaglevRailLights(train: THREE.Group) {
  const lights: THREE.PointLight[] = [];
  train.traverse(object => {
    if (object.name !== 'shoe ion face' || object.position.z < 0) return;
    const light = new THREE.PointLight('#61dfff', .008, 1.6, 2);
    light.name = 'maglev shoe rail illumination';
    light.position.set(0, -.02, .12);
    light.castShadow = false;
    object.add(light);
    lights.push(light);
  });
  return {
    update(lift: number): void {
      for (const light of lights) light.intensity = .008 + lift * .017;
    },
    dispose(): void {
      for (const light of lights) { light.removeFromParent(); light.dispose(); }
    },
  };
}
