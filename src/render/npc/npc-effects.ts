import * as THREE from 'three';
import { npcAction, SAM_ROUTING_SOURCE } from '../../config/npc.ts';
import type { NpcAction, NpcKind } from '../../config/npc.ts';
import { createParticleCloud } from '../grassy/grassy-particles.ts';

const TAU = Math.PI * 2;
const clamp = (v: number) => THREE.MathUtils.clamp(v, 0, 1);
const ease = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const envelope = (t: number, start: number, end: number, ramp = 0.2) => ease((t - start) / ramp) * (1 - ease((t - end + ramp) / ramp));
const CYAN = '#4ce6ff', GOLD = '#ffe0a0', GREEN = '#78ffc9', ORANGE = '#ffb455';

function glow(color: THREE.ColorRepresentation, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
}

function ring(parent: THREE.Group, color: string, thickness: number, ground = false) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, thickness, 8, 96), glow(color));
  if (ground) mesh.rotation.x = -Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

/** 字幕是角色自己的游戏对白；Canvas 只制作透明字形，Sprite 保持任意观察角度可读。 */
export function caption(text: string, color: string, width: number, small = false, comic = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = small ? 192 : 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NPC 技能字幕无法创建 Canvas 2D context');
  if (comic) {
    ctx.beginPath();
    ctx.moveTo(45, 42); ctx.lineTo(946, 12); ctx.lineTo(916, 67); ctx.lineTo(995, 83);
    ctx.lineTo(955, 200); ctx.lineTo(177, 218); ctx.lineTo(55, 247); ctx.lineTo(93, 198); ctx.lineTo(24, 192);
    ctx.closePath(); ctx.fillStyle = '#fff3bc'; ctx.fill();
    ctx.lineWidth = 12; ctx.strokeStyle = '#e7a234'; ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${small ? 85 : comic ? 96 : 108}px "Arial Black", "PingFang SC", sans-serif`;
  ctx.lineJoin = 'round'; ctx.strokeStyle = comic ? '#fff7d6' : '#051526'; ctx.lineWidth = comic ? 8 : 18;
  ctx.strokeText(text, 512, canvas.height / 2, 952);
  ctx.shadowColor = color; ctx.shadowBlur = comic ? 0 : 20; ctx.fillStyle = comic ? '#512607' : color;
  ctx.fillText(text, 512, canvas.height / 2, comic ? 830 : 952);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
  sprite.scale.set(width, width * canvas.height / canvas.width, 1);
  sprite.renderOrder = 15;
  return sprite;
}

function resetSymbol(parent: THREE.Group, radius: number) {
  const group = new THREE.Group();
  const material = glow('#edfff4');
  for (let i = 0; i < 2; i++) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.095, 8, 64, Math.PI * .78), material);
    arc.rotation.z = i * Math.PI;
    const angle = i * Math.PI + Math.PI * .78;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(radius * .25, radius * .42, 3), material);
    arrow.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    arrow.rotation.z = angle;
    group.add(arc, arrow);
  }
  parent.add(group);
  return group;
}

function resetButton(parent: THREE.Group, radius: number) {
  const group = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, radius * .24, 64),
    new THREE.MeshStandardMaterial({ color: '#b0ceca', metalness: .8, roughness: .22 }));
  rim.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(radius * .86, radius * .86, radius * .12, 64),
    new THREE.MeshStandardMaterial({ color: '#056448', emissive: '#0a9a60', emissiveIntensity: .35, metalness: .35, roughness: .3 }));
  face.rotation.x = Math.PI / 2; face.position.z = radius * .14;
  const arrow = resetSymbol(group, radius * .5); arrow.position.z = radius * .23;
  const trim = ring(group, GREEN, .016); trim.scale.setScalar(radius * .91); trim.position.z = radius * .22;
  group.add(rim, face); parent.add(group);
  return group;
}

/** 固定曲线几何在创建时生成；采样只旋转光带，避免逐帧重建管线。 */
function energyRibbon(parent: THREE.Group, color: string, radius: number, height: number, turns: number) {
  const points = Array.from({ length: 81 }, (_, i) => {
    const u = i / 80; const a = u * TAU * turns;
    return new THREE.Vector3(Math.cos(a) * radius, u * height, Math.sin(a) * radius);
  });
  const path = new THREE.CatmullRomCurve3(points);
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(path, 120, .022, 5, false), glow(color));
  parent.add(ribbon);
  return ribbon;
}

function crystal(parent: THREE.Group, color: string, radius: number) {
  const group = new THREE.Group();
  const geometry = new THREE.IcosahedronGeometry(radius, 0);
  const body = new THREE.Mesh(geometry, glow(color, .22));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false }));
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(radius * .43), glow('#ffffff'));
  group.add(body, edge, core); parent.add(group);
  return group;
}

function commitCloud(cloud: ReturnType<typeof createParticleCloud>) {
  cloud.positions.needsUpdate = cloud.sizes.needsUpdate = cloud.alphas.needsUpdate = true;
}

function createModelRouting() {
  const root = new THREE.Group();
  const source = crystal(root, GOLD, .38);
  source.position.set(SAM_ROUTING_SOURCE.x, SAM_ROUTING_SOURCE.y, SAM_ROUTING_SOURCE.z);
  const sourceRing = ring(root, GOLD, .025);
  sourceRing.position.copy(source.position);
  const sourceLabel = caption('GPT-6 Astra', '#fff0bc', 5);
  sourceLabel.position.set(SAM_ROUTING_SOURCE.x, SAM_ROUTING_SOURCE.y + .9, SAM_ROUTING_SOURCE.z + .2);
  const cloud = createParticleCloud(48, GOLD);
  root.add(sourceLabel, cloud.points);
  return {
    root,
    sample(t: number) {
      const fade = envelope(t, .12, 3.25, .25);
      root.visible = fade > 0;
      source.scale.setScalar(fade * (1 + Math.sin(t * 10) * .12));
      source.rotation.set(t * .5, t, -t * .4);
      sourceRing.scale.setScalar(fade * (.54 + Math.sin(t * 8) * .03));
      sourceRing.rotation.z = -t;
      sourceRing.material.opacity = fade;
      sourceLabel.material.opacity = fade;
      for (let j = 0; j < 48; j++) {
        const angle = t * 2 + j * TAU / 48;
        cloud.positions.setXYZ(j, SAM_ROUTING_SOURCE.x + Math.cos(angle) * .7, SAM_ROUTING_SOURCE.y + Math.sin(angle) * .35, SAM_ROUTING_SOURCE.z + .05);
        cloud.sizes.setX(j, j % 8 === 0 ? .09 : .035);
        cloud.alphas.setX(j, fade * (.4 + .4 * Math.sin(angle)));
      }
      commitCloud(cloud);
    },
  };
}

function createFriesAttack() {
  const root = new THREE.Group();
  const friesGeometry = new THREE.BoxGeometry(.11, .52, .11);
  const friesMaterial = new THREE.MeshStandardMaterial({ color: '#f5bd4f', emissive: '#a85010', emissiveIntensity: .3, roughness: .7 });
  const fries = Array.from({ length: 14 }, () => { const fry = new THREE.Mesh(friesGeometry, friesMaterial); root.add(fry); return fry; });
  const words = [caption('我午餐吃了薯条。', '#fff2c0', 3.1, false, true), caption('CRUNCH!', '#ffd26b', 2.05, false, true), caption('这波有点脆。', '#c0ffe5', 2.55, false, true)];
  root.add(...words);
  const title = caption('FRIES ATTACK', '#ffe1a0', 3.2, true); title.position.set(0, 3.55, 0); root.add(title);
  const burst = createParticleCloud(96, ORANGE); root.add(burst.points);
  return {
    root,
    sample(t: number) {
      root.visible = t > .2 && t < 2.4;
      title.material.opacity = envelope(t, .3, 2.25);
      for (let i = 0; i < words.length; i++) {
        const age = t - .68 - i * .22;
        const word = words[i]!; const side = i % 2 === 0 ? -1 : 1;
        word.material.opacity = envelope(age, 0, 1.2, .16);
        word.position.set(side * (1.8 + ease(age / .6) * .8), 1.35 + i * .64 + Math.sin(clamp(age) * Math.PI) * .2, .65);
        word.material.rotation = side * (.04 + .07 * Math.sin(age * 5));
      }
      for (let i = 0; i < fries.length; i++) {
        const age = (t - .75 - i * .045) / 1.1; const fry = fries[i]!;
        fry.visible = age >= 0 && age < 1;
        const side = i % 2 ? -1 : 1;
        fry.position.set(side * (.95 + age * (1.5 + i % 3 * .5)), 1.5 + Math.sin(age * Math.PI) * (1 + i % 4 * .2), .1 + age * .4);
        fry.rotation.set(age * 8 + i, age * 5, i + age * 9);
        fry.scale.setScalar((1 - ease((age - .75) / .25)) * (1 + i % 3 * .2));
      }
      for (let i = 0; i < 96; i++) {
        const age = (t - .9 - Math.floor(i / 32) * .22) / .65;
        const angle = i * 2.39996;
        burst.positions.setXYZ(i, Math.cos(angle) * age * 2.7, 1.9 + Math.sin(angle) * age * .85, .45);
        burst.sizes.setX(i, .035 + i % 3 * .012);
        burst.alphas.setX(i, age >= 0 && age < 1 ? (1 - age) * .8 : 0);
      }
      commitCloud(burst);
    },
  };
}

function createSurge(kind: NpcKind) {
  const sam = kind === 'sam'; const color = sam ? CYAN : GREEN;
  const root = new THREE.Group();
  const core = sam ? crystal(root, GOLD, .55) : resetButton(root, .64);
  core.position.set(sam ? 0 : -.8, sam ? 1.25 : 1.45, .65);
  const orbits = Array.from({ length: 3 }, (_, i) => { const r = ring(root, i % 2 ? GOLD : color, .018); r.position.copy(core.position); return r; });
  const waves = Array.from({ length: 3 }, (_, i) => { const r = ring(root, i % 2 ? GOLD : color, .025, true); r.position.y = .08 + i * .045; return r; });
  const bars = Array.from({ length: 10 }, (_, i) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.32, .26, .09), glow(i % 3 ? GREEN : GOLD));
    bar.position.set((i - 4.5) * .36, 3.1, 0); root.add(bar); return bar;
  });
  const cloud = createParticleCloud(240, color); root.add(cloud.points);
  const title = caption(sam ? '算力' : 'QUOTA ENCORE', sam ? '#c7f8ff' : '#b6ffe2', sam ? 2.3 : 3.8, !sam);
  title.position.set(0, 3.75, .2); root.add(title);
  const word = sam ? null : caption('再来一轮！', GOLD, 2.3, false, true);
  if (word) { word.position.set(1.75, 1.35, 1); root.add(word); }
  return {
    root,
    sample(t: number) {
      const fade = envelope(t, .12, 2.95, .3); const charge = ease(t / 1.3);
      const release = clamp((t - 1.3) / 1.35);
      root.visible = fade > 0;
      core.scale.setScalar((.2 + charge * .95) * (1 - release) * fade);
      core.rotation.set(sam ? t * .8 : -.12, sam ? t : 0, sam ? -t * 1.7 : 0);
      core.position.z = .65 + release * 1.6;
      title.material.opacity = fade;
      if (word) word.material.opacity = envelope(t, 1.25, 2.55, .22);
      for (let i = 0; i < orbits.length; i++) {
        const r = orbits[i]!; r.rotation.set(i * Math.PI / 3 + t * .7, t * .8 + i, t);
        r.scale.setScalar((.35 + charge * .4 + release * 2) * fade);
        r.material.opacity = fade * (1 - release);
      }
      for (let i = 0; i < waves.length; i++) {
        const age = (t - 1.3 - i * .15) / 1.25; const r = waves[i]!;
        r.visible = age >= 0 && age < 1; r.scale.setScalar(.3 + clamp(age) * 3);
        r.material.opacity = (1 - clamp(age)) ** 1.5;
      }
      for (let i = 0; i < bars.length; i++) {
        const bar = bars[i]!; bar.visible = !sam;
        bar.scale.y = .2 + ease((t - 1.26 - i * .055) / .18) * .8;
        bar.material.opacity = fade * (.15 + ease((t - 1.26 - i * .055) / .18) * .85);
      }
      for (let i = 0; i < 240; i++) {
        const seed = (i * .618034) % 1; const angle = i * 2.39996 + t * (sam ? 2 : -2);
        const radius = t < 1.3 ? (1 - charge) * 2.4 + .15 + seed * .28 : .2 + release * (1 + seed * 2.7);
        cloud.positions.setXYZ(i, Math.cos(angle) * radius, t < 1.3 ? 1.8 + Math.sin(angle * 1.7) * radius * .5 : .2 + Math.sin(seed * Math.PI) * (1 - release) * 2, Math.sin(angle) * radius);
        cloud.sizes.setX(i, .035 + seed * .055);
        cloud.alphas.setX(i, fade * (t < 1.3 ? charge : 1 - release) * .9);
      }
      commitCloud(cloud);
    },
  };
}

function createColumn(color: string) {
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 }, strength: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: /* glsl */`
      uniform vec3 color; uniform float time; uniform float strength; varying vec2 vUv;
      void main(){
        float rays=pow(0.5+0.5*sin(vUv.x*75.398+time*2.0),18.0);
        float flow=0.65+0.35*sin(vUv.y*35.0-time*9.0);
        float fade=smoothstep(0.0,0.05,vUv.y)*(1.0-smoothstep(0.75,1.0,vUv.y));
        float alpha=(0.04+rays*0.12)*flow*fade*strength;
        gl_FragColor=vec4(mix(color,vec3(1.8),rays*0.6),alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false, blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.85, 1.3, 6.4, 64, 1, true), material);
  beam.position.y = 3.2;
  return beam;
}

function createArrival(kind: NpcKind) {
  const sam = kind === 'sam'; const color = sam ? CYAN : GREEN;
  const root = new THREE.Group();
  const crown = new THREE.Group(); crown.position.set(0, 4.4, -.4); root.add(crown);
  const emblem = sam ? crystal(crown, GOLD, 1.06) : resetButton(crown, 1.06);
  const halo = Array.from({ length: 3 }, (_, i) => { const r = ring(crown, i === 1 ? GOLD : color, .018 + i * .009); r.scale.setScalar(1.1 + i * .32); return r; });
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(.025, .15, .04), glow(color), 48);
  const pose = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * TAU; pose.position.set(Math.cos(a) * 1.77, Math.sin(a) * 1.77, 0);
    pose.rotation.z = a - Math.PI / 2; pose.scale.set(1, i % 4 === 0 ? 1.7 : 1, 1); pose.updateMatrix(); ticks.setMatrixAt(i, pose.matrix);
  }
  crown.add(ticks);
  const networkPoints: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU; const b = (i + (sam ? 4 : 1)) / 12 * TAU;
    networkPoints.push(Math.cos(a) * 2.8, .04, Math.sin(a) * 2.8, Math.cos(b) * 2.8, .04, Math.sin(b) * 2.8);
    networkPoints.push(0, .04, 0, Math.cos(a) * 2.8, .04, Math.sin(a) * 2.8);
  }
  const networkGeometry = new THREE.BufferGeometry(); networkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(networkPoints, 3));
  const network = new THREE.LineSegments(networkGeometry, new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false })); root.add(network);
  const ground = Array.from({ length: 3 }, (_, i) => { const r = ring(root, i === 1 ? GOLD : color, .022, true); r.position.y = .05 + i * .015; return r; });
  const waves = Array.from({ length: 4 }, (_, i) => { const r = ring(root, i % 2 ? GOLD : color, .04, true); r.position.y = .1 + i * .09; return r; });
  const wash = new THREE.Mesh(new THREE.RingGeometry(.83, 1, 96), glow(color, .25));
  wash.rotation.x = -Math.PI / 2; wash.position.y = .07; root.add(wash);
  const beam = createColumn(color); root.add(beam);
  const ribbons = Array.from({ length: 3 }, (_, i) => {
    const r = energyRibbon(root, i === 1 ? GOLD : color, 1.2 + i * .23, 2.4, .8);
    r.position.set(0, 3, -.4); r.rotation.y = i / 3 * TAU; return r;
  });
  const fragments = Array.from({ length: 18 }, (_, i) => {
    if (sam) return crystal(root, i % 2 ? GOLD : color, .09 + i % 3 * .03);
    const battery = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const segment = new THREE.Mesh(new THREE.BoxGeometry(.16, .065, .05), glow(j === 4 ? GOLD : GREEN));
      segment.position.y = j * .09; battery.add(segment);
    }
    const border = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.22, .51, .06)), new THREE.LineBasicMaterial({ color: GOLD, transparent: true, depthWrite: false, toneMapped: false }));
    border.position.y = .18; battery.add(border); root.add(battery); return battery;
  });
  const energy = createParticleCloud(600, color); root.add(energy.points);
  const embers = createParticleCloud(180, GOLD); root.add(embers.points);
  const title = caption(sam ? 'AGI · 降临' : '重置 · 降临', sam ? '#fff0c4' : '#beffdb', 5.3); title.position.set(0, 5.95, .6); root.add(title);
  const subtitle = caption(sam ? 'AGI. ONLINE.' : 'RESET. REFILL. GO!', '#f4ffff', 4.9, true); subtitle.position.set(0, 5.35, .8); root.add(subtitle);
  const cheers = (sam ? ['INTELLIGENCE', 'CONNECTED', 'BEYOND LIMITS'] : ['FULL AGAIN!', 'LET’S GO!', '再来一轮！']).map(text => caption(text, sam ? '#b9f6ff' : '#ffda8e', 2.15, sam, !sam));
  root.add(...cheers);
  return {
    root,
    sample(t: number) {
      const charge = ease((t - .3) / 2.3); const fade = 1 - ease((t - 4.9) / .85);
      const arrival = ease((t - 2.65) / .22); const after = clamp((t - 2.8) / 2.1);
      root.visible = t > .12 && t < 5.8;
      const formation = ease((t - .35) / 1.3) * fade;
      crown.scale.setScalar((.4 + charge * .6 + Math.sin(t * 2) * .015) * formation);
      crown.position.y = 5.1 - arrival * 1.1;
      emblem.rotation.set(sam ? t * .4 : -.18, sam ? t * .6 : 0, sam ? -t * .2 : -t * .12);
      ticks.rotation.z = t * (sam ? .15 : -.7); ticks.material.opacity = formation;
      for (let i = 0; i < halo.length; i++) {
        const r = halo[i]!; r.rotation.set(sam ? .6 + i * .75 : i * .08, sam ? t * .25 + i : 0, t * (i % 2 ? .4 : -.3));
        r.material.opacity = formation * .9;
      }
      network.rotation.y = t * (sam ? .1 : -.15); network.material.opacity = formation * .85;
      network.scale.setScalar(.6 + charge * .4);
      for (let i = 0; i < ground.length; i++) {
        const r = ground[i]!; r.scale.setScalar((1.2 + i * .8) * formation); r.material.opacity = formation * (.45 + i * .2);
      }
      for (let i = 0; i < waves.length; i++) {
        const age = (t - 2.8 - i * .23) / 1.45; const r = waves[i]!;
        r.visible = age >= 0 && age < 1; r.scale.setScalar(.35 + ease(age) * 4.1); r.material.opacity = (1 - clamp(age)) ** 1.4;
      }
      wash.visible = t > 2.8 && t < 4.5; wash.scale.setScalar(.35 + ease((t - 2.8) / 1.7) * 4.1);
      wash.material.opacity = .28 * (1 - clamp((t - 2.8) / 1.7));
      beam.scale.set(1 + after * .7, arrival * fade, 1 + after * .7);
      beam.material.uniforms.time!.value = t; beam.material.uniforms.strength!.value = arrival * fade;
      for (let i = 0; i < ribbons.length; i++) {
        const r = ribbons[i]!; r.rotation.y = i / 3 * TAU + t * (sam ? .55 : -.8);
        r.scale.setScalar(.7 + charge * .3); r.material.opacity = formation * .65;
      }
      for (let i = 0; i < fragments.length; i++) {
        const f = fragments[i]!; const a = i * 2.39996 + t * .12; const radius = 2 + i % 4 * .32;
        const y = sam ? 5 - ((i / 18 * 5 + t * .7) % 4.8) : .2 + ((i / 18 * 4.7 + t * .85) % 4.8);
        f.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius - .4);
        f.rotation.set(sam ? t * .4 : 0, sam ? t + i : 0, sam ? i + t * .2 : Math.sin(t + i) * .08);
        f.scale.setScalar(formation * ease(y / .45) * (1 - ease((y - 4.5) / .5)));
      }
      title.material.opacity = envelope(t, 2.58, 5.65, .24); subtitle.material.opacity = envelope(t, 2.94, 5.4, .35);
      for (let i = 0; i < cheers.length; i++) {
        const word = cheers[i]!; const age = t - 3.05 - i * .24;
        word.material.opacity = envelope(age, 0, 1.7, .24);
        word.position.set((i === 1 ? 1 : -1) * (2 + i * .16), 1.7 + i * .75 + ease(age) * .45, .9);
        word.material.rotation = (i - 1) * .07;
      }
      for (let i = 0; i < 600; i++) {
        const seed = (i * .618034) % 1; const angle = i * 2.39996 + t * (sam ? 1 : -1.4);
        const orbit = .55 + seed * 2.5;
        const y = t < 2.8 ? .15 + ((i / 600 + t * .22) % 1) * 4.8 : .2 + ((seed - (t - 2.8) * .65 + 5) % 1) * 5.5;
        const radius = t < 2.8 ? orbit * (1 - charge * .55) : orbit * (.7 + after * .75);
        energy.positions.setXYZ(i, Math.cos(angle) * radius, y, Math.sin(angle) * radius - .25);
        energy.sizes.setX(i, .03 + seed * .085);
        energy.alphas.setX(i, formation * (.2 + Math.sin(seed * Math.PI) * .65));
      }
      for (let i = 0; i < 180; i++) {
        const age = clamp((t - 2.8) / 1.35); const angle = i * 2.39996; const seed = (i * .381966) % 1;
        const radius = age * (2 + seed * 3);
        embers.positions.setXYZ(i, Math.cos(angle) * radius, .25 + Math.sin(age * Math.PI) * (1.5 + seed * 2), Math.sin(angle) * radius);
        embers.sizes.setX(i, .06 + seed * .08); embers.alphas.setX(i, t >= 2.8 ? (1 - age) ** 1.5 : 0);
      }
      commitCloud(energy); commitCloud(embers);
    },
  };
}

/** 游戏与预览都从同一绝对时间采样，切换动作立即移除旧特效。 */
export function createNpcEffects(kind: NpcKind) {
  const root = new THREE.Group(); root.name = `${kind}-skill-effects`;
  const first = kind === 'sam' ? createModelRouting() : createFriesAttack();
  const second = createSurge(kind); const ultimate = createArrival(kind);
  const light = new THREE.PointLight(kind === 'sam' ? CYAN : GREEN, 0, 9, 2); light.position.set(0, 2.4, 1.1);
  const dust = createParticleCloud(64, kind === 'sam' ? '#c4efff' : '#fff1c8');
  root.add(first.root, second.root, ultimate.root, light, dust.points);
  let shake = 0, darken = 0;
  return {
    root,
    get shake() { return shake; },
    get darken() { return darken; },
    sample(action: NpcAction, seconds: number) {
      const definition = npcAction(kind, action); const t = seconds;
      const active = t > 0 && t < definition.seconds;
      first.root.visible = action === 'skill1' && active;
      second.root.visible = action === 'skill2' && active;
      ultimate.root.visible = action === 'ultimate' && active;
      if (first.root.visible) first.sample(t);
      if (second.root.visible) second.sample(t);
      if (ultimate.root.visible) ultimate.sample(t);
      shake = 0; darken = 0; light.intensity = 0;
      if (active && definition.release > 0) {
        const big = action === 'ultimate'; const impact = t - definition.release;
        darken = envelope(t, .08, definition.seconds - .1, big ? 1 : .35) * (big ? .88 : .4);
        shake = impact > 0 ? Math.exp(-impact * (big ? 3.5 : 8)) * (big ? .1 : .035) : 0;
        light.intensity = envelope(t, .15, definition.seconds - .2, .4) * (big ? 5 : 2) + shake * 15;
      }
      dust.points.visible = action === 'run' || action === 'jump';
      if (dust.points.visible) {
        for (let i = 0; i < 64; i++) {
          const seed = (i * .618034) % 1;
          const age = action === 'run' ? (t / .4 + seed) % 1 : (t - 1.17 - seed * .035) / .35;
          const angle = i * 2.39996; const a = clamp(age);
          dust.positions.setXYZ(i, Math.cos(angle) * a * .9, .035 + Math.sin(a * Math.PI) * .22, Math.sin(angle) * a * .55);
          dust.sizes.setX(i, .06 + seed * .09);
          dust.alphas.setX(i, age >= 0 && age < 1 ? (1 - a) ** 2 * .35 : 0);
        }
        commitCloud(dust);
      }
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      root.traverse(node => {
        if (node instanceof THREE.InstancedMesh) node.dispose();
        if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points || node instanceof THREE.Sprite) {
          if (!(node instanceof THREE.Sprite)) geometries.add(node.geometry);
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
        }
      });
      for (const material of materials) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        material.dispose();
      }
      for (const geometry of geometries) geometry.dispose();
      for (const texture of textures) texture.dispose();
      root.removeFromParent(); root.clear();
    },
  };
}

export type NpcEffects = ReturnType<typeof createNpcEffects>;
