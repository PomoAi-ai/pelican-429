import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createParticleCloud } from './grassy/grassy-particles.ts';
import { createWorkstationDisplayState, type WorkstationDisplay } from './workstation-display-state.ts';
import { glslFloat } from './wind.ts';

function displayBuilder(root: THREE.Group) {
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const stencil = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilWriteMask: 0 };
  const ink = (color: number, opacity = 1): THREE.MeshBasicMaterial => {
    const value = new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false, ...stencil });
    materials.push(value);
    return value;
  };
  const part = (finish: THREE.Material, w: number, h: number, d: number, x: number, y: number, z = 0,
    shape?: THREE.BufferGeometry, parent: THREE.Object3D = root): THREE.Mesh => {
    let geometry = shape;
    if (!geometry) {
      const key = `${w},${h},${d}`;
      geometry = geometries.get(key);
      if (!geometry) {
        geometry = new RoundedBoxGeometry(w, h, d, 2, Math.min(.035, w / 4, h / 4, d / 4));
        geometries.set(key, geometry);
      }
    }
    const mesh = new THREE.Mesh(geometry, finish);
    if (shape) mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 2;
    parent.add(mesh);
    return mesh;
  };
  const canvasTexture = (paint: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Workstation display needs a 2D canvas context');
    paint(ctx);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    return texture;
  };
  const panel = (width: number, height: number, x: number, y: number, z: number,
    paint: (ctx: CanvasRenderingContext2D) => void, parent: THREE.Object3D = root): THREE.Mesh => {
    const texture = canvasTexture(paint);
    const finish = ink(0xffffff);
    finish.map = texture;
    const geometry = new THREE.PlaneGeometry(width, height);
    geometries.set(`panel-${textures.length}`, geometry);
    return part(finish, 1, 1, 1, x, y, z, geometry, parent);
  };
  return { root, geometries, materials, stencil, ink, part, panel, canvasTexture,
    dispose(): void {
      for (const value of geometries.values()) value.dispose();
      for (const value of materials) value.dispose();
      for (const value of textures) value.dispose();
    },
  };
}

type DisplayBuilder = ReturnType<typeof displayBuilder>;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y); ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius); ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath(); ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 24, color = '#34373d'): void {
  ctx.fillStyle = color;
  ctx.font = `500 ${size}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillText(value, x, y);
}

function glass(ctx: CanvasRenderingContext2D): void {
  roundRect(ctx, 0, 0, 1024, 640, 48, 'rgba(255,255,255,.9)');
  const gradient = ctx.createLinearGradient(0, 0, 1024, 640);
  gradient.addColorStop(0, 'rgba(246,244,246,.72)');
  gradient.addColorStop(1, 'rgba(224,226,231,.56)');
  ctx.clearRect(3, 3, 1018, 634);
  roundRect(ctx, 3, 3, 1018, 634, 45, gradient);
}

function spatialToolbar(ctx: CanvasRenderingContext2D): void {
  glass(ctx);
  for (let i = 0; i < 6; i++) {
    const x = 52 + i * 156;
    roundRect(ctx, x, 114, 125, 414, 55, ['#8aa6ba', '#b7a0c5', '#92b4a2', '#d5a28b', '#bea96c', '#9ca4b2'][i]!);
    text(ctx, ['◈', '◷', '▣', '♫', '✦', '⚙'][i]!, x + 26, 384, 100, '#ffffff');
  }
}

function desktopWindow(ctx: CanvasRenderingContext2D): void {
  glass(ctx);
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = ['#ef8582', '#dfbc74', '#91ba9d'][i]!;
    ctx.beginPath(); ctx.arc(40 + i * 38, 38, 10, 0, Math.PI * 2); ctx.fill();
  }
  text(ctx, 'Workspace', 380, 48, 30, '#53555c');
  roundRect(ctx, 20, 94, 176, 518, 25, 'rgba(255,255,255,.25)');
  for (let i = 0; i < 5; i++) {
    if (i === 0) roundRect(ctx, 30, 116, 156, 67, 20, 'rgba(255,255,255,.58)');
    text(ctx, ['◈  Home', '▣  Files', '◷  Recent', '♫  Music', '☁  Cloud'][i]!, 45, 161 + i * 85, 24, '#646770');
  }
  text(ctx, 'Your space.', 235, 168, 52);
  text(ctx, 'Everything, a little closer.', 239, 219, 27, '#6c6d75');
  for (let i = 0; i < 3; i++) {
    const x = 235 + i * 251;
    roundRect(ctx, x, 263, 226, 185, 27, ['rgba(214,174,158,.63)', 'rgba(181,163,200,.6)', 'rgba(163,192,169,.62)'][i]!);
    roundRect(ctx, x + 36, 307, 154, 90, 23, 'rgba(255,255,255,.5)');
    text(ctx, ['◈', '◉', '✦'][i]!, x + 92, 370, 57, ['#a77664', '#8e7b9b', '#668f72'][i]!);
    text(ctx, ['Projects', 'Explore', 'Personal'][i]!, x + 17, 495, 28, '#575962');
  }
  roundRect(ctx, 240, 541, 703, 48, 20, 'rgba(255,255,255,.37)');
  text(ctx, 'All changes saved to your space', 263, 574, 25, '#74767e');
}

function desktopDisplay(builder: DisplayBuilder): (time: number) => void {
  const { root, panel } = builder;
  const window = panel(1.38, .86, -.22, -.015, -.14, desktopWindow);
  window.name = 'desktop-spatial-window';
  const side = panel(.45, .57, .66, .07, .105, ctx => {
    glass(ctx);
    text(ctx, 'NOW PLAYING', 98, 89, 51, '#74767b');
    roundRect(ctx, 113, 132, 798, 288, 68, 'rgba(206,173,167,.5)');
    ctx.fillStyle = 'rgba(247,239,230,.85)';
    ctx.beginPath(); ctx.arc(512, 276, 108, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#baa7bc'; ctx.beginPath(); ctx.arc(512, 276, 45, 0, Math.PI * 2); ctx.fill();
    text(ctx, 'A quiet morning', 118, 483, 62);
    text(ctx, '◁      Ⅱ      ▷', 153, 572, 86, '#61646c');
  });
  side.rotation.y = -.10;
  const dock = panel(1.28, .16, -.13, -.548, .24, spatialToolbar);
  dock.name = 'desktop-floating-toolbar';
  return time => {
    root.position.y = Math.sin(time * .9) * .009;
    window.position.z = -.14 + Math.sin(time * .75) * .01;
    side.rotation.y = -.10 + Math.sin(time * .55) * .022;
    dock.position.z = .24 + Math.sin(time * .75 + .7) * .012;
  };
}

function holographicDisplay(builder: DisplayBuilder): (time: number) => void {
  const { root, part, ink, panel, materials, stencil } = builder;
  const left = panel(.50, .64, -.67, .06, -.15, ctx => {
    glass(ctx);
    text(ctx, 'Home', 92, 99, 87);
    text(ctx, 'Comfort', 98, 172, 55, '#737982');
    text(ctx, '24°', 142, 353, 190, '#7d9c8a');
    roundRect(ctx, 91, 428, 843, 137, 54, 'rgba(255,255,255,.4)');
    text(ctx, 'Air quality   Good', 129, 512, 62);
  });
  left.rotation.y = .13;
  const right = panel(.50, .52, .67, .12, .11, ctx => {
    glass(ctx);
    text(ctx, 'Energy', 88, 108, 85);
    text(ctx, '98%', 103, 302, 190, '#ab9477');
    text(ctx, 'Clean power', 104, 409, 69, '#6b6f75');
    roundRect(ctx, 97, 471, 831, 55, 26, 'rgba(255,255,255,.56)');
    roundRect(ctx, 97, 471, 717, 55, 26, '#a9baa2');
  });
  right.rotation.y = -.13;
  panel(1.25, .13, 0, .453, -.15, ctx => {
    glass(ctx);
    text(ctx, '◈    My home     /     Activity', 63, 415, 128, '#5f626a');
  });
  const chart = new THREE.Group();
  chart.position.set(0, -.27, .055);
  root.add(chart);
  part(ink(0xf4f0ed, .48), .78, .018, .43, 0, -.105, 0, undefined, chart);
  const bars: THREE.Mesh[] = [];
  const colors = [0xb8a4c7, 0x9ab9a6, 0xd2ac91, 0xa3b4c6];
  const finishes = colors.map(color => new THREE.MeshStandardMaterial({ color, emissive: color,
    emissiveIntensity: .35, roughness: .45, metalness: .05, ...stencil }));
  materials.push(...finishes);
  for (let i = 0; i < 8; i++) {
    bars.push(part(finishes[i % finishes.length]!, .112, .3, .112, -.26 + i % 4 * .173, .05, i < 4 ? -.12 : .12, undefined, chart));
  }
  const dock = panel(1.12, .135, 0, -.54, .26, spatialToolbar);
  return time => {
    root.position.y = Math.sin(time * .9) * .009;
    left.rotation.y = .13 + Math.sin(time * .6) * .02;
    right.rotation.y = -.13 + Math.sin(time * .6 + 1) * .02;
    chart.rotation.y = Math.sin(time * .32) * .12;
    dock.position.z = .26 + Math.sin(time * .6) * .01;
    for (let i = 0; i < bars.length; i++) {
      const h = .13 + (.5 + Math.sin(time * .75 + i * .8) * .5) * .34;
      bars[i]!.scale.y = h / .3;
      bars[i]!.position.y = -.095 + h / 2;
    }
  };
}

/** 能量球外壳：菲涅尔边缘 + 纬向扫光 + 经线；WebGPU 节点版本同表。 */
export const ORB_SHELL_SHADER = {
  rimSharp: 3, sweep: { freq: 28, speed: 1.3, sharp: 30 }, meridian: { freq: 18.8496, sharp: 100 },
  alpha: { base: 0.035, rim: 0.48, sweep: 0.06, meridian: 0.035 }, inner: [0.12, 0.52, 0.95], rim: [0.3, 0.9, 1],
} as const;
const O = ORB_SHELL_SHADER;
// 原 GLSL 的小数省略前导 0（.035）；按同样格式生成，WebGL 着色器文本逐字不变。
const o = (n: number): string => glslFloat(n).replace(/^0\./, '.');

function globeDisplay(builder: DisplayBuilder): (time: number) => void {
  const { root, part, ink, materials, stencil, geometries } = builder;
  const orb = new THREE.Group();
  orb.name = 'workstation-energy-orb';
  root.add(orb);
  const phase = { value: 0 };
  const shellMaterial = new THREE.ShaderMaterial({
    name: 'workstation-orb-shell',
    uniforms: { phase }, transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.AdditiveBlending, side: THREE.FrontSide, ...stencil,
    vertexShader: `varying vec3 vNormal, vEye; varying vec2 vUv;
      void main() {
        vec4 eye = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vEye = -eye.xyz; vUv = uv;
        gl_Position = projectionMatrix * eye;
      }`,
    fragmentShader: `uniform float phase; varying vec3 vNormal, vEye; varying vec2 vUv;
      void main() {
        float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vEye))), ${o(O.rimSharp)});
        float sweep = pow(max(0.0, sin(vUv.y * ${o(O.sweep.freq)} - phase * ${o(O.sweep.speed)})), ${o(O.sweep.sharp)});
        float meridian = pow(abs(cos(vUv.x * ${o(O.meridian.freq)})), ${o(O.meridian.sharp)});
        float alpha = ${o(O.alpha.base)} + rim * ${o(O.alpha.rim)} + sweep * ${o(O.alpha.sweep)} + meridian * ${o(O.alpha.meridian)};
        gl_FragColor = vec4(mix(vec3(${O.inner.map(o).join(', ')}), vec3(${O.rim.map(o).join(', ')}), rim), alpha);
        #include <colorspace_fragment>
      }`,
  });
  materials.push(shellMaterial);
  const sphere = new THREE.SphereGeometry(1, 48, 32);
  const diamond = new THREE.OctahedronGeometry(1);
  const ringGeometry = new THREE.TorusGeometry(1, .008, 6, 96);
  geometries.set('orb-shell', sphere); geometries.set('orb-core', diamond); geometries.set('orb-orbit', ringGeometry);
  const shell = part(shellMaterial, .4, .4, .4, 0, 0, 0, sphere, orb);
  const glow = ink(0x49cfff, .13); glow.blending = THREE.AdditiveBlending;
  const halo = part(glow, .17, .17, .17, 0, 0, 0, sphere, orb);
  const core = part(ink(0xb3faff, .95), .072, .09, .072, 0, 0, 0, diamond, orb);
  const cage = part(ink(0x43d6ff, .4), .115, .145, .115, 0, 0, 0, diamond, orb);
  const ringMaterial = ink(0x42bfff, .78);
  const orbiters = Array.from({ length: 3 }, (_, i) => {
    const pivot = new THREE.Group(); orb.add(pivot);
    const radius = [.58, .46, .48][i]!;
    part(ringMaterial, radius, radius, radius, 0, 0, 0, ringGeometry, pivot);
    const mote = part(ink(0xd4ffff, .95), .018, .018, .018, 0, 0, 0, sphere, pivot);
    return { pivot, mote, radius };
  });
  const particles = createParticleCloud(32, 0x56cfff);
  Object.assign(particles.points.material, stencil);
  geometries.set('orb-particles', particles.points.geometry); materials.push(particles.points.material);
  orb.add(particles.points);
  return time => {
    phase.value = time;
    orb.position.y = .035 + Math.sin(time * 1.1) * .018;
    shell.rotation.y = time * .08;
    core.rotation.set(time * .4, time * .6, time * .17);
    cage.rotation.set(-time * .22, time * .32, .3);
    halo.scale.setScalar(.17 + Math.sin(time * 2.2) * .016);
    glow.opacity = .13 + Math.sin(time * 2.2) * .035;
    for (const [i, { pivot, mote, radius }] of orbiters.entries()) {
      pivot.rotation.set([1.12, .32, .65][i]! + Math.sin(time * .24 + i) * .12,
        i * 1.2 + time * [.12, -.18, .14][i]!, i * .85);
      const angle = time * [1.1, -.85, .65][i]! + i * 2;
      mote.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    }
    for (let i = 0; i < 32; i++) {
      const angle = i * 2.39996 + time * (.13 + i % 3 * .035);
      const height = Math.sin(time * .32 + i * 1.7) * .46;
      const radius = Math.sqrt(Math.max(0, .48 * .48 - height * height)) + .025;
      particles.positions.setXYZ(i, Math.cos(angle) * radius, height, Math.sin(angle) * radius);
      particles.sizes.setX(i, .012 + i % 4 * .006);
      particles.alphas.setX(i, .35 + Math.sin(time * 1.3 + i) * .2);
    }
    particles.positions.needsUpdate = particles.sizes.needsUpdate = particles.alphas.needsUpdate = true;
  };
}

/** 三种界面共享一个投影台，切换时先收束再展开，桌面与碰撞不随显示内容改变。 */
export function createWorkstationDisplay() {
  const root = new THREE.Group();
  root.name = 'workstation-display';
  const content = new THREE.Group();
  content.position.set(1, 1.94, 0);
  root.add(content);
  const groups = { globe: new THREE.Group(), desktop: new THREE.Group(), holographic: new THREE.Group() };
  const builders = { globe: displayBuilder(groups.globe), desktop: displayBuilder(groups.desktop), holographic: displayBuilder(groups.holographic) };
  const updates = { globe: globeDisplay(builders.globe), desktop: desktopDisplay(builders.desktop), holographic: holographicDisplay(builders.holographic) };
  for (const key of ['globe', 'desktop', 'holographic'] as const) {
    groups[key].name = `workstation-display-${key}`;
    groups[key].visible = key === 'globe';
    content.add(groups[key]);
  }
  const projection = displayBuilder(root);
  const beamMaterial = projection.ink(0xfff3e6, .04);
  beamMaterial.blending = THREE.AdditiveBlending;
  const cone = new THREE.CylinderGeometry(.34, .025, .65, 32, 1, true);
  projection.geometries.set('projection-beam', cone);
  projection.part(beamMaterial, 1, 1, 1, 1, 1.415, 0, cone);
  const coreMaterial = projection.ink(0xfff5eb, .18);
  const core = projection.part(coreMaterial, .014, .7, .014, 1, 1.44);
  const waveGeometry = new THREE.TorusGeometry(.08, .005, 6, 48);
  projection.geometries.set('projection-wave', waveGeometry);
  const waveMaterial = projection.ink(0xeee8df, .55);
  const wave = projection.part(waveMaterial, 1, 1, 1, 1, 1.15, 0, waveGeometry);
  wave.rotation.x = Math.PI / 2;
  let active: WorkstationDisplay = 'globe';
  let target: WorkstationDisplay = active;
  let time = 0;
  let changeStarted: number | null = null;
  const state = createWorkstationDisplayState();
  const request = (next: WorkstationDisplay): void => {
    if (next === target) return;
    target = next;
    changeStarted = time;
  };
  const ease = (fraction: number): number => fraction * fraction * (3 - 2 * fraction);
  return {
    root,
    update(nextTime: number, near: boolean): void {
      time = nextTime;
      request(state.update(time, near));
      let reveal = 1;
      if (changeStarted !== null) {
        const elapsed = time - changeStarted;
        if (elapsed >= .32) {
          groups[active].visible = false;
          active = target;
          groups[active].visible = true;
        }
        reveal = elapsed < .32 ? 1 - ease(elapsed / .32) : ease(Math.min(1, (elapsed - .32) / .32));
        if (elapsed >= .64) changeStarted = null;
      }
      content.scale.set(.65 + reveal * .35, Math.max(.001, reveal), .65 + reveal * .35);
      content.position.y = 1.075 + .865 * reveal;
      updates[active](time);
      const rise = time * .48 % 1;
      wave.position.y = 1.095 + rise * .43;
      wave.scale.setScalar(.35 + rise * 1.8);
      const globe = active === 'globe';
      beamMaterial.color.set(globe ? 0x4dd9ff : 0xfff3e6);
      coreMaterial.color.set(globe ? 0xb6faff : 0xfff5eb);
      waveMaterial.color.set(globe ? 0x76e9ff : 0xeee8df);
      beamMaterial.opacity = ((globe ? .09 : .033) + Math.sin(time * 1.8) * .005) * reveal;
      core.scale.y = .3 + reveal * .7;
    },
    dispose(): void {
      root.removeFromParent();
      projection.dispose();
      for (const builder of Object.values(builders)) builder.dispose();
    },
  };
}
