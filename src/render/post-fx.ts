/**
 * 后期管线（EffectComposer）：Render(HDR + 深度纹理) → [GTAO 降分辨率，只算 AO 图] → [Bloom 降分辨率，只产出 bloom 图]
 * （AO/bloom 分辨率 = CSS 像素 × resolutionScale，与像素比无关；019 修复轮）
 * → Grade（bloom 相加 → 色调映射 → sRGB → 乘 AO、白平衡/对比/饱和/暗角，一次全屏）→ [SMAA → 画布]。
 * - 抗锯齿（lighting.antialias）：smaa（默认）= 场景不多重采样，Grade 写 8 位显示空间缓冲，SMAA（边缘/权重/混合）输出画布；
 *   msaa = 场景渲染进 lighting.msaa 倍多重采样目标（每帧只 resolve 一次），Grade 直写画布。
 *   默认 smaa 的原因（任务 019 实测）：Chrome/macOS 的 ANGLE-Metal 对 WebGL MSAA 缓冲按样本执行片元着色，4× MSAA = 4 倍着色量。
 * - AO 用 three 的 GTAOPass，但不再渲染法线 G-Buffer：由主渲染目标的深度纹理重建法线（不重复绘制场景），
 *   先降采样成 AO 分辨率的 法线 + 深度 缓冲（019 修复轮，见 DepthGTAOPass）；
 *   不做 GTAO 自带的全分辨率复制 + 混合两遍，AO 图在 Grade 里一次乘上（省两次全屏绘制）。
 * - 性能（任务 019）：MSAA 只用于场景渲染。bloom 不再加色混合回 MSAA 主目标（那会让 4× HalfFloat 多重采样缓冲再载入 + resolve 一次），
 *   OutputPass 与调色合并为一个直写画布的 pass（不再写第二个 MSAA 目标）；数学与原链路一致：
 *   原 bloom 以 AdditiveBlending(SRC_ALPHA, ONE) 叠到 HDR 上 → 这里 c += bloom.rgb·bloom.a，再色调映射。
 * - 画质：planPasses(quality) 决定启用的 pass；low 只保留 Render → Grade（阴影由 stage 负责，始终开启）。
 * - 构造不触碰 GL（可在 node 下测试结构与 dispose）；setQuality 只切 pass.enabled，不重建资源。
 * - setAntialias（设置面板，运行时切换）：改场景目标采样数并释放其 GPU 缓冲（下次渲染按新采样数重建，对象与深度纹理引用不变），
 *   增删末尾的 SMAA 通道、改 Grade 是否交换；读写缓冲复位为 场景目标 / 显示缓冲。
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ANTIALIAS_MODES } from '../config/lighting-rules.ts';
import type { AntialiasMode, LightingQuality, LightingTuning } from '../config/lighting-rules.ts';

export interface PassPlan {
  readonly ao: boolean;
  readonly bloom: boolean;
  readonly shafts: boolean;
  /** 色彩分级与阴影在任何画质下都开启。 */
  readonly grade: true;
  readonly shadows: true;
}

/** 画质 → 启用的效果。low：关 AO/光束/bloom，仅保留阴影与调色。 */
export function planPasses(quality: LightingQuality): PassPlan {
  if (quality === 'high') return { ao: true, bloom: true, shafts: true, grade: true, shadows: true };
  if (quality === 'low') return { ao: false, bloom: false, shafts: false, grade: true, shadows: true };
  throw new Error(`post-fx: unknown quality '${String(quality)}'`);
}

/** Grade pass 的 uniform（色调映射所需 toneMappingExposure 由 OutputPass 每帧写入）。 */
export interface GradeUniforms {
  readonly tDiffuse: THREE.IUniform<THREE.Texture | null>;
  readonly toneMappingExposure: THREE.IUniform<number>;
  /** bloom 图（ScaledBloomPass.bloomTexture）；uBloom = 0 不相加（画质 low 或 bloom 关闭）。 */
  readonly tBloom: THREE.IUniform<THREE.Texture | null>;
  readonly uBloom: THREE.IUniform<number>;
  readonly tAO: THREE.IUniform<THREE.Texture | null>;
  /** 0 = 不乘 AO（画质 low 或 AO 关闭）。 */
  readonly uAoIntensity: THREE.IUniform<number>;
  readonly uTint: THREE.IUniform<THREE.Color>;
  readonly uContrast: THREE.IUniform<number>;
  readonly uSaturation: THREE.IUniform<number>;
  readonly uVignette: THREE.IUniform<number>;
  readonly uVignetteStart: THREE.IUniform<number>;
  readonly uAspect: THREE.IUniform<number>;
  /** xy = 屏幕 UV 中心，z = 以屏幕高度为单位的影响半径；0 关闭。 */
  readonly uGravityLens: THREE.IUniform<THREE.Vector3>;
  readonly uHalfTexel: THREE.IUniform<THREE.Vector2>;
}

/**
 * 输出 + 色彩分级（一次全屏）：HDR 场景 + bloom → 色调映射 → sRGB（OutputShader 同式，defines 由 OutputPass 维护）
 * → 显示空间：乘 AO → 白平衡 tint → 饱和度 → 对比度 → 暗角。
 */
export const GRADE_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform sampler2D tBloom;
  uniform float uBloom;
  uniform sampler2D tAO;
  uniform float uAoIntensity;
  uniform vec3 uTint;
  uniform float uContrast;
  uniform float uSaturation;
  uniform float uVignette;
  uniform float uVignetteStart;
  uniform float uAspect;
  uniform vec3 uGravityLens;
  uniform vec2 uHalfTexel;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  varying vec2 vUv;
  void main() {
    vec2 sceneUv = vUv;
    if ( uGravityLens.z > 0.0 ) {
      vec2 aspect = vec2( uAspect, 1.0 );
      vec2 offset = ( vUv - uGravityLens.xy ) * aspect;
      float radius = clamp( length( offset ) / uGravityLens.z, 0.0, 1.0 );
      // Wendland 在中心最强，外缘的权重及前两阶导数归零，角色进入黑芯后仍连续变形。
      float falloff = 1.0 - radius;
      float lens = falloff * falloff * falloff * falloff * ( 1.0 + 4.0 * radius );
      // 旋转集中到黑芯，避免把视界外的吸积盘本身拧成旋涡。
      float angle = lens * lens * 2.4;
      float cs = cos( angle );
      float sn = sin( angle );
      vec2 bent = mat2( cs, sn, -sn, cs ) * offset * ( 1.0 - lens * 0.5 );
      float stretch = lens * lens * 0.25;
      bent *= vec2( 1.0 - stretch, 1.0 + stretch );
      vec2 edge = min( vUv, 1.0 - vUv ) * aspect;
      float edgeFade = smoothstep( 0.0, 0.08, min( edge.x, edge.y ) );
      sceneUv = clamp( vUv + ( bent - offset ) / aspect * edgeFade, uHalfTexel, 1.0 - uHalfTexel );
    }
    vec4 src = texture2D( tDiffuse, sceneUv );
    if ( uBloom > 0.0 ) {
      vec4 b = texture2D( tBloom, sceneUv );
      src.rgb += b.rgb * b.a;
    }
    #ifdef LINEAR_TONE_MAPPING
      src.rgb = LinearToneMapping( src.rgb );
    #elif defined( REINHARD_TONE_MAPPING )
      src.rgb = ReinhardToneMapping( src.rgb );
    #elif defined( CINEON_TONE_MAPPING )
      src.rgb = CineonToneMapping( src.rgb );
    #elif defined( ACES_FILMIC_TONE_MAPPING )
      src.rgb = ACESFilmicToneMapping( src.rgb );
    #elif defined( AGX_TONE_MAPPING )
      src.rgb = AgXToneMapping( src.rgb );
    #elif defined( NEUTRAL_TONE_MAPPING )
      src.rgb = NeutralToneMapping( src.rgb );
    #elif defined( CUSTOM_TONE_MAPPING )
      src.rgb = CustomToneMapping( src.rgb );
    #endif
    #ifdef SRGB_TRANSFER
      src = sRGBTransferOETF( src );
    #endif
    vec3 c = src.rgb;
    // Negative HDR alpha marks thin plumage; positive opacity/additive effects retain full AO.
    float aoWeight = clamp( 1.0 + min( src.a, 0.0 ), 0.0, 1.0 );
    if ( uAoIntensity > 0.0 ) c *= mix( 1.0, texture2D( tAO, sceneUv ).r, uAoIntensity * aoWeight );
    c *= uTint;
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
    c = mix( vec3( l ), c, uSaturation );
    c = ( c - 0.5 ) * uContrast + 0.5;
    vec2 p = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
    float r = length( p ) / length( vec2( uAspect, 1.0 ) * 0.5 );
    float v = smoothstep( uVignetteStart, 1.0, r );
    c *= 1.0 - uVignette * v * v;
    gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), src.a < 0.0 ? 1.0 : src.a );
  }`;

/** OutputPass（色调映射/色彩空间 defines 与曝光由父类按 renderer 维护）+ bloom 相加 + 调色。 */
class GradeOutputPass extends OutputPass {
  readonly gradeUniforms: GradeUniforms;

  constructor() {
    super();
    const u = this.uniforms as Record<string, THREE.IUniform>;
    const extra = {
      tBloom: { value: null },
      uBloom: { value: 0 },
      tAO: { value: null },
      uAoIntensity: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uContrast: { value: 1 },
      uSaturation: { value: 1 },
      uVignette: { value: 0 },
      uVignetteStart: { value: 0.5 },
      uAspect: { value: 1 },
      uGravityLens: { value: new THREE.Vector3() },
      uHalfTexel: { value: new THREE.Vector2(0.5, 0.5) },
    };
    Object.assign(u, extra);
    if (this.material.uniforms !== u) throw new Error('post-fx: OutputPass material no longer shares its uniforms object (three API changed?)');
    this.material.name = 'PelicanGradeOutput';
    this.material.fragmentShader = GRADE_FRAGMENT;
    this.gradeUniforms = u as unknown as GradeUniforms;
  }
}

/** GTAOPass 的内部法线 G-Buffer（类型声明未导出该字段）。 */
function normalTarget(pass: GTAOPass): THREE.WebGLRenderTarget {
  const rt = (pass as unknown as { normalRenderTarget?: THREE.WebGLRenderTarget }).normalRenderTarget;
  if (!rt) throw new Error('post-fx: GTAOPass internal normalRenderTarget is missing (three API changed?)');
  return rt;
}

/**
 * AO 预处理（019 修复轮）：在 AO 分辨率把 法线（由全分辨率深度重建，与 GTAOShader.computeNormalFromDepth 同式）+ 深度
 * 写进一张 Float32 缓冲：rgb = 法线 × .5 + .5（GTAO 的 NORMAL_VECTOR_TYPE 1 解包），a = 原始深度值（天空 1）。
 */
export const AO_PREPASS_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform highp sampler2D tDepth;
  uniform mat4 cameraProjectionMatrixInverse;
  varying vec2 vUv;
  vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {
    vec4 clipSpacePosition = vec4(vec3(screenPosition, depth) * 2.0 - 1.0, 1.0);
    vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
    return viewSpacePosition.xyz / viewSpacePosition.w;
  }
  float fetchDepth(const ivec2 uv) { return texelFetch(tDepth, uv, 0).x; }
  void main() {
    vec2 size = vec2(textureSize(tDepth, 0));
    ivec2 p = ivec2(vUv * size);
    float depth = fetchDepth(p);
    if (depth >= 1.0) {
      gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0);
      return;
    }
    float l2 = fetchDepth(p - ivec2(2, 0));
    float l1 = fetchDepth(p - ivec2(1, 0));
    float r1 = fetchDepth(p + ivec2(1, 0));
    float r2 = fetchDepth(p + ivec2(2, 0));
    float b2 = fetchDepth(p - ivec2(0, 2));
    float b1 = fetchDepth(p - ivec2(0, 1));
    float t1 = fetchDepth(p + ivec2(0, 1));
    float t2 = fetchDepth(p + ivec2(0, 2));
    float dl = abs((2.0 * l1 - l2) - depth);
    float dr = abs((2.0 * r1 - r2) - depth);
    float db = abs((2.0 * b1 - b2) - depth);
    float dt = abs((2.0 * t1 - t2) - depth);
    vec3 ce = getViewPosition(vUv, depth);
    vec3 dpdx = (dl < dr) ? ce - getViewPosition(vUv - vec2(1.0 / size.x, 0.0), l1) : -ce + getViewPosition(vUv + vec2(1.0 / size.x, 0.0), r1);
    vec3 dpdy = (db < dt) ? ce - getViewPosition(vUv - vec2(0.0, 1.0 / size.y), b1) : -ce + getViewPosition(vUv + vec2(0.0, 1.0 / size.y), t1);
    vec3 n = normalize(cross(dpdx, dpdy));
    gl_FragColor = vec4( n * 0.5 + 0.5, depth );
  }`;

const AO_PREPASS_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

/**
 * GTAO：AO 缓冲按 resolutionScale 缩小；只输出 AO 图（gtaoMap），不写画面（output = Off，needsSwap = false），由 Grade 合成。
 * 019 修复轮：先跑预处理（AO_PREPASS_FRAGMENT）把 法线 + 深度 降采样到 AO 分辨率，GTAO 与泊松降噪都读这张小缓冲
 * （setGBuffer(预处理, 预处理) → 法线解包 + 深度取 a 通道；降噪着色器的深度来源宏是 DEPTH_VALUE_SOURCE，单独置 1）。
 * 改前：GTAO 每像素读全分辨率深度 22 次、降噪 54 次（每个采样都由深度重建法线），在 2× 像素比 1080p 上占高画质额外开销的大头。
 * 父类构造时创建的法线 G-Buffer 不再使用（缩到 1×1）。
 */
class DepthGTAOPass extends GTAOPass {
  private readonly resolutionScale: number;
  /** 画布像素比（createPostFx.setSize 写入）：AO 分辨率按 CSS 像素 × resolutionScale（像素比 < 1 时按物理像素）。 */
  pixelRatio = 1;
  readonly prepassTarget: THREE.WebGLRenderTarget;
  private readonly prepassMaterial: THREE.ShaderMaterial;
  private readonly prepassQuad: FullScreenQuad;

  constructor(scene: THREE.Scene, camera: THREE.Camera, resolutionScale: number) {
    super(scene, camera, 1, 1);
    this.resolutionScale = resolutionScale;
    this.prepassTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
    this.prepassTarget.texture.name = 'post-fx.ao-prepass';
    this.prepassMaterial = new THREE.ShaderMaterial({
      name: 'PelicanAoPrepass',
      uniforms: { tDepth: { value: null }, cameraProjectionMatrixInverse: { value: new THREE.Matrix4() } },
      vertexShader: AO_PREPASS_VERTEX,
      fragmentShader: AO_PREPASS_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.prepassQuad = new FullScreenQuad(this.prepassMaterial);
    // 法线 + 深度都来自预处理缓冲（首次编译前定好 defines）。
    this.setGBuffer(this.prepassTarget.texture as unknown as THREE.DepthTexture, this.prepassTarget.texture);
    this.pdMaterial.defines.DEPTH_VALUE_SOURCE = 1;
    this.output = GTAOPass.OUTPUT.Off;
    this.needsSwap = false;
  }

  override setSize(width: number, height: number): void {
    const k = this.resolutionScale / Math.max(1, this.pixelRatio);
    const w = Math.max(1, Math.round(width * k));
    const h = Math.max(1, Math.round(height * k));
    super.setSize(w, h);
    this.prepassTarget.setSize(w, h);
    normalTarget(this).setSize(1, 1);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const depth = readBuffer.depthTexture;
    if (!depth) throw new Error('post-fx: GTAO requires a depth texture on the composer read buffer');
    if (!renderer.extensions.has('EXT_color_buffer_float')) throw new Error('post-fx: AO prepass needs EXT_color_buffer_float (Float32 render target); use quality=low on this device');
    const u = this.prepassMaterial.uniforms;
    (u.tDepth as THREE.IUniform).value = depth;
    (u.cameraProjectionMatrixInverse as THREE.IUniform<THREE.Matrix4>).value.copy(this.camera.projectionMatrixInverse);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.prepassTarget);
    this.prepassQuad.render(renderer);
    renderer.setRenderTarget(prev);
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }

  override dispose(): void {
    super.dispose();
    this.prepassTarget.dispose();
    this.prepassMaterial.dispose();
    this.prepassQuad.dispose();
  }
}

/**
 * Bloom 按 resolutionScale 降分辨率（UnrealBloom 内部再从一半起做 5 级 mip），只产出 bloom 图（bloomTexture），
 * 跳过父类最后一步“加色混合回 readBuffer”（由 Grade 在色调映射前相加，避免再写 MSAA 主目标）。
 */
class ScaledBloomPass extends UnrealBloomPass {
  private readonly resolutionScale: number;
  /** 画布像素比（同 DepthGTAOPass.pixelRatio）：bloom 分辨率按 CSS 像素。 */
  pixelRatio = 1;
  private readonly quad: { material: THREE.Material; render(renderer: THREE.WebGLRenderer): void };

  constructor(resolutionScale: number, strength: number, radius: number, threshold: number) {
    super(new THREE.Vector2(1, 1), strength, radius, threshold);
    this.resolutionScale = resolutionScale;
    const quad = (this as unknown as { _fsQuad?: ScaledBloomPass['quad'] })._fsQuad;
    if (!quad || typeof quad.render !== 'function') throw new Error('post-fx: UnrealBloomPass internal _fsQuad is missing (three API changed?)');
    this.quad = quad;
  }

  /** 合成后的 bloom 图（父类 composite 写入 renderTargetsHorizontal[0]）。 */
  get bloomTexture(): THREE.Texture {
    const rt = this.renderTargetsHorizontal[0];
    if (!rt) throw new Error('post-fx: UnrealBloomPass has no mip render targets');
    return rt.texture;
  }

  override setSize(width: number, height: number): void {
    const k = this.resolutionScale / Math.max(1, this.pixelRatio);
    super.setSize(Math.max(2, Math.round(width * k)), Math.max(2, Math.round(height * k)));
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const quad = this.quad;
    const draw = quad.render;
    quad.render = (r) => {
      if (quad.material !== this.blendMaterial) draw.call(quad, r);
    };
    try {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    } finally {
      quad.render = draw;
    }
  }
}

/**
 * SMAA：three 的边缘/权重中间目标默认 HalfFloat；改 8 位（SMAA 参考实现即 RGBA8，边缘 0/1、权重 8 位足够），
 * 5K 画布上这两遍的带宽减半（实测 3.6 → 1.9 ms）。构造时尚未分配显存，直接改类型即可。
 */
function createSmaaPass(): SMAAPass {
  const pass = new SMAAPass();
  const internals = pass as unknown as { _edgesRT?: THREE.WebGLRenderTarget; _weightsRT?: THREE.WebGLRenderTarget };
  for (const rt of [internals._edgesRT, internals._weightsRT]) {
    if (!rt) throw new Error('post-fx: SMAAPass internal render targets are missing (three API changed?)');
    rt.texture.type = THREE.UnsignedByteType;
  }
  return pass;
}

export interface PostFxInput {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly lighting: LightingTuning;
  readonly quality: LightingQuality;
  /** 抗锯齿方式（缺省 lighting.antialias；main 由 ?aa= 解析）。 */
  readonly antialias?: AntialiasMode;
}

export interface PostFx {
  readonly composer: EffectComposer;
  /** 当前抗锯齿方式（setAntialias 运行时切换）。 */
  readonly antialias: AntialiasMode;
  /** 场景渲染目标（HalfFloat + 深度纹理；msaa 模式多重采样，每帧唯一一次 resolve）。 */
  readonly sceneTarget: THREE.WebGLRenderTarget;
  readonly quality: LightingQuality;
  /** 调色 uniform（022 降水：天气改饱和度/色温；调用方负责记住并恢复基础值）。 */
  readonly grade: GradeUniforms;
  /** 当前启用的 pass 名（调试/测试用）。 */
  enabledPasses(): string[];
  setQuality(quality: LightingQuality): void;
  /** 运行时切换抗锯齿（同值不重建；非法即抛）。 */
  setAntialias(mode: AntialiasMode): void;
  /** CSS 像素尺寸 + 像素比。 */
  setSize(width: number, height: number, pixelRatio: number): void;
  /** 世界空间引力透镜；整幅场景一起折射，包含角色与场景遮挡。 */
  setGravityLens(lens: { readonly center: THREE.Vector3; readonly radius: number } | null): void;
  render(deltaTime?: number): void;
  /** 已完成色调映射与 sRGB 编码的最终画面，合成时直接复制像素。 */
  renderTexture(): THREE.Texture;
  dispose(): void;
}

export function createPostFx(input: PostFxInput): PostFx {
  const { renderer, scene, camera, lighting } = input;
  if (!renderer || !scene || !camera || !lighting) throw new Error('post-fx: renderer, scene, camera and lighting are required');
  let quality = input.quality;
  planPasses(quality); // 校验画质

  const checkAntialias = (mode: AntialiasMode): void => {
    if (!(ANTIALIAS_MODES as readonly string[]).includes(mode)) throw new Error(`post-fx: unknown antialias '${String(mode)}'`);
  };
  let antialias = input.antialias ?? lighting.antialias;
  checkAntialias(antialias);
  const smaaMode = antialias === 'smaa';

  // 场景目标 = composer.readBuffer；另一个缓冲（writeBuffer）只在 smaa 模式下承接 Grade 的 8 位显示空间输出（无深度、无多重采样）。
  const sceneDepth = new THREE.DepthTexture(1, 1, THREE.UnsignedInt248Type);
  sceneDepth.format = THREE.DepthStencilFormat;
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: smaaMode ? 0 : lighting.msaa,
    stencilBuffer: true,
    depthTexture: sceneDepth,
  });
  sceneTarget.texture.name = 'post-fx.scene';
  const displayTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
  displayTarget.texture.name = 'post-fx.display';
  const composer = new EffectComposer(renderer, sceneTarget);
  composer.renderTarget2.dispose(); // 构造时克隆的第二个目标（从未绑定）换成显示空间缓冲
  composer.renderTarget2.depthTexture?.dispose();
  composer.renderTarget2 = displayTarget;
  composer.readBuffer = sceneTarget;
  composer.writeBuffer = displayTarget;
  const depthTextures = [sceneTarget.depthTexture];

  const renderPass = new RenderPass(scene, camera);

  const a = lighting.ao;
  const ao = new DepthGTAOPass(scene, camera, a.resolutionScale);
  ao.updateGtaoMaterial({ radius: a.radius, distanceExponent: a.distanceExponent, thickness: a.thickness, scale: a.scale, samples: a.samples });
  ao.updatePdMaterial({ samples: a.denoiseSamples });

  const b = lighting.bloom;
  const bloom = new ScaledBloomPass(b.resolutionScale, b.strength, b.radius, b.threshold);

  const grade = new GradeOutputPass();
  // 每帧交换次数为偶数 → 场景始终渲染进同一个目标（AO 的深度纹理不随帧切换）：
  // smaa：Grade（写显示缓冲）与 SMAA（画布）各交换一次；msaa：Grade 是最后一个 pass，直写画布、不交换。
  grade.needsSwap = smaaMode;
  const g = lighting.grade;
  const gu = grade.gradeUniforms;
  gu.uTint.value.set(g.tint);
  gu.uContrast.value = g.contrast;
  gu.uSaturation.value = g.saturation;
  gu.uVignette.value = g.vignette;
  gu.uVignetteStart.value = g.vignetteStart;
  gu.tAO.value = ao.gtaoMap;
  gu.tBloom.value = bloom.bloomTexture;

  let gravityLens: Parameters<PostFx['setGravityLens']>[0] = null;
  const lensCenter = new THREE.Vector3();
  const lensEdge = new THREE.Vector3();
  const updateGravityLens = (): void => {
    gu.uGravityLens.value.z = 0;
    if (!gravityLens) return;
    // 后期早于 RenderPass 执行投影，因此必须先同步本帧相机的位置与朝向。
    camera.updateWorldMatrix(true, false);
    lensCenter.copy(gravityLens.center).applyMatrix4(camera.matrixWorldInverse);
    if (lensCenter.z >= -camera.near || lensCenter.z <= -camera.far) return;
    lensEdge.copy(lensCenter);
    lensEdge.y += gravityLens.radius;
    lensCenter.applyMatrix4(camera.projectionMatrix);
    lensEdge.applyMatrix4(camera.projectionMatrix);
    const radius = Math.abs(lensEdge.y - lensCenter.y) * 0.5;
    const x = lensCenter.x * 0.5 + 0.5;
    const y = lensCenter.y * 0.5 + 0.5;
    const dx = Math.max(-x, 0, x - 1) * gu.uAspect.value;
    const dy = Math.max(-y, 0, y - 1);
    if (Math.hypot(dx, dy) >= radius) return;
    gu.uGravityLens.value.set(x, y, radius);
  };

  const named: Array<readonly [string, Pass]> = [
    ['render', renderPass],
    ['ao', ao],
    ['bloom', bloom],
    ['grade', grade],
  ];
  let smaa: SMAAPass | null = smaaMode ? createSmaaPass() : null;
  if (smaa) named.push(['smaa', smaa]);
  for (const [, p] of named) composer.addPass(p);

  const apply = (): void => {
    const plan = planPasses(quality);
    ao.enabled = plan.ao;
    gu.uAoIntensity.value = plan.ao ? a.intensity : 0;
    bloom.enabled = plan.bloom;
    gu.uBloom.value = plan.bloom ? 1 : 0;
    grade.enabled = plan.grade;
    // 深度只有 AO 读：AO 关时 MSAA resolve 不再拷深度（smaa 模式无 resolve，不影响）。
    sceneTarget.resolveDepthBuffer = plan.ao;
  };
  apply();

  let disposed = false;
  return {
    composer,
    get antialias() {
      return antialias;
    },
    sceneTarget,
    get quality() {
      return quality;
    },
    grade: gu,
    enabledPasses() {
      return named.filter(([, p]) => p.enabled).map(([n]) => n);
    },
    setQuality(q) {
      planPasses(q);
      quality = q;
      apply();
    },
    setAntialias(mode) {
      if (disposed) throw new Error('post-fx: setAntialias after dispose');
      checkAntialias(mode);
      if (mode === antialias) return;
      const toSmaa = mode === 'smaa';
      sceneTarget.samples = toSmaa ? 0 : lighting.msaa;
      sceneTarget.dispose(); // 释放 GPU 帧缓冲；下次 setRenderTarget 按新采样数重建（对象/深度纹理引用不变）
      if (toSmaa) {
        smaa = createSmaaPass();
        composer.addPass(smaa); // addPass 按 composer 当前尺寸 × 像素比 setSize
        named.push(['smaa', smaa]);
      } else if (smaa) {
        composer.removePass(smaa);
        smaa.dispose();
        const i = named.findIndex(([n]) => n === 'smaa');
        if (i >= 0) named.splice(i, 1);
        smaa = null;
      }
      grade.needsSwap = toSmaa;
      composer.readBuffer = sceneTarget;
      composer.writeBuffer = displayTarget;
      antialias = mode;
    },
    setSize(width, height, pixelRatio) {
      if (!(width > 0 && height > 0 && pixelRatio > 0)) throw new Error(`post-fx: invalid size ${width}×${height}@${pixelRatio}`);
      // AO/bloom 按 CSS 像素定分辨率（019 修复轮）：2× 像素比下不再算 4 倍的 AO/bloom（软阴影/辉光没有像素级细节）。
      ao.pixelRatio = pixelRatio;
      bloom.pixelRatio = pixelRatio;
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      gu.uAspect.value = width / height;
      gu.uHalfTexel.value.set(0.5 / sceneTarget.width, 0.5 / sceneTarget.height);
    },
    setGravityLens(lens) {
      gravityLens = lens;
    },
    render(deltaTime) {
      if (disposed) throw new Error('post-fx: render after dispose');
      updateGravityLens();
      composer.renderToScreen = true;
      composer.render(deltaTime);
    },
    renderTexture() {
      updateGravityLens();
      composer.renderToScreen = false;
      // 保持深度与 HDR 场景目标固定，避免后期读取上一张预览的缓冲。
      composer.readBuffer = sceneTarget;
      composer.writeBuffer = displayTarget;
      composer.render(0);
      return antialias === 'smaa' ? composer.readBuffer.texture : displayTarget.texture;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const p of composer.passes) p.dispose();
      composer.dispose();
      for (const d of depthTextures) d?.dispose();
    },
  };
}
