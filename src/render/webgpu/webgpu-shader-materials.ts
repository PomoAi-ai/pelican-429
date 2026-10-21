/**
 * ShaderMaterial / RawShaderMaterial 在 WebGPU 下的节点版本：WebGPURenderer 不能编译 GLSL，renderer.library.fromMaterial 对它们返回 null
 * （three 换成空白 NodeMaterial，画成黑色）。这里按材质名换成手写的等效节点（各 webgpu-shader-* 登记），GLSL 本身不变。
 * - 管线状态（transparent、blending、depthWrite/Test、side、colorWrite）由 three 取自原材质，与 WebGL 一致；节点材质只负责着色，
 *   不乘不透明度、不做 alpha=0 丢弃、不预乘（对应 GLSL 直接写 gl_FragColor），也不加雾（ShaderMaterial 不含雾片段）。
 * - uniform 共享原材质的 IUniform（webgpu-materials 的 shared），现有每帧写 uniform 的代码照常生效。
 * - 色调映射：WebGL 后期在 OutputPass 统一映射，WebGPU 在输出时统一映射，ShaderMaterial 的 toneMapped 两边都不起作用。
 * - 点精灵：WebGPU 原生点只有 1 像素，渲染 Points 时换成每点一个四边形的实例化网格（共用原几何的属性数据），
 *   转换里用 pointVertex / pointCoord 对应 gl_PointSize / gl_PointCoord。PointsMaterial（星空）同样走点精灵，
 *   沿用 three 复制的 PointsNodeMaterial，只换顶点（size × DPR，同 WebGL 的 size * pixelRatio）。
 */
import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { cameraProjectionMatrix, diffuseColor, materialPointSize, modelViewMatrix, positionGeometry, screenDPR, vec4 } from 'three/tsl';
import { POINT_CORNER, pointVertex, shaderInputs } from './webgpu-shader-nodes.ts';
import type { N } from './webgpu-shader-nodes.ts';
import type { ShaderConversion } from './webgpu-shader-nodes.ts';
import { CITY_SHADERS } from './webgpu-shader-city.ts';
import { refreshEveryRender } from './webgpu-node-utils.ts';
import { FACILITY_SHADERS } from './webgpu-shader-facility.ts';
import { FX_SHADERS } from './webgpu-shader-fx.ts';
import { TRANSIT_SHADERS } from './webgpu-shader-transit.ts';
import { WEATHER_SHADERS } from './webgpu-shader-weather.ts';

const SHADER_CONVERSIONS: Readonly<Record<string, ShaderConversion>> = {
  ...WEATHER_SHADERS,
  ...FX_SHADERS,
  ...FACILITY_SHADERS,
  ...TRANSIT_SHADERS,
  ...CITY_SHADERS,
};

/** 材质清单用：该材质是否有节点版本。 */
export function hasShaderNodes(material: THREE.Material): boolean {
  return (material as THREE.ShaderMaterial).isShaderMaterial === true && Object.hasOwn(SHADER_CONVERSIONS, material.name);
}

function shaderNodeMaterial(source: THREE.ShaderMaterial): NodeMaterial {
  const convert = SHADER_CONVERSIONS[source.name];
  if (convert === undefined) throw new Error(`webgpu-shader-materials: ShaderMaterial '${source.name || source.uuid}' 没有节点版本（按材质名登记）`);
  const { vertex, color, depth } = convert(shaderInputs(source));
  const material = new NodeMaterial();
  material.name = source.name;
  material.side = source.side;
  material.fog = false;
  if (vertex !== undefined) material.vertexNode = vertex;
  if (depth !== undefined) material.depthNode = depth;
  refreshEveryRender(source);
  material.setupDiffuseColor = () => {
    diffuseColor.assign(color);
  };
  return material;
}

function pointsNodeMaterial(source: THREE.PointsMaterial, material: NodeMaterial): NodeMaterial {
  if (source.sizeAttenuation) throw new Error(`webgpu-shader-materials: PointsMaterial '${source.name || source.uuid}' 开了 sizeAttenuation，点精灵只支持固定像素大小`);
  const clip = cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionGeometry, 1)) as unknown as N;
  material.vertexNode = pointVertex(clip, materialPointSize.mul(screenDPR) as unknown as N);
  return material;
}

interface PointSprites {
  readonly source: THREE.BufferGeometry;
  readonly mesh: THREE.Mesh;
  readonly mirrors: readonly (readonly [THREE.BufferAttribute, THREE.InstancedBufferAttribute])[];
}

const sprites = new WeakMap<THREE.Points, PointSprites>();

/**
 * 点精灵网格：四个角点 + 原几何每个属性的实例化镜像（同一数组，渲染前同步 version，不另存数据）。
 * 只支持非交错属性、drawRange 从 0 开始（游戏里的点都满足）。
 */
function pointSprites(points: THREE.Points): PointSprites {
  const cached = sprites.get(points);
  if (cached !== undefined && cached.source === points.geometry) return cached;
  const source = points.geometry;
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute(POINT_CORNER, new THREE.Float32BufferAttribute([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], 2));
  // PointsMaterial 的 map 按 uv() 取值：角点 + 0.5（y 向上）= WebGL 的 (pointCoord.x, 1 - pointCoord.y)。
  if (source.attributes.uv !== undefined) throw new Error(`webgpu-shader-materials: 点 '${points.name}' 自带 uv 属性，与点精灵四边形的 uv 冲突`);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  const mirrors: [THREE.BufferAttribute, THREE.InstancedBufferAttribute][] = [];
  for (const [name, attr] of Object.entries(source.attributes)) {
    if (!(attr as THREE.BufferAttribute).isBufferAttribute) throw new Error(`webgpu-shader-materials: 点 '${points.name}' 的属性 ${name} 是交错属性，点精灵不支持`);
    const a = attr as THREE.BufferAttribute;
    const mirror = new THREE.InstancedBufferAttribute(a.array, a.itemSize, a.normalized);
    mirror.setUsage(a.usage);
    geometry.setAttribute(name, mirror);
    mirrors.push([a, mirror]);
  }
  const mesh = new THREE.Mesh(geometry, points.material);
  mesh.name = `${points.name}-sprites`;
  mesh.onBeforeRender = (...args) => points.onBeforeRender(...args);
  const entry = { source, mesh, mirrors };
  sprites.set(points, entry);
  return entry;
}

function syncSprites(points: THREE.Points): THREE.Mesh {
  const { mesh, mirrors, source } = pointSprites(points);
  const { start, count } = source.drawRange;
  if (start !== 0) throw new Error(`webgpu-shader-materials: 点 '${points.name}' 的 drawRange 从 ${start} 开始，点精灵只支持从 0 开始`);
  const total = source.getAttribute('position').count;
  (mesh as unknown as { count: number }).count = Math.min(count, total);
  mesh.matrixWorld.copy(points.matrixWorld);
  for (const [a, mirror] of mirrors) {
    mirror.array = a.array;
    mirror.updateRanges = a.updateRanges;
    mirror.version = a.version;
  }
  return mesh;
}

/** 装上 ShaderMaterial 的节点版本（在 installNodePatches 之后调用，包装同一个 fromMaterial）。 */
export function installShaderMaterials(renderer: WebGPURenderer): void {
  const { library } = renderer;
  const copy = library.fromMaterial.bind(library);
  library.fromMaterial = (material) => {
    if ((material as THREE.ShaderMaterial).isShaderMaterial) return shaderNodeMaterial(material as THREE.ShaderMaterial);
    const node = copy(material);
    return (material as THREE.PointsMaterial).isPointsMaterial ? pointsNodeMaterial(material as THREE.PointsMaterial, node as NodeMaterial) : node;
  };
  // 包装 renderObject 而不是 setRenderObjectFunction：预编译（compileAsync）也走 renderObject，点精灵因此按四边形网格预编译。
  const render = renderer.renderObject.bind(renderer);
  const keyed = new WeakSet<THREE.Material>();
  renderer.renderObject = (...args) => {
    const [object, scene, camera, , material, ...rest] = args;
    // three 按材质属性复用节点构建结果，GLSL 相同而 uniform（贴图、强度）不同的 ShaderMaterial 会共用第一份的节点；
    // 在渲染对象建立缓存键之前按材质区分。
    if ((material as THREE.ShaderMaterial).isShaderMaterial && !keyed.has(material)) {
      keyed.add(material);
      const key = material.customProgramCacheKey.bind(material);
      material.customProgramCacheKey = () => `${key()}|${material.uuid}`;
    }
    if (!((object as THREE.Points).isPoints && ((material as THREE.ShaderMaterial).isShaderMaterial || (material as THREE.PointsMaterial).isPointsMaterial))) return render(...args);
    const mesh = syncSprites(object as THREE.Points);
    render(mesh, scene, camera, mesh.geometry, material, ...rest);
  };
}
