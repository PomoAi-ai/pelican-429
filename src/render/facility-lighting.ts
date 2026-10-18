import * as THREE from 'three';

export interface FacilityLamp {
  readonly position: THREE.Vector3;
  readonly color: THREE.Color;
  intensity: number;
  readonly distance: number;
}

interface LightSlot {
  readonly light: THREE.PointLight;
  source: FacilityLamp | null;
  target: FacilityLamp | null;
  gain: number;
}

/**
 * Keep the forward renderer's light count fixed while covering a large, multi-floor facility.
 * Every slot exists from the start, even when empty, so a changing lamp count never alters NUM_POINT_LIGHTS.
 * Callers may edit each `sources` array in place.
 */
export function createFacilityLighting(root: THREE.Group, groups: ReadonlyArray<{ sources: FacilityLamp[]; slots: number }>) {
  const banks = groups.map(({ sources, slots }) => ({
    sources,
    lights: Array.from({ length: slots }, (): LightSlot => {
      const light = new THREE.PointLight(0xffffff, 0, 20, 2);
      root.add(light);
      return { light, source: null, target: null, gain: 1 };
    }),
  }));
  let previousTime: number | undefined;
  return {
    update(focus: Readonly<{ x: number; y: number }>, time: number) {
      const firstUpdate = previousTime === undefined;
      const delta = previousTime === undefined ? 0 : Math.min(time - previousTime, 0.05);
      previousTime = time;
      const distance = (source: FacilityLamp): number => (source.position.x - focus.x) ** 2 + (source.position.y - focus.y) ** 2;
      for (const { sources, lights } of banks) {
        const score = (source: FacilityLamp): number => distance(source) *
          (!firstUpdate && lights.some((slot) => slot.target === source) ? 0.8 : 1);
        const selected = sources.toSorted((a, b) => score(a) - score(b)).slice(0, lights.length);
        const replacements = selected.filter((source) => !lights.some((slot) => slot.target === source));
        for (const slot of lights) {
          // An empty slot stays dark once more slots than lamps exist.
          if (slot.target === null || !selected.includes(slot.target)) slot.target = replacements.shift() ?? null;
          if (firstUpdate) slot.source = slot.target;
          // A removed lamp must not linger through a fade-out, and an empty slot has nothing to fade.
          else if (slot.source === null || !sources.includes(slot.source)) {
            slot.gain = 0;
            slot.source = slot.target;
          }
          if (slot.source !== slot.target) {
            slot.gain = Math.max(0, slot.gain - delta * 6);
            // Replace at zero intensity, rather than dragging a lit fixture through the room.
            if (slot.gain === 0) slot.source = slot.target;
          } else {
            slot.gain = Math.min(1, slot.gain + delta * 4);
          }
          const { light, source } = slot;
          if (source === null) {
            light.intensity = 0;
            continue;
          }
          light.position.copy(source.position);
          light.color.copy(source.color);
          light.intensity = source.intensity * slot.gain;
          light.distance = source.distance;
        }
      }
    },
    dispose() {
      for (const { lights } of banks) for (const { light } of lights) light.removeFromParent();
    },
  };
}
