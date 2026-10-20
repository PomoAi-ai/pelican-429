/**
 * ShaderMaterial → 节点材质的公共部件（webgpu-shader-materials 装配，各 webgpu-shader-* 按材质名登记转换）。
 * GLSL 内置量对应：projectionMatrix = cameraProjectionMatrix、viewMatrix = cameraViewMatrix、modelMatrix = modelWorldMatrix、
 * modelViewMatrix = modelViewMatrix、position = positionGeometry、uv = uv()、cameraPosition = cameraPosition、gl_InstanceID = instanceIndex；
 * InstancedMesh 的 instanceMatrix * vec4( position, 1.0 ) 即 positionLocal（three 在 setupPosition 里先做实例变换）。
 */
import type * as THREE from 'three';
import { attribute, clamp, float, texture, varying, vec2, vec4, viewportSize } from 'three/tsl';
import { shared } from './webgpu-node-utils.ts';

// TSL 节点的静态类型很宽（ShaderNodeObject），这里统一按“任意节点”处理。
export type N = ReturnType<typeof float>;

/** 一种 ShaderMaterial 的节点版本：vertex = gl_Position（缺省为 three 的模型-视图-投影），color = gl_FragColor，depth = gl_FragDepth。 */
interface ShaderNodes {
  readonly vertex?: N;
  readonly color: N;
  /** gl_FragDepth（WebGPU 深度范围 [0,1]）。 */
  readonly depth?: N;
}

export interface ShaderInputs {
  /** GLSL uniform（共享同一 IUniform，每次渲染读取 .value）；int 等无法从值推断的类型显式给出。 */
  uniform(name: string, type?: string): N;
  /**
   * texture2D( name, uv )（level 给出时为 textureLod）。IUniform.value 换成别的纹理时跟着换：
   * 每次采样新建节点并挂更新（TextureNode 的 sample/level 会复制节点，复制件不带更新回调）。
   */
  texture(name: string, uv?: N, level?: N): N;
  readonly source: THREE.ShaderMaterial;
}

/** 按材质名登记的转换（材质名在各 render 模块里唯一）。 */
export type ShaderConversion = (inputs: ShaderInputs) => ShaderNodes;

export function shaderInputs(source: THREE.ShaderMaterial): ShaderInputs {
  const get = (name: string): THREE.IUniform => {
    const u = source.uniforms[name];
    if (u === undefined) throw new Error(`webgpu-shader-nodes: ShaderMaterial '${source.name}' 没有 uniform ${name}`);
    return u;
  };
  return {
    source,
    uniform: (name, type) => shared(get(name), type),
    texture(name, uvNode, level) {
      const u = get(name);
      const t = texture(u.value as THREE.Texture, uvNode, level);
      t.onRenderUpdate(() => {
        t.value = u.value as THREE.Texture;
      });
      return t as unknown as N;
    },
  };
}

/** 四边形角点 (±0.5, ±0.5)，见 webgpu-shader-materials 的点精灵网格。 */
export const POINT_CORNER = 'pointCorner';
const corner = attribute(POINT_CORNER, 'vec2') as unknown as N;

/** gl_PointCoord（左上角为原点，y 向下）。 */
export const pointCoord = varying(vec2(corner.x.add(0.5), float(0.5).sub(corner.y))) as unknown as N;

/** gl_PointSize 换算：clip 为点中心的 gl_Position，size 为像素边长（与 WebGL 一样按当前渲染目标的像素计）。 */
export function pointVertex(clip: N, size: N): N {
  return clip.add(vec4(corner.mul(size).mul(2).div(viewportSize).mul(clip.w), 0, 0)) as unknown as N;
}

/** 当前渲染目标的像素高度（WebGL 侧 currentViewportHeight 写入的视口高度）。 */
export const viewportHeight = viewportSize.y as unknown as N;

/** GLSL smoothstep 公式本身（edge0 > edge1 的反向写法在 WGSL/Metal 内置里未定义，这里按公式算，两种顺序都成立）。 */
export function smoothstepGlsl(edge0: N | number, edge1: N | number, x: N): N {
  const t = clamp(x.sub(edge0).div(float(edge1 as number).sub(edge0)), 0, 1);
  return t.mul(t).mul(float(3).sub(t.mul(2))) as unknown as N;
}
