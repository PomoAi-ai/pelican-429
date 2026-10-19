import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

// 背景独占反射层，住宅角色和地下设施不再额外绘制一遍。
export const RESIDENCE_REFLECTION_LAYER = 29;

export function createResidenceThreeWater(bounds: { left: number; right: number; near: number; far: number; level: number }) {
  const geometry = new THREE.PlaneGeometry(bounds.right - bounds.left, bounds.near - bounds.far);
  const reflection = new Reflector(geometry, {
    textureWidth: 1024, textureHeight: 1024, multisample: 0, clipBias: .003,
    shader: {
      name: 'residence-lake-reflection',
      uniforms: {
        tDiffuse: { value: null }, color: { value: new THREE.Color('#77989a') },
        textureMatrix: { value: new THREE.Matrix4() }, time: { value: 0 }, lightLevel: { value: 1 },
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
        varying vec4 reflectionUv;
        varying vec3 waterWorld;
        void main() {
          vec2 p = waterWorld.xz;
          float swell = sin(p.y * .72 + p.x * .13 - time * .7);
          float ripple = sin(p.y * 3.7 + sin(p.x * .61 + time * .4) - time * 1.3);
          float fine = sin(p.y * 11.3 - p.x * 1.1 + time * 1.8);
          vec2 uv = reflectionUv.xy / reflectionUv.w;
          uv += vec2(swell * .0006, (ripple * .7 + fine * .3) * .0018);
          vec3 reflected = texture2D(tDiffuse, uv).rgb * .5;
          reflected += texture2D(tDiffuse, uv + vec2(.0008, .0012)).rgb * .25;
          reflected += texture2D(tDiffuse, uv - vec2(.0008, .0012)).rgb * .25;
          vec3 view = normalize(cameraPosition - waterWorld);
          float fresnel = .24 + .68 * pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);
          vec3 lake = mix(color * lightLevel, reflected, fresnel);
          float crest = pow(max(0.0, ripple * .65 + fine * .35), 10.0);
          lake += vec3(.035, .043, .04) * crest * lightLevel;
          gl_FragColor = vec4(lake, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    },
  });
  reflection.name = 'residence-three-lake';
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.set((bounds.left + bounds.right) / 2, bounds.level, (bounds.near + bounds.far) / 2);
  reflection.camera.layers.set(RESIDENCE_REFLECTION_LAYER);
  const material = reflection.material as THREE.ShaderMaterial;
  material.uniforms.color!.value.set('#77989a');
  material.userData.noPrecip = true;
  material.userData.noLightMap = true;
  const renderReflection = reflection.onBeforeRender;
  reflection.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    const lights: { light: THREE.Light; mask: number }[] = [];
    scene.traverse(object => {
      if (object instanceof THREE.Light) {
        lights.push({ light: object, mask: object.layers.mask });
        object.layers.enable(RESIDENCE_REFLECTION_LAYER);
      }
    });
    try {
      renderReflection.call(this, renderer, scene, camera, geometry, material, group);
    } finally {
      for (const { light, mask } of lights) light.layers.mask = mask;
    }
  };
  return {
    root: reflection,
    update(seconds: number) { material.uniforms.time!.value = seconds; },
    setNightFactor(night: number) { material.uniforms.lightLevel!.value = 1 - night * .94; },
    dispose() { reflection.removeFromParent(); reflection.dispose(); geometry.dispose(); },
  };
}
