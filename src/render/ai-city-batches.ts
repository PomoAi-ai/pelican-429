import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** 城市重复构件按几何与材质合批；曲线桥保留独立网格，交通使用同一份几何。 */
export function createAiCityBatches() {
  const root = new THREE.Group();
  const geometry = {
    box: new RoundedBoxGeometry(1, 1, 1, 2, .07),
    panel: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 20),
    taper: new THREE.CylinderGeometry(.72, 1, 1, 8),
    sphere: new THREE.SphereGeometry(1, 16, 10),
    dome: new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    rock: new THREE.IcosahedronGeometry(1, 1),
    ring: new THREE.TorusGeometry(1, .025, 6, 64),
  };
  const colors = {
    ivory: 0xd8d5c9, stone: 0xbcbbae, paving: 0xbcb6a8, blue: 0x36526b,
    glass: 0x356e9b, gold: 0xae925e, far: 0x91aac2, farGlass: 0x587f9f,
    city: 0xb8c1c4, cityGlass: 0x1d507b, mountain: 0x516e8d, ridge: 0x708eae,
    middle: 0x9cafa9, soil: 0x6f7257, green: 0x65734f, rock: 0x89958e,
    waterBed: 0x38596f, light: 0xb9dfff, window: 0x638394,
  };
  const material = Object.fromEntries(Object.entries(colors).map(([name, color]) => [name,
    new THREE.MeshStandardMaterial({ color, roughness: name === 'glass' ? .3 : .75,
      metalness: name === 'gold' || name === 'blue' ? .24 : .04,
      emissive: name === 'light' ? 0x679ec8 : name === 'window' ? 0xffc783 : 0,
      emissiveIntensity: name === 'light' ? .5 : 0 }),
  ])) as Record<keyof typeof colors, THREE.MeshStandardMaterial>;
  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[] }>();
  const owned: THREE.BufferGeometry[] = Object.values(geometry);
  const instances: THREE.InstancedMesh[] = [];
  const transform = new THREE.Object3D();
  const put = (shape: keyof typeof geometry, color: keyof typeof material,
    x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0): void => {
    const key = `${shape}-${color}`;
    let batch = batches.get(key);
    if (!batch) { batch = { geometry: geometry[shape], material: material[color], matrices: [] }; batches.set(key, batch); }
    transform.position.set(x, y, z); transform.scale.set(w, h, d); transform.rotation.set(rx, ry, rz); transform.updateMatrix();
    batch.matrices.push(transform.matrix.clone());
  };
  return { root, geometry, material, put,
    setNightFactor(night: number): void {
      material.light.emissiveIntensity = .5 + night * 1.5;
      material.window.emissiveIntensity = night * 1.65;
    },
    landform(points: readonly (readonly [number, number])[], z: number, depth: number, color: keyof typeof material): void {
      const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
      const meshGeometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
      meshGeometry.translate(0, 0, z - depth / 2);
      owned.push(meshGeometry);
      const mesh = new THREE.Mesh(meshGeometry, material[color]);
      mesh.receiveShadow = true; root.add(mesh);
    },
    curve(points: readonly THREE.Vector3[], radius: number, color: keyof typeof material): THREE.CatmullRomCurve3 {
      const path = new THREE.CatmullRomCurve3([...points]);
      const meshGeometry = new THREE.TubeGeometry(path, 60, radius, 8, false);
      owned.push(meshGeometry);
      const mesh = new THREE.Mesh(meshGeometry, material[color]);
      mesh.receiveShadow = true; root.add(mesh);
      return path;
    },
    flush(): void {
      for (const [name, batch] of batches) {
        const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
        mesh.name = `ai-city-${name}`;
        batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        root.add(mesh); instances.push(mesh);
      }
      batches.clear();
    },
    dispose(): void {
      root.removeFromParent();
      for (const mesh of instances) mesh.dispose();
      for (const item of owned) item.dispose();
      for (const item of Object.values(material)) item.dispose();
      root.clear();
    },
  };
}

export type AiCityBatches = ReturnType<typeof createAiCityBatches>;
