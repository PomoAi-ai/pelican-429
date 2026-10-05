import * as THREE from 'three';

export interface FacilityLamp {
  readonly position: THREE.Vector3;
  readonly color: THREE.Color;
  intensity: number;
  readonly distance: number;
}

/** Keep the forward renderer's light count fixed while covering a large, multi-floor facility. */
export function createFacilityLighting(root: THREE.Group, fixtures: FacilityLamp[], signals: FacilityLamp[]) {
  const groups = [fixtures, signals].map((sources, index) => ({
    sources,
    lights: Array.from({ length: Math.min(sources.length, index === 0 ? 4 : 2) }, (_, sourceIndex) => {
      const light = new THREE.PointLight(0xffffff, 0, 20, 2);
      root.add(light);
      return { light, source: sources[sourceIndex]!, target: sources[sourceIndex]!, gain: 1 };
    }),
  }));
  let previousTime: number | undefined;
  return {
    update(focus: Readonly<{ x: number; y: number }>, time: number) {
      const firstUpdate = previousTime === undefined;
      const delta = previousTime === undefined ? 0 : Math.min(time - previousTime, 0.05);
      previousTime = time;
      const distance = (source: FacilityLamp): number => (source.position.x - focus.x) ** 2 + (source.position.y - focus.y) ** 2;
      for (const { sources, lights } of groups) {
        const score = (source: FacilityLamp): number => distance(source) *
          (!firstUpdate && lights.some((slot) => slot.target === source) ? 0.8 : 1);
        const selected = sources.toSorted((a, b) => score(a) - score(b)).slice(0, lights.length);
        const replacements = selected.filter((source) => !lights.some((slot) => slot.target === source));
        for (const slot of lights) {
          if (!selected.includes(slot.target)) slot.target = replacements.shift()!;
          if (firstUpdate) slot.source = slot.target;
          if (slot.source !== slot.target) {
            slot.gain = Math.max(0, slot.gain - delta * 6);
            // Replace at zero intensity, rather than dragging a lit fixture through the room.
            if (slot.gain === 0) slot.source = slot.target;
          } else {
            slot.gain = Math.min(1, slot.gain + delta * 4);
          }
          const { light, source } = slot;
          light.position.copy(source.position);
          light.color.copy(source.color);
          light.intensity = source.intensity * slot.gain;
          light.distance = source.distance;
        }
      }
    },
    dispose() {
      for (const { lights } of groups) for (const { light } of lights) light.removeFromParent();
    },
  };
}
