/**
 * WebGPU 后期（?renderer=webgpu，随 webgpu-stage 分块加载）：three/webgpu PostProcessing + TSL，链路与 render/stage/post-fx（WebGL）一致：
 * 场景 pass（HDR + 深度）→ [AO 预处理：AO 分辨率的视空间法线 → GTAO → 泊松降噪] → [Bloom 降分辨率]
 * → 调色输出（与 GRADE_FRAGMENT 逐行对应：引力透镜 → 地面反射 → bloom 相加 → 色调映射 → sRGB → 乘 AO、tint/饱和/对比/暗角）→ [SMAA → 画布]。
 * - 画质 / 抗锯齿 / 反射开关变化时重建输出节点图：不在图里的 TSL 节点不执行，low 不付 AO/bloom 的开销。场景 pass、AO、bloom 节点只建一次。
 * - 调色 uniform 仍是 IUniform（天气、设施/港口演出、ai-city 每帧写 .value），对应的 TSL uniform 每次渲染读回。
 * - three 后期四边形的 uv 原点在左上（y 向下）：引力透镜在 WebGL 的 y 向上坐标里计算后翻回；地面反射用 getViewPosition/getScreenPosition（已处理坐标系与深度范围）。
 * - AO/bloom 分辨率与 WebGL 相同：绘制缓冲 × resolutionScale / max(1, 像素比)（即按 CSS 像素）。
 * - 与 WebGL 的已知差异：降噪用 three DenoiseNode（固定 16 个样本；WebGL 为 lighting.ao.denoiseSamples），其余参数取 GTAOPass 默认值；
 *   SMAA 输出先写混合目标再由后期四边形复制到画布（多一次全屏复制）；场景 pass 不带模板缓冲（r180 无法采样 depth24plus-stencil8 的深度，
 *   绑定视图 aspect 固定为 all），依赖模板的效果在 WebGPU 下不生效。
 */
import * as THREE from 'three';
import { PostProcessing } from 'three/webgpu';
import type { Node, WebGPURenderer } from 'three/webgpu';
import {
  Break, Fn, If, Loop, abs, clamp, cos, cross, dot, float, getScreenPosition, getViewPosition, int, ivec2, length, min, mix, normalize, pass, pow,
  reflect, renderOutput, rtt, select, sin, smoothstep, textureLoad, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl';
import BloomNode from 'three/addons/tsl/display/BloomNode.js';
import { denoise } from 'three/addons/tsl/display/DenoiseNode.js';
import { ao as gtao } from 'three/addons/tsl/display/GTAONode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { ANTIALIAS_MODES } from '../../config/lighting-rules.ts';
import type { AntialiasMode } from '../../config/lighting-rules.ts';
import { gradeUniformDefaults, planPasses, updateGravityLensUniform, updateViewUpUniform } from '../stage/post-fx.ts';
import type { GradeUniforms, GravityLens, PostFx, PostFxInput } from '../stage/post-fx.ts';

// TSL 节点的静态类型很宽（ShaderNodeObject），这里统一按“任意节点”处理（同 webgpu-materials）。
type N = ReturnType<typeof float>;

/** IUniform → uniform 节点，每次渲染读 .value（外部代码整体替换或原地修改 .value 都生效）。 */
const live = (u: THREE.IUniform): N => uniform(u.value).onRenderUpdate(() => u.value) as unknown as N;

/** Bloom 按 resolutionScale 降分辨率（父类每帧以绘制缓冲尺寸调用 setSize，再从一半起做 5 级 mip，同 UnrealBloomPass）。 */
class ScaledBloomNode extends BloomNode {
  /** resolutionScale / max(1, 像素比)，setSize 写入。 */
  scale = 1;

  override setSize(width: number, height: number): void {
    super.setSize(Math.max(2, Math.round(width * this.scale)), Math.max(2, Math.round(height * this.scale)));
  }
}

/** RTT 目标：不要深度缓冲（RTTNodeOptions 的类型只声明了 type，RenderTarget 接受全部选项）。 */
const flatTarget = (type: THREE.TextureDataType): { type: THREE.TextureDataType } => ({ type, depthBuffer: false }) as { type: THREE.TextureDataType };

const SSR_STEPS = 24;
const SSR_REFINE = 4;

export function createWebGpuPostFx(input: PostFxInput & { readonly renderer: WebGPURenderer }): PostFx {
  const { renderer, scene, camera, lighting } = input;
  let quality = input.quality;
  planPasses(quality); // 校验画质
  const checkAntialias = (mode: AntialiasMode): void => {
    if (!(ANTIALIAS_MODES as readonly string[]).includes(mode)) throw new Error(`webgpu-post-fx: unknown antialias '${String(mode)}'`);
  };
  let antialias = input.antialias ?? lighting.antialias;
  checkAntialias(antialias);
  let reflections = true;

  const gu: GradeUniforms = { tDiffuse: { value: null }, toneMappingExposure: { value: renderer.toneMappingExposure }, ...gradeUniformDefaults() };
  const g = lighting.grade;
  gu.uTint.value.set(g.tint);
  gu.uContrast.value = g.contrast;
  gu.uSaturation.value = g.saturation;
  gu.uVignette.value = g.vignette;
  gu.uVignetteStart.value = g.vignetteStart;
  gu.uSsrMaxDistance.value = lighting.ssr.maxDistance;
  gu.uSsrThickness.value = lighting.ssr.thickness;
  gu.uProjection.value = camera.projectionMatrix;
  gu.uInverseProjection.value = camera.projectionMatrixInverse;
  const u = {
    aoIntensity: live(gu.uAoIntensity),
    ssr: live(gu.uSsr),
    ssrMaxDistance: live(gu.uSsrMaxDistance),
    ssrThickness: live(gu.uSsrThickness),
    projection: live(gu.uProjection),
    inverseProjection: live(gu.uInverseProjection),
    viewUp: live(gu.uViewUp),
    tint: live(gu.uTint),
    contrast: live(gu.uContrast),
    saturation: live(gu.uSaturation),
    vignette: live(gu.uVignette),
    vignetteStart: live(gu.uVignetteStart),
    aspect: live(gu.uAspect),
    gravityLens: live(gu.uGravityLens),
    halfTexel: live(gu.uHalfTexel),
  };

  // 场景 pass：HalfFloat HDR + 深度纹理；msaa 模式多重采样（采样数由 options.samples 决定，PassNode.setup 每次构建都按它重设）。
  const sceneOptions: THREE.RenderTargetOptions = { samples: antialias === 'smaa' ? 0 : lighting.msaa };
  const scenePass = pass(scene, camera, sceneOptions);
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  /** 场景深度的像素尺寸（setSize 写入）。 */
  const depthSize = uniform(new THREE.Vector2(1, 1));

  /**
   * 由全分辨率深度重建视空间法线：同 AO_PREPASS_FRAGMENT / three getNormalFromDepth（后者已换成 three 后期坐标），
   * 但尺寸取自 uniform —— msaa 模式的深度是多重采样纹理，three 的版本对它生成 textureDimensions(t, 0)，WGSL 不接受。
   */
  const normalFromDepth = (at: N): N => {
    const p = ivec2(at.mul(depthSize)).toVar();
    const load = (x: number, y: number): N => textureLoad(depth.value, p.add(ivec2(x, y))).x.toVar() as unknown as N;
    const c0 = load(0, 0);
    const l2 = load(-2, 0);
    const l1 = load(-1, 0);
    const r1 = load(1, 0);
    const r2 = load(2, 0);
    const b2 = load(0, 2);
    const b1 = load(0, 1);
    const t1 = load(0, -1);
    const t2 = load(0, -2);
    const dl = abs(l1.mul(2).sub(l2).sub(c0));
    const dr = abs(r1.mul(2).sub(r2).sub(c0));
    const db = abs(b1.mul(2).sub(b2).sub(c0));
    const dt = abs(t1.mul(2).sub(t2).sub(c0));
    const view = (q: N, d: N): N => getViewPosition(q, d, u.inverseProjection) as unknown as N;
    const ce = view(at, c0).toVar();
    const dx = vec2(float(1).div(depthSize.x), 0);
    const dy = vec2(0, float(1).div(depthSize.y));
    const dpdx = select(dl.lessThan(dr), ce.sub(view(at.sub(dx), l1)), view(at.add(dx), r1).sub(ce));
    const dpdy = select(db.lessThan(dt), ce.sub(view(at.add(dy), b1)), view(at.sub(dy), t1).sub(ce));
    return normalize(cross(dpdx, dpdy));
  };

  // AO 预处理：AO 分辨率的视空间法线，天空为零向量；GTAO、降噪与地面反射共用。
  const normals = rtt(Fn(() => {
    const n = vec3(0).toVar();
    If(depth.sample(uv()).x.lessThan(1), () => {
      n.assign(normalFromDepth(uv() as unknown as N));
    });
    return vec4(n, 1);
  })(), 1, 1, flatTarget(THREE.HalfFloatType));
  normals.value.minFilter = THREE.NearestFilter;
  normals.value.magFilter = THREE.NearestFilter;
  const a = lighting.ao;
  const aoNode = gtao(depth, normals, camera);
  aoNode.radius.value = a.radius;
  aoNode.distanceExponent.value = a.distanceExponent;
  aoNode.thickness.value = a.thickness;
  aoNode.scale.value = a.scale;
  aoNode.samples.value = a.samples;
  const denoiseNode = denoise(aoNode.getTextureNode(), depth, normals, camera);
  denoiseNode.lumaPhi.value = 10;
  denoiseNode.depthPhi.value = 2;
  denoiseNode.normalPhi.value = 3;
  denoiseNode.radius.value = 8;
  const aoMap = rtt(denoiseNode, 1, 1, flatTarget(THREE.HalfFloatType));

  const b = lighting.bloom;
  const bloomNode = new ScaledBloomNode(color, b.strength, b.radius, b.threshold);
  // 类型声明里叫 getTexture，实现是 getTextureNode。
  const bloomMap = (bloomNode as unknown as { getTextureNode(): typeof color }).getTextureNode();

  // RTT 默认每次被引用的渲染都重画（预处理被 GTAO、降噪、调色三次渲染引用）：改为每帧标记一次。
  const perFrame = [normals, aoMap];
  for (const node of perFrame) node.autoUpdate = false;

  /** 与 GRADE_FRAGMENT 的 ssrSample 同式（uv 为 three 后期坐标，视空间换算交给 getViewPosition/getScreenPosition）。 */
  const ssrSample = (sceneUv: N): N => {
    const result = vec4(0).toVar();
    const viewAt = (q: N): N => getViewPosition(q, depth.sample(q).x, u.inverseProjection) as unknown as N;
    const screenAt = (p: N): N => getScreenPosition(p, u.projection) as unknown as N;
    // 半分辨率法线在剪影边缘可能取到天空纹素（零向量），一并排除。
    const normalSample = normals.sample(sceneUv).xyz.toVar();
    If(depth.sample(sceneUv).x.lessThan(1).and(dot(normalSample, normalSample).greaterThan(0)), () => {
      const n = normalize(normalSample).toVar();
      const facing = smoothstep(0.9, 0.98, dot(n, u.viewUp)).toVar();
      If(facing.greaterThan(0), () => {
        const p = viewAt(sceneUv).toVar();
        const v = normalize(p).toVar();
        const r = reflect(v, n).toVar();
        If(r.z.lessThanEqual(0), () => {
          const stepLength = u.ssrMaxDistance.div(SSR_STEPS);
          const a0 = p.toVar();
          Loop({ start: int(1), end: int(SSR_STEPS), type: 'int', condition: '<=' }, ({ i: index }) => {
            // @types/three 把循环变量标成 number，实际是 int 节点。
            const i = index as unknown as N;
            const b0 = p.add(r.mul(stepLength.mul(float(i)))).toVar();
            const q = screenAt(b0).toVar();
            If(q.x.lessThan(0).or(q.y.lessThan(0)).or(q.x.greaterThan(1)).or(q.y.greaterThan(1)), () => {
              Break();
            });
            const delta = viewAt(q).z.sub(b0.z);
            If(delta.greaterThan(0).and(delta.lessThan(u.ssrThickness)), () => {
              Loop(SSR_REFINE, () => {
                const m = a0.add(b0).mul(0.5).toVar();
                If(viewAt(screenAt(m)).z.sub(m.z).greaterThan(0), () => {
                  b0.assign(m);
                }).Else(() => {
                  a0.assign(m);
                });
              });
              q.assign(screenAt(b0));
              const edge = min(q, q.oneMinus());
              const fade = smoothstep(0, 0.08, min(edge.x, edge.y)).mul(float(1).sub(float(i).div(SSR_STEPS)));
              // 地砖是带釉层的光面，侧视俯角下物理菲涅耳只有约 .1；底值取 .25 保留釉面镜感（同 WebGL）。
              const fresnel = float(0.25).add(pow(float(1).sub(clamp(dot(v.negate(), n), 0, 1)), 5).mul(0.75));
              result.assign(vec4(color.sample(q).rgb, u.ssr.mul(fresnel).mul(fade).mul(facing)));
              Break();
            });
            a0.assign(b0);
          });
        });
      });
    });
    return result;
  };

  // Fn 体在着色器构建时才执行，那时 PostProcessing.render 已把渲染器的色调映射与输出色彩空间临时清空，所以由 build() 先取值传入。
  const gradeNode = (plan: { readonly ao: boolean; readonly bloom: boolean; readonly ssr: boolean }, toneMapping: THREE.ToneMapping, outputColorSpace: string): N => Fn(() => {
    const vUv = uv();
    const sceneUv = vUv.toVar();
    const lens = u.gravityLens;
    If(lens.z.greaterThan(0), () => {
      // 透镜中心与 WebGL 一样是 y 向上的屏幕 uv：在该坐标里弯折，再翻回 three 后期坐标。
      const glUv = vec2(vUv.x, vUv.y.oneMinus());
      const aspect = vec2(u.aspect, 1);
      const offset = glUv.sub(lens.xy).mul(aspect).toVar();
      const radius = clamp(length(offset).div(lens.z), 0, 1);
      // Wendland 在中心最强，外缘的权重及前两阶导数归零，角色进入黑芯后仍连续变形。
      const falloff = float(1).sub(radius);
      const w = falloff.mul(falloff).mul(falloff).mul(falloff).mul(radius.mul(4).add(1)).toVar();
      // 旋转集中到黑芯，避免把视界外的吸积盘本身拧成旋涡。
      const angle = w.mul(w).mul(2.4);
      const cs = cos(angle);
      const sn = sin(angle);
      const o = offset.mul(float(1).sub(w.mul(0.5)));
      // GLSL mat2(cs, sn, -sn, cs) * o（列主序）。
      const stretch = w.mul(w).mul(0.25);
      const bent = vec2(cs.mul(o.x).sub(sn.mul(o.y)), sn.mul(o.x).add(cs.mul(o.y))).mul(vec2(float(1).sub(stretch), stretch.add(1)));
      const edge = min(glUv, glUv.oneMinus()).mul(aspect);
      const edgeFade = smoothstep(0, 0.08, min(edge.x, edge.y));
      const bentUv = clamp(glUv.add(bent.sub(offset).div(aspect).mul(edgeFade)), u.halfTexel, u.halfTexel.oneMinus());
      sceneUv.assign(vec2(bentUv.x, bentUv.y.oneMinus()));
    });
    const src = color.sample(sceneUv).toVar();
    // 只改颜色：alpha 携带羽毛的负值标记，后面算 AO 权重要用。
    if (plan.ssr) {
      const reflection = ssrSample(sceneUv);
      src.assign(vec4(mix(src.rgb, reflection.rgb, reflection.a), src.a));
    }
    if (plan.bloom) {
      const bl = bloomMap.sample(sceneUv);
      src.assign(vec4(src.rgb.add(bl.rgb.mul(bl.a)), src.a));
    }
    const out = (renderOutput(src, toneMapping, outputColorSpace) as unknown as N).toVar();
    const c = out.rgb.toVar();
    // Negative HDR alpha marks thin plumage; positive opacity/additive effects retain full AO.
    const aoWeight = clamp(min(out.a, 0).add(1), 0, 1);
    if (plan.ao) c.mulAssign(mix(1, aoMap.sample(sceneUv).r, u.aoIntensity.mul(aoWeight)));
    c.mulAssign(u.tint);
    const l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c.assign(mix(vec3(l), c, u.saturation));
    c.assign(c.sub(0.5).mul(u.contrast).add(0.5));
    const p = vUv.sub(0.5).mul(vec2(u.aspect, 1));
    const r = length(p).div(length(vec2(u.aspect, 1).mul(0.5)));
    const v = smoothstep(u.vignetteStart, 1, r);
    c.mulAssign(float(1).sub(u.vignette.mul(v).mul(v)));
    return vec4(clamp(c, 0, 1), select(out.a.lessThan(0), 1, out.a));
  })() as unknown as N;

  const post = new PostProcessing(renderer);
  // 色调映射与 sRGB 在调色里做（之后还要在显示空间乘 AO、调色），四边形本身不再转换。
  post.outputColorTransform = false;
  let names: string[] = [];
  /** 绘制缓冲尺寸（setSize 写入）。 */
  let size = { width: 1, height: 1 };
  /** SMAA 模式：调色写 8 位显示缓冲（同 WebGL），SMAA 读它；每次重建换新。 */
  let aa: { readonly display: ReturnType<typeof rtt>; readonly node: ReturnType<typeof smaa> } | null = null;

  const build = (): void => {
    const plan = planPasses(quality);
    gu.uAoIntensity.value = plan.ao ? a.intensity : 0;
    gu.uBloom.value = plan.bloom ? 1 : 0;
    gu.uSsr.value = plan.ssr && lighting.ssr.enabled && reflections ? lighting.ssr.strength : 0;
    const graded = gradeNode({ ao: plan.ao, bloom: plan.bloom, ssr: gu.uSsr.value > 0 }, renderer.toneMapping, renderer.outputColorSpace);
    if (aa !== null) {
      aa.node.dispose();
      aa.display.renderTarget!.dispose();
      aa = null;
    }
    if (antialias === 'smaa') {
      const display = rtt(graded, size.width, size.height, flatTarget(THREE.UnsignedByteType));
      display.autoUpdate = false;
      const node = smaa(display);
      // 边缘/权重中间目标改 8 位（同 WebGL createSmaaPass：参考实现即 RGBA8，带宽减半）；构造时尚未分配显存。
      const internals = node as unknown as { _renderTargetEdges?: THREE.RenderTarget; _renderTargetWeights?: THREE.RenderTarget };
      for (const rt of [internals._renderTargetEdges, internals._renderTargetWeights]) {
        if (!rt) throw new Error('webgpu-post-fx: SMAANode internal render targets are missing (three API changed?)');
        rt.texture.type = THREE.UnsignedByteType;
      }
      aa = { display, node };
      post.outputNode = node as unknown as Node;
    } else {
      post.outputNode = graded as unknown as Node;
    }
    post.needsUpdate = true;
    names = ['render', ...(plan.ao ? ['ao'] : []), ...(plan.bloom ? ['bloom'] : []), 'grade', ...(antialias === 'smaa' ? ['smaa'] : [])];
  };

  build();

  const displayTarget = new THREE.RenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
  displayTarget.texture.name = 'webgpu-post-fx.display';
  let gravityLens: GravityLens = null;
  const prepare = (): void => {
    updateGravityLensUniform(gu, camera, gravityLens);
    updateViewUpUniform(gu, camera);
    gu.toneMappingExposure.value = renderer.toneMappingExposure;
    for (const node of perFrame) node.textureNeedsUpdate = true;
    if (aa !== null) aa.display.textureNeedsUpdate = true;
  };

  let disposed = false;
  return {
    get antialias() {
      return antialias;
    },
    get quality() {
      return quality;
    },
    grade: gu,
    enabledPasses: () => [...names],
    setQuality(q) {
      planPasses(q);
      if (q === quality) return;
      quality = q;
      build();
    },
    setReflections(on) {
      if (on === reflections) return;
      reflections = on;
      build();
    },
    setAntialias(mode) {
      if (disposed) throw new Error('webgpu-post-fx: setAntialias after dispose');
      checkAntialias(mode);
      if (mode === antialias) return;
      const samples = mode === 'smaa' ? 0 : lighting.msaa;
      sceneOptions.samples = samples;
      scenePass.renderTarget.samples = samples;
      scenePass.renderTarget.dispose(); // 释放 GPU 纹理；下次渲染按新采样数重建
      antialias = mode;
      build();
    },
    setSize(width, height, pixelRatio) {
      if (!(width > 0 && height > 0 && pixelRatio > 0)) throw new Error(`webgpu-post-fx: invalid size ${width}×${height}@${pixelRatio}`);
      // 与 renderer.getDrawingBufferSize 相同的取整；AO/bloom 按 CSS 像素定分辨率（同 WebGL）。
      const w = Math.floor(width * pixelRatio);
      const h = Math.floor(height * pixelRatio);
      size = { width: w, height: h };
      aoNode.resolutionScale = a.resolutionScale / Math.max(1, pixelRatio);
      const aw = Math.max(1, Math.round(w * aoNode.resolutionScale));
      const ah = Math.max(1, Math.round(h * aoNode.resolutionScale));
      normals.setSize(aw, ah);
      aoMap.setSize(aw, ah);
      bloomNode.scale = b.resolutionScale / Math.max(1, pixelRatio);
      depthSize.value.set(w, h);
      displayTarget.setSize(w, h);
      aa?.display.setSize(w, h);
      gu.uAspect.value = width / height;
      gu.uHalfTexel.value.set(0.5 / w, 0.5 / h);
    },
    setGravityLens(lens) {
      gravityLens = lens;
    },
    // WebGPU 时间戳只给整帧总计（见 render/stage/gpu-timer），没有按 pass 的分段。
    setGpuTimer() {},
    render() {
      if (disposed) throw new Error('webgpu-post-fx: render after dispose');
      prepare();
      post.render();
    },
    compile(root) {
      // 绑定场景 pass 的目标编译，管线键（格式、采样数）才与真实渲染一致；compileAsync 在首个 await 前已取走当前目标。
      const target = renderer.getRenderTarget();
      renderer.setRenderTarget(scenePass.renderTarget);
      const ready = renderer.compileAsync(root, camera, scene);
      renderer.setRenderTarget(target);
      return ready;
    },
    renderTexture() {
      prepare();
      const target = renderer.getRenderTarget();
      renderer.setRenderTarget(displayTarget);
      post.render();
      renderer.setRenderTarget(target);
      return displayTarget.texture;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (aa !== null) {
        aa.node.dispose();
        aa.display.renderTarget!.dispose();
      }
      post.dispose();
      scenePass.dispose();
      normals.renderTarget!.dispose();
      aoNode.dispose();
      aoMap.renderTarget!.dispose();
      bloomNode.dispose();
      displayTarget.dispose();
    },
  };
}
