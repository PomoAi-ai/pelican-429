import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import { createVehicleTemplates } from '../../render/city/ai-city-traffic.ts';
import type { DepthLayerId } from '../../config/depth-layers.ts';

/**
 * 天际线逐栋绘制成透明贴图，按旧层距建模；景深方案由宿主统一推远并放大，构图不变。
 * 底边按景深 G 放大后落在水面 y≈−0.6：本地 y = 4 − 4.6 / 放大倍数（远景一 1.3、远景二 1.37、远景三 1.6）；旧层次只作对比，底边会略偏。
 */
type Piece = readonly [file: string, height: number];
interface Row { pieces: readonly Piece[]; from: number; to: number; gap: number; z: number; skip?: readonly [number, number] }
interface Layer { bottom: number; haze: number; rows: readonly Row[]; extra?: readonly (readonly [file: string, x: number, height: number])[] }
const LAYERS: Partial<Record<DepthLayerId, Layer>> = {
  'distance-near': { bottom: .5, haze: .08, rows: [
    { from: -36, to: 84, gap: -.4, z: 0, skip: [19, 29], pieces: [
      ['near-01', 8], ['base-01', 2.6], ['slim-01', 7.4], ['near-03', 6], ['base-04', 2.1], ['slim-03', 6.6], ['near-05', 7],
      ['base-02', 1.9], ['slim-05', 5.8], ['near-02', 8.4], ['base-06', 2.4], ['slim-07', 6.2], ['near-06', 6.4], ['base-03', 3.3],
      ['near-04', 5.4], ['slim-02', 7.8], ['base-05', 3], ['near-07', 4.8], ['slim-04', 6], ['near-08', 2.8], ['slim-06', 6.8],
    ] },
  ] },
  'distance-mid': { bottom: .6, haze: .26, extra: [['landmark', 24, 17.5]], rows: [
    { from: -62, to: 112, gap: -1.2, z: -.6, pieces: [['mid-strip', 6]] },
    { from: -52, to: 102, gap: .3, z: 0, skip: [21, 27], pieces: [
      ['mid-03', 6.4], ['slim-06', 5.6], ['mid-01', 8], ['base-04', 1.6], ['mid-05', 5.2], ['slim-02', 6.6], ['mid-04', 6],
      ['mid-07', 5.8], ['slim-04', 4.8], ['mid-02', 5.4], ['base-01', 1.8], ['mid-06', 6.2], ['slim-01', 6.8],
    ] },
  ] },
  'distance-far': { bottom: 1.1, haze: .42, rows: [
    { from: -96, to: 146, gap: -2, z: -.4, pieces: [['far-b', 4.4]] },
    { from: -90, to: 140, gap: -3, z: 0, pieces: [['far', 5.4]] },
  ] },
};
const FILES = [...new Set(Object.values(LAYERS).flatMap(layer => [
  ...layer.rows.flatMap(row => row.pieces.map(([file]) => file)), ...(layer.extra ?? []).map(([file]) => file)]))];
const WATER_Y = -.6;

const VERTEX = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// 远景贴图自带画风，只按层混入晚霞空气色；夜晚整体压暗，暖色窗灯保留亮度。倒影沿底边淡出并轻微水波错位。
const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uHaze; uniform float uAmount, uNight, uReflect, uTime;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    if (uReflect > 0.0) uv.x += sin(uv.y * 90.0 + uTime * 1.6) * 0.004 * (0.3 + uv.y);
    vec4 art = texture2D(uMap, uv);
    if (art.a < 0.02) discard;
    vec3 c = mix(art.rgb, uHaze, uAmount);
    float warm = smoothstep(0.06, 0.3, art.r - art.b) * smoothstep(0.35, 0.7, art.r);
    c = mix(c, c * vec3(0.2, 0.24, 0.42) + art.rgb * warm * 1.3, uNight);
    float alpha = art.a;
    if (uReflect > 0.0) { c = mix(c, uHaze * vec3(0.55, 0.6, 0.95), 0.15); alpha *= uReflect * pow(1.0 - vUv.y, 1.2); }
    gl_FragColor = vec4(c, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createDepthSkyline(layers: ReadonlyMap<DepthLayerId, THREE.Group>) {
  const base = `${import.meta.env.BASE_URL}scenes/ai-skyline-depth-v1/`;
  const loader = new THREE.TextureLoader();
  const load = (file: string): Promise<THREE.Texture> => loader.loadAsync(base + file).then(map => {
    map.colorSpace = THREE.SRGBColorSpace; return map;
  }, () => { throw new Error(`天际线贴图加载失败：${base}${file}`); });
  // 白天用绘制的晚霞天空做底色，替换共享的卡通云与日轮；夜晚仍回到共享星空。
  const sky = loader.load(base + 'sky.jpg', undefined, undefined, () => { throw new Error(`天际线天空加载失败：${base}sky.jpg`); });
  sky.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
  const night = { value: 0 }, time = { value: 0 }, haze = { value: new THREE.Color('#c7a6cc') };
  const materials: THREE.ShaderMaterial[] = [];
  const meshes: THREE.Mesh[] = [];
  const material = (map: THREE.Texture, amount: number, reflect: number): THREE.ShaderMaterial => {
    const shader = new THREE.ShaderMaterial({ uniforms: { uMap: { value: map }, uHaze: haze, uAmount: { value: amount },
      uNight: night, uReflect: { value: reflect }, uTime: time }, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthWrite: false });
    materials.push(shader); return shader;
  };
  let disposed = false;
  const textures = Promise.all(FILES.map(file => load(`${file}.png`)));
  void textures.then(maps => {
    if (disposed) return;
    const byFile = new Map(FILES.map((file, index) => [file, maps[index]!]));
    const looks = new Map<string, readonly [THREE.ShaderMaterial, THREE.ShaderMaterial]>();
    const rng = mulberry32(0x5c71e);
    for (const [layer, plan] of Object.entries(LAYERS) as [DepthLayerId, Layer][]) {
      const group = layers.get(layer)!;
      const place = (file: string, x: number, height: number, z: number, flip: boolean): number => {
        const map = byFile.get(file)!, image = map.image as HTMLImageElement;
        const width = height * image.width / image.height;
        const key = `${layer}:${file}`;
        let look = looks.get(key);
        if (!look) { look = [material(map, plan.haze, 0), material(map, plan.haze, .62)]; looks.set(key, look); }
        for (const [index, shader] of look.entries()) {
          const mesh = new THREE.Mesh(geometry, shader);
          mesh.name = `depth-skyline-${file}${index ? '-reflection' : ''}`;
          // 倒影以本层底边为镜面，在放大后正好落在水面下。
          mesh.position.set(x + width / 2, plan.bottom, z - meshes.length * .002);
          mesh.scale.set(flip ? -width : width, index ? -height * .8 : height, 1);
          group.add(mesh); meshes.push(mesh);
        }
        return width;
      };
      for (const row of plan.rows) {
        let x = row.from, i = 0;
        while (x < row.to) {
          const [file, height] = row.pieces[i % row.pieces.length]!; i++;
          if (row.skip && x > row.skip[0] && x < row.skip[1]) { x = row.skip[1]; continue; }
          x += place(file, x, height * (.92 + rng() * .16), row.z, rng() < .4) + row.gap;
        }
      }
      for (const [file, x, height] of plan.extra ?? []) {
        const image = byFile.get(file)!.image as HTMLImageElement;
        place(file, x - height * image.width / image.height / 2, height, .6, false);
      }
    }
  });

  // 开阔水面从步道外一直铺到天际线脚下，近处深蓝、远处映出晚霞；不写深度，楼群倒影叠在水面上。属于背景格子二，随该层开关。
  const waterGeometry = new THREE.PlaneGeometry(320, 200).rotateX(-Math.PI / 2).translate(24, WATER_Y, -50);
  const near = new THREE.Color('#3b4aa6'), far = new THREE.Color('#d7a3bd'), tint = new THREE.Color();
  const position = waterGeometry.getAttribute('position');
  waterGeometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: position.count }, (_, i) =>
    tint.copy(near).lerp(far, THREE.MathUtils.clamp(-(position.getZ(i) - 28) / 178, 0, 1) ** .45).toArray()).flat(), 3));
  const waterMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false });
  waterMaterial.name = 'depth-skyline-water';
  const water = new THREE.Mesh(waterGeometry, waterMaterial); water.name = 'depth-skyline-water'; water.renderOrder = -1;
  layers.get('background-far')!.add(water);

  // 列车与飞行器复用 AI 住宅的共享载具模板；列车跑在背景格子二的高架桥上，飞行器穿行于远景一、二的楼群之间。
  const hull = new THREE.MeshStandardMaterial({ color: 0xeeeae0, metalness: .2, roughness: .38 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x174d73, emissive: 0x238cbd, emissiveIntensity: .23, metalness: .25, roughness: .23 });
  const light = new THREE.MeshBasicMaterial({ color: 0x92edff, toneMapped: false });
  const templates = createVehicleTemplates({ hull, glass, light });
  const trains = [1, -1].map(direction => {
    const train = templates.train.clone(); train.name = 'depth-skyline-maglev';
    if (direction < 0) train.rotation.y = Math.PI;
    layers.get('background-far')!.add(train);
    return { train, direction };
  });
  const flyers = ([['distance-near', 0], ['distance-near', 1], ['distance-near', 2], ['distance-mid', 0], ['distance-mid', 1], ['distance-mid', 2]] as const)
    .map(([layer, kind], index) => {
      const flyer = templates.flyers[kind]!.clone(); flyer.name = 'depth-skyline-flyer';
      flyer.scale.setScalar(layer === 'distance-near' ? .55 : .4);
      layers.get(layer)!.add(flyer);
      return { flyer, kind, index, mid: layer === 'distance-mid', direction: index % 2 ? -1 : 1 };
    });
  const LOOP = { min: -40, span: 128 };
  return { sky,
    update(seconds: number): void {
      time.value = seconds;
      for (const [index, { train, direction }] of trains.entries()) {
        train.position.set(LOOP.min + THREE.MathUtils.euclideanModulo(index * LOOP.span / 2 + seconds * 3 * direction, LOOP.span), 2.05, direction * .4);
      }
      for (const { flyer, kind, index, mid, direction } of flyers) {
        flyer.position.set(LOOP.min + THREE.MathUtils.euclideanModulo(index * 23 + seconds * (1.1 + kind * .35) * direction, LOOP.span),
          (mid ? 9 : 5.5) + kind * 1.3 + Math.sin(seconds * .7 + index) * .2, mid ? .3 : 1.5 - kind);
        flyer.rotation.set(0, direction < 0 ? Math.PI : 0, Math.sin(seconds * .5 + index) * .03);
      }
    },
    setDark(dark: boolean): void {
      night.value = dark ? 1 : 0;
      waterMaterial.color.set(dark ? 0x3a4a7a : 0xffffff);
      glass.emissiveIntensity = dark ? 1.08 : .23;
    },
    dispose(): void {
      disposed = true;
      for (const mesh of meshes) mesh.removeFromParent();
      for (const { train } of trains) train.removeFromParent();
      for (const { flyer } of flyers) flyer.removeFromParent();
      templates.dispose(); hull.dispose(); glass.dispose(); light.dispose();
      for (const shader of materials) shader.dispose();
      void textures.then(maps => { for (const map of maps) map.dispose(); });
      sky.dispose(); geometry.dispose(); waterGeometry.dispose(); waterMaterial.dispose(); water.removeFromParent();
    },
  };
}
