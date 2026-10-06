/**
 * 洞穴背景墙：只画"原本是实心、被挖空"的洞穴格（掩码 CAVE_CELL / CAVE_ENTRANCE；入口露天段 CAVE_OPEN 在地表之上，不画），
 * 外加紧邻的实心格一圈（墙伸到方块圆角背后，不露出天空/远山）。地表以上一律不画。
 * - 几何：全局 BatchedMesh（单位方片，实例 = 格平移，multi-draw = 1 draw call），每 CAVE_WALL_BAND 列一带流式增删实例
 *   （视野带立即建、余量带每帧 ≤ 1、超出 2 带卸载）；z = CAVE_WALL_Z（方块背面 BLOCK_BACK_Z 稍后），不投影、接收阴影。
 * - 材质：MeshStandard + onBeforeCompile 洞室远景图（按洞室定位，边缘淡入隧道岩壁），
 *   有机边缘：按"墙掩码"纹理（R8，1 = 墙/实心，0 = 外部空气）在噪声扰动的坐标上线性采样，低于阈值即 discard
 *   （只在与外部空气相邻处（洞口）出现参差边缘）。光照图由 world-light 链式挂接（洞内自然变暗、发光源照亮）。
 */
import * as THREE from 'three';
import { DEFAULT_AURA } from '../config/aura-rules.ts';
import type { Rect } from '../core/math.ts';
import { CAVE_CELL, CAVE_ENTRANCE, CAVE_OPEN } from '../world/level.ts';
import type { CaveInfo } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { injectAfter } from './tile-material.ts';
import { BLOCK_BACK_Z } from './tile-geometry.ts';

export const CAVE_WALL_BAND = 64;
export const CAVE_WALL_Z = BLOCK_BACK_Z - 0.01;
export const CAVE_WALL_PROGRAM_KEY = 'cave-wall-room-image-v1';

/** 墙格：被挖空的有顶洞穴格。 */
export function isCarvedWall(mask: Uint8Array, i: number): boolean {
  const v = mask[i];
  return v === CAVE_CELL || v === CAVE_ENTRANCE;
}

/**
 * 墙掩码（行主序，0/255）与需要画墙的格（行主序下标，按带分组）：墙格 + 与墙格 8 邻接的实心格。
 * 外部空气（非墙空气格）为 0；实心格为 255（墙可以在方块背后延伸）。
 */
export function caveWallCells(map: TileQuery, caves: CaveInfo, band = CAVE_WALL_BAND): { readonly mask: Uint8Array; readonly bands: ReadonlyArray<Int32Array> } {
  const { width, height } = map;
  if (caves.mask.length !== width * height) throw new Error(`cave-wall: cave mask length ${caves.mask.length} != ${width}×${height}`);
  if (!(Number.isInteger(band) && band > 0)) throw new Error(`cave-wall: invalid band ${band}`);
  const out = new Uint8Array(width * height);
  const draw = new Uint8Array(width * height);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const i = ty * width + tx;
      if (map.collisionAt(tx, ty) === 'solid') out[i] = 255;
      if (!isCarvedWall(caves.mask, i)) continue;
      out[i] = 255;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const j = y * width + x;
          // 实心邻格（墙伸到方块圆角背后）与入口露天段邻格（掩码为 0：只在交界处按噪声留出参差的有机边缘）。
          if (j === i || isCarvedWall(caves.mask, j) || caves.mask[j] === CAVE_OPEN || map.collisionAt(x, y) === 'solid') draw[j] = 1;
        }
      }
    }
  }
  const lists: number[][] = Array.from({ length: Math.ceil(width / band) }, () => []);
  for (let i = 0; i < draw.length; i++) if (draw[i] === 1) (lists[Math.floor((i % width) / band)] as number[]).push(i);
  return { mask: out, bands: lists.map((l) => Int32Array.from(l)) };
}

const FRAGMENT_PARS = `
uniform sampler2D uWallMask;
uniform sampler2D uWallImage;
uniform sampler2D uWallRooms;
uniform vec2 uWallSize;
varying vec3 vCaveW;
float cwHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float cwNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cwHash( i ), cwHash( i + vec2( 1, 0 ) ), u.x ), mix( cwHash( i + vec2( 0, 1 ) ), cwHash( i + vec2( 1, 1 ) ), u.x ), u.y );
}`;

const FRAGMENT_COLOR = `
{
  vec2 w = vCaveW.xy;
  // 有机边缘：扰动坐标采样墙掩码（只在墙/外部空气交界处小于 1）。
  vec2 jit = vec2( cwNoise( w * 1.7 ), cwNoise( w * 1.7 + 19.3 ) ) - 0.5;
  float m = texture2D( uWallMask, ( w + jit * 0.9 ) / uWallSize ).r;
  if ( m < 0.55 + 0.25 * ( cwNoise( w * 3.1 ) - 0.5 ) ) discard;
  float n = 0.55 * cwNoise( w * 0.9 ) + 0.3 * cwNoise( w * 2.3 + 7.0 ) + 0.15 * cwNoise( w * 6.1 );
  float strata = 0.5 + 0.5 * sin( w.y * 2.1 + 1.7 * cwNoise( w * 0.35 ) * 6.2831 );
  vec3 stone = mix( vec3( 0.13, 0.12, 0.15 ), vec3( 0.24, 0.22, 0.26 ), n ) * ( 0.9 + 0.1 * strata );
  vec4 room = texture2D( uWallRooms, vec2( w.x / uWallSize.x, 0.5 ) );
  if ( room.z > 0.0 ) {
    vec2 uv = ( w - room.xy ) / room.zw + 0.5;
    // 每个洞室只展示一幅正向图片，隧道和图片边缘保留原岩壁，不拉伸或镜像。
    vec2 inset = min( uv, 1.0 - uv );
    float picture = smoothstep( 0.0, 0.15, min( inset.x, inset.y ) );
    stone = mix( stone, texture2D( uWallImage, vec2( uv.x, 1.0 - uv.y ) ).rgb * 0.65, picture );
  }
  // 靠近洞口的边缘略暗（墙向后翻折的阴影感）。
  stone *= 0.75 + 0.25 * smoothstep( 0.55, 1.0, m );
  diffuseColor.rgb = stone;
}`;

const VERTEX_WORLD = `
{
  vec4 cw = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
  cw = instanceMatrix * cw;
  #endif
  #ifdef USE_BATCHING
  cw = batchingMatrix * cw;
  #endif
  vCaveW = ( modelMatrix * cw ).xyz;
}`;

export function createCaveWallMaterial(maskTexture: THREE.DataTexture, roomTexture: THREE.DataTexture, width: number, height: number, background: THREE.Texture | null): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  material.name = 'cave-wall';
  // 地形材质：光照图暗部与方块收敛到同一地下色（render/light-texture lmTerrain）。
  material.userData.terrainDark = true;
  // 背景墙对鹈鹕微光只接收一部分（光晕以鹈鹕与近地面为主，墙上不出现明显圆形光斑）。
  material.userData.auraReceive = DEFAULT_AURA.wallReceive;
  const uniforms = { uWallRooms: { value: roomTexture }, uWallImage: { value: background }, uWallMask: { value: maskTexture }, uWallSize: { value: new THREE.Vector2(width, height) } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(injectAfter(shader.vertexShader, 'common', 'varying vec3 vCaveW;', 'cave-wall'), 'project_vertex', VERTEX_WORLD, 'cave-wall');
    shader.fragmentShader = injectAfter(injectAfter(shader.fragmentShader, 'common', FRAGMENT_PARS, 'cave-wall'), 'color_fragment', FRAGMENT_COLOR, 'cave-wall');
  };
  material.customProgramCacheKey = () => CAVE_WALL_PROGRAM_KEY;
  return material;
}

export interface CaveWallView {
  readonly root: THREE.Group;
  /** 已加载带数与实例（格）数。 */
  readonly loaded: number;
  readonly instances: number;
  readonly mesh: THREE.BatchedMesh;
  update(view: Readonly<Rect>): number;
  dispose(): void;
}

/**
 * 背景墙视图：一个全局 BatchedMesh（单位方片 1 个几何，实例 = 格；multi-draw = 1 draw call，逐实例视锥剔除），
 * 按 CAVE_WALL_BAND 列一带流式（与视野相交的带立即建，外扩 1 带每帧 ≤ 1 个，超出 2 带卸载）。
 */
export function createCaveWallView(map: TileQuery, caves: CaveInfo, background: THREE.Texture | null): CaveWallView {
  const { width, height } = map;
  const cells = caveWallCells(map, caves);
  const texture = new THREE.DataTexture(cells.mask, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  const roomLayout = new Float32Array(width * 4);
  for (let x = 0; x < width; x++) {
    let nearest = null;
    let distance = Infinity;
    for (const room of caves.rooms) {
      const dx = Math.abs(x + 0.5 - room.cx);
      if (dx < distance) { nearest = room; distance = dx; }
    }
    if (nearest) {
      // 图片内接洞室范围，保证相邻房间之间先淡回岩壁；3:2 保持岩层形状。
      const pictureWidth = Math.min(nearest.rx * 2, nearest.ry * 3);
      roomLayout.set([nearest.cx, nearest.cy, pictureWidth, pictureWidth / 1.5], x * 4);
    }
  }
  const roomTexture = new THREE.DataTexture(roomLayout, width, 1, THREE.RGBAFormat, THREE.FloatType);
  roomTexture.minFilter = roomTexture.magFilter = THREE.NearestFilter;
  roomTexture.needsUpdate = true;
  const material = createCaveWallMaterial(texture, roomTexture, width, height, background);
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0.5, 0.5, 0);
  const root = new THREE.Group();
  root.name = 'cave-wall';
  let capacity = 1024;
  const mesh = new THREE.BatchedMesh(capacity, quad.getAttribute('position').count, (quad.index as THREE.BufferAttribute).count, material);
  mesh.name = 'cave-wall-batch';
  mesh.sortObjects = false;
  mesh.perObjectFrustumCulled = true;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  // 背景墙不接收日光阴影（方块在墙上的硬阴影在地下不合理；洞内明暗只由光照图决定）。
  mesh.receiveShadow = false;
  const gid = mesh.addGeometry(quad);
  mesh.visible = false;
  root.add(mesh);
  const loaded = new Map<number, number[]>();
  const m = new THREE.Matrix4();
  let instances = 0;
  const nb = cells.bands.length;
  const build = (b: number): void => {
    const list = cells.bands[b] as Int32Array;
    if (instances + list.length > capacity) {
      while (instances + list.length > capacity) capacity *= 2;
      mesh.setInstanceCount(capacity);
    }
    const ids: number[] = [];
    for (let k = 0; k < list.length; k++) {
      const i = list[k] as number;
      const id = mesh.addInstance(gid);
      mesh.setMatrixAt(id, m.makeTranslation(i % width, Math.floor(i / width), CAVE_WALL_Z));
      ids.push(id);
    }
    instances += ids.length;
    loaded.set(b, ids);
  };
  const clear = (b: number): void => {
    const ids = loaded.get(b);
    if (!ids) return;
    for (const id of ids) mesh.deleteInstance(id);
    instances -= ids.length;
    loaded.delete(b);
  };
  return {
    root,
    mesh,
    get loaded() {
      return loaded.size;
    },
    get instances() {
      return instances;
    },
    update(view) {
      if (!(Number.isFinite(view.x) && Number.isFinite(view.w) && view.w >= 0)) throw new Error(`cave-wall: invalid view ${JSON.stringify(view)}`);
      const b0 = Math.max(0, Math.floor(view.x / CAVE_WALL_BAND));
      const b1 = Math.min(nb - 1, Math.floor((view.x + view.w) / CAVE_WALL_BAND));
      let built = 0;
      for (const b of [...loaded.keys()]) if (b < b0 - 2 || b > b1 + 2) clear(b);
      for (let b = b0; b <= b1; b++) {
        if (!loaded.has(b)) {
          build(b);
          built++;
        }
      }
      for (const b of [b0 - 1, b1 + 1]) {
        if (built > 0) break;
        if (b >= 0 && b < nb && !loaded.has(b)) {
          build(b);
          built++;
        }
      }
      mesh.visible = instances > 0;
      return built;
    },
    dispose() {
      for (const b of [...loaded.keys()]) clear(b);
      mesh.dispose();
      quad.dispose();
      material.dispose();
      texture.dispose();
      roomTexture.dispose();
      root.removeFromParent();
    },
  };
}
