import * as THREE from 'three';
import type { Stage, StageRenderer } from '../stage/stage.ts';

// 背景独占反射层，住宅角色和地下设施不再额外绘制一遍。
export const RESIDENCE_REFLECTION_LAYER = 29;
const CLIP_BIAS = .003;

export type ReflectionStage = Pick<Stage<StageRenderer>, 'renderer' | 'scene' | 'camera' | 'keyLight'>;

/**
 * 平面反射水面：环境 update 里先用镜像相机离屏渲染反射层，再进主渲染；WebGL 与 WebGPU 走同一份 CPU 代码，
 * 主渲染里的多次通道（近景模糊等）复用同一张反射图。镜像相机算法同 three Reflector。
 */
export function createResidenceThreeWater(bounds: { left: number; right: number; near: number; far: number; level: number },
  surface: 'lake' | 'canal' = 'lake') {
  const geometry = new THREE.PlaneGeometry(bounds.right - bounds.left, bounds.near - bounds.far);
  const target = new THREE.WebGLRenderTarget(1024, 1024, { type: THREE.HalfFloatType });
  const textureMatrix = new THREE.Matrix4();
  const material = new THREE.ShaderMaterial({
    name: 'residence-lake-reflection',
    uniforms: {
      tDiffuse: { value: target.texture }, color: { value: new THREE.Color('#77989a') },
      textureMatrix: { value: textureMatrix }, time: { value: 0 }, lightLevel: { value: 1 },
      canal: { value: surface === 'canal' ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 reflectionUv;
      varying vec3 waterWorld;
      void main() {
        reflectionUv = textureMatrix * vec4(position, 1.0);
        waterWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse;
      uniform vec3 color;
      uniform float time;
      uniform float lightLevel;
      uniform float canal;
      varying vec4 reflectionUv;
      varying vec3 waterWorld;
      float noise(vec2 p) {
        vec2 cell = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        vec4 n = fract(sin(vec4(dot(cell, vec2(127.1, 311.7)),
          dot(cell + vec2(1, 0), vec2(127.1, 311.7)),
          dot(cell + vec2(0, 1), vec2(127.1, 311.7)),
          dot(cell + vec2(1, 1), vec2(127.1, 311.7)))) * 43758.5453);
        return mix(mix(n.x, n.y, f.x), mix(n.z, n.w, f.x), f.y);
      }
      void main() {
        vec2 p = waterWorld.xz;
        float broken = noise(p * vec2(.6, 2.7) + vec2(time * .15, -time * .3)) - .5;
        float swell = sin(p.y * .72 + p.x * .13 - time * .7);
        float ripple = sin(p.y * 3.7 + sin(p.x * .61 + time * .4) - time * 1.3 + broken * 3.0);
        float fine = sin(p.y * 11.3 - p.x * 1.1 + time * 1.8);
        vec2 uv = reflectionUv.xy / reflectionUv.w;
        float waterDistance = distance(cameraPosition, waterWorld);
        float rippleScale = mix(1.0, mix(.65, .12, smoothstep(70.0, 1150.0, waterDistance)), canal);
        float reflectionRipple = mix(rippleScale, max(.35, rippleScale), canal);
        uv += vec2(swell * .0006 + broken * .002, (ripple * .7 + fine * .3 + broken) * .0036) * reflectionRipple;
        vec2 reflectionBlur = vec2(.0008, .0012) * (1.0 + canal * 3.0 * smoothstep(200.0, 1200.0, waterDistance));
        vec3 reflected = texture2D(tDiffuse, uv).rgb * .5;
        reflected += texture2D(tDiffuse, uv + reflectionBlur).rgb * .25;
        reflected += texture2D(tDiffuse, uv - reflectionBlur).rgb * .25;
        float luminance = dot(reflected, vec3(.2126, .7152, .0722));
        reflected = mix(vec3(luminance), reflected, .48) * vec3(.9, .97, .96);
        vec3 view = normalize(cameraPosition - waterWorld);
        float fresnel = mix(.24, .17, canal) + .68 * pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);
        vec3 lake = mix(color * lightLevel, reflected, fresnel);
        float crest = pow(max(0.0, ripple * .65 + fine * .35), 10.0);
        lake += vec3(.035, .043, .04) * crest * lightLevel * (.4 + noise(p * .8)) * rippleScale;
        gl_FragColor = vec4(lake, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  material.userData.noPrecip = true;
  material.userData.noLightMap = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'residence-three-lake';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((bounds.left + bounds.right) / 2, bounds.level, (bounds.near + bounds.far) / 2);
  const mirror = new THREE.PerspectiveCamera();
  mirror.layers.set(RESIDENCE_REFLECTION_LAYER);
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();
  const normal = new THREE.Vector3();
  const mirrorPosition = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const view = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const plane = new THREE.Plane();
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();
  return {
    root: mesh,
    /** 主相机看不到水面或位于水面之下时不渲染（同 Reflector 只在水面入画时重画）。 */
    reflect({ renderer, scene, camera, keyLight }: ReflectionStage) {
      camera.updateMatrixWorld();
      mesh.updateWorldMatrix(true, false);
      frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
        camera.coordinateSystem);
      if (!frustum.intersectsObject(mesh)) return;
      mirrorPosition.setFromMatrixPosition(mesh.matrixWorld);
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      rotation.extractRotation(mesh.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotation);
      view.subVectors(mirrorPosition, cameraPosition);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate().add(mirrorPosition);
      rotation.extractRotation(camera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rotation).add(cameraPosition);
      lookAt.subVectors(mirrorPosition, lookAt).reflect(normal).negate().add(mirrorPosition);
      mirror.position.copy(view);
      mirror.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      mirror.lookAt(lookAt);
      // 投影按渲染器坐标系重建：渲染器发现相机坐标系不符会重算投影，冲掉下面的斜裁剪。
      mirror.fov = camera.fov; mirror.aspect = camera.aspect; mirror.zoom = camera.zoom;
      mirror.near = camera.near; mirror.far = camera.far;
      mirror.coordinateSystem = renderer.coordinateSystem;
      mirror.updateMatrixWorld();
      mirror.updateProjectionMatrix();
      textureMatrix.set(
        .5, 0, 0, .5,
        0, .5, 0, .5,
        0, 0, .5, .5,
        0, 0, 0, 1,
      ).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse).multiply(mesh.matrixWorld);
      // 斜裁剪（Lengyel）：近裁剪面换成水面，水下物体不进反射；WebGPU 深度为 [0, 1]，系数与偏移不同。
      plane.setFromNormalAndCoplanarPoint(normal, mirrorPosition).applyMatrix4(mirror.matrixWorldInverse);
      clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const p = mirror.projectionMatrix.elements;
      q.set((Math.sign(clipPlane.x) + p[8]!) / p[0]!, (Math.sign(clipPlane.y) + p[9]!) / p[5]!, -1, (1 + p[10]!) / p[14]!);
      const webgpu = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem;
      clipPlane.multiplyScalar((webgpu ? 1 : 2) / clipPlane.dot(q));
      p[2] = clipPlane.x; p[6] = clipPlane.y; p[10] = clipPlane.z + (webgpu ? 0 : 1) - CLIP_BIAS; p[14] = clipPlane.w;
      // 灯光按相机图层剔除，开启反射层后两边的相机都照得到；主相机不看反射层，不必复原。
      scene.traverse(object => { if (object instanceof THREE.Light) object.layers.enable(RESIDENCE_REFLECTION_LAYER); });
      // 主光阴影按游玩视野拟合，反射沿用上一帧的阴影图。
      const shadowUpdate = keyLight.shadow.autoUpdate;
      keyLight.shadow.autoUpdate = false;
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, mirror);
      // 联合类型的方法参数取两者交集；previous 取自同一渲染器，类型必然匹配。
      renderer.setRenderTarget(previous as THREE.WebGLRenderTarget | null);
      keyLight.shadow.autoUpdate = shadowUpdate;
    },
    update(seconds: number) { material.uniforms.time!.value = seconds; },
    setNightFactor(night: number) { material.uniforms.lightLevel!.value = 1 - night * .94; },
    dispose() { mesh.removeFromParent(); target.dispose(); material.dispose(); geometry.dispose(); },
  };
}
