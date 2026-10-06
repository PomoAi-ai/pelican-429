import * as THREE from 'three';
import { TUNING } from '../config/tuning.ts';
import { lerp } from '../core/math.ts';
import { createGlowTexture } from './orb-view.ts';
import type { EntityViewFactory } from './view-registry.ts';

/** 下落、爆炸和火区读取同一投射物状态，展示场与实战共用。 */
export function createDronePayloadViews() {
  const shellGeometry = new THREE.CylinderGeometry(.13, .17, .4, 10);
  const bandGeometry = new THREE.TorusGeometry(.155, .025, 6, 12);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const plane = new THREE.PlaneGeometry(1, 1);
  const sparkGeometry = new THREE.BoxGeometry(1, 1, 1);
  const glowTexture = createGlowTexture();
  const ringGeometry = new THREE.RingGeometry(.84, 1, 40);
  const shellMaterial = new THREE.MeshStandardMaterial({ color: '#303d4c', metalness: .45, roughness: .45 });
  const bandMaterial = new THREE.MeshBasicMaterial({ color: '#ffbd48', toneMapped: false });
  const moltenMaterial = new THREE.MeshBasicMaterial({ color: '#ff791f', toneMapped: false });
  const coreMaterial = new THREE.MeshBasicMaterial({ color: '#fff5c9', side: THREE.DoubleSide, toneMapped: false });
  const factory: EntityViewFactory = (entity) => {
    const thermite = entity.kind === 'droneThermite';
    const ground = entity.projectile!.def.groundEffect!;
    const root = new THREE.Group();
    root.name = `drone-payload-${entity.id}`;
    const falling = new THREE.Group();
    falling.add(new THREE.Mesh(shellGeometry, shellMaterial));
    for (const y of [-.12, .12]) {
      const band = new THREE.Mesh(bandGeometry, thermite ? coreMaterial : bandMaterial);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      falling.add(band);
    }
    const effect = new THREE.Group();
    const glowMaterial = new THREE.MeshBasicMaterial({ color: thermite ? '#ff963b' : '#ffd78a', map: thermite ? glowTexture : null, blending: thermite ? THREE.AdditiveBlending : THREE.NormalBlending, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const glow = new THREE.Mesh(thermite ? plane : sphere, glowMaterial);
    const ring = new THREE.Mesh(ringGeometry, glowMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .04;
    ring.visible = !thermite;
    effect.add(glow, ring);
    const smokeMaterial = thermite ? new THREE.MeshBasicMaterial({ color: '#9e9390', map: glowTexture, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }) : null;
    const heat = thermite ? {
      edges: new THREE.InstancedMesh(sphere, moltenMaterial, 23),
      cores: new THREE.InstancedMesh(sphere, coreMaterial, 23),
      sparks: new THREE.InstancedMesh(sparkGeometry, coreMaterial, 36),
      smoke: new THREE.InstancedMesh(plane, smokeMaterial!, 7),
    } : null;
    const particle = new THREE.Object3D();
    if (heat) {
      for (const instances of Object.values(heat)) {
        instances.frustumCulled = false;
        instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        effect.add(instances);
      }
      const color = new THREE.Color();
      for (let i = 0; i < heat.sparks.count; i++) heat.sparks.setColorAt(i, color.set(i % 4 === 0 ? '#ff9d27' : '#fff5c9'));
    }
    const sparks = Array.from({ length: thermite ? 0 : 18 }, () => {
      const spark = new THREE.Mesh(sphere, coreMaterial);
      spark.scale.set(.023, .09, .023);
      effect.add(spark);
      return spark;
    });
    root.add(falling, effect);
    return {
      object: root,
      sync(e, alpha) {
        const projectile = e.projectile!;
        const landed = projectile.impactTicks !== null;
        root.position.set(lerp(e.body.prevX, e.body.x, alpha), landed ? e.body.y : lerp(e.body.prevY, e.body.y, alpha) + e.body.height / 2, .3);
        falling.visible = !landed;
        effect.visible = landed;
        if (!landed) return;
        const age = (projectile.impactTicks! + alpha) * TUNING.sim.step;
        const progress = Math.min(1, (projectile.impactTicks! + alpha) / ground.durationTicks);
        const fade = thermite ? Math.min(1, (1 - progress) * 6) : 1 - progress;
        glowMaterial.opacity = fade * .5;
        if (heat) {
          const pulse = Math.exp(-((projectile.impactTicks! + alpha) % ground.pulseTicks) / 5);
          glowMaterial.opacity = fade * (.65 + pulse * .25);
          glow.position.set(0, ground.height * .12, -.08);
          glow.scale.set(ground.halfWidth * 2, ground.height * .6, 1);
          // 低矮热斑相互覆盖成不规则熔融边缘，不把危险区画成一排等高火焰。
          for (let i = 0; i < heat.edges.count; i++) {
            const jitter = Math.sin(i * 12.73);
            const flicker = .8 + .2 * Math.sin(age * 17 + i * 2.7);
            const width = ground.halfWidth * (.065 + .035 * (jitter + 1));
            const height = ground.height * (.025 + .022 * (Math.cos(i * 4.3) + 1)) * flicker * fade;
            particle.position.set(((i + .5) / heat.edges.count * 2 - 1) * (ground.halfWidth - width), height, jitter * .075);
            particle.rotation.set(0, jitter, 0);
            particle.scale.set(width, height, .055 + width * .25);
            particle.updateMatrix();
            heat.edges.setMatrixAt(i, particle.matrix);
            particle.position.y += height * .35;
            particle.position.z += particle.scale.z * .82;
            particle.scale.multiplyScalar((.45 + pulse * .2) * flicker);
            particle.updateMatrix();
            heat.cores.setMatrixAt(i, particle.matrix);
          }
          for (let i = 0; i < heat.sparks.count; i++) {
            const phase = (age * (1.4 + i % 3 * .23) + i * .173) % 1;
            const spread = ((i * .61803398875) % 1) * 2 - 1;
            const jump = ground.height * (.2 + .65 * ((i * .37) % 1));
            particle.position.set(spread * ground.halfWidth * (.7 + phase * .2), ground.height * .025 + Math.sin(phase * Math.PI) * jump, .13 + i % 3 * .018);
            particle.rotation.set(0, 0, -spread * (.2 + phase));
            particle.scale.set(.011 * fade, (.025 + .05 * (1 - phase)) * fade, .012 * fade);
            particle.updateMatrix();
            heat.sparks.setMatrixAt(i, particle.matrix);
          }
          smokeMaterial!.opacity = fade * .16;
          for (let i = 0; i < heat.smoke.count; i++) {
            const phase = (age * .4 + i * .147) % 1;
            const size = Math.sin(phase * Math.PI);
            particle.position.set(Math.sin(i * 3.7 + phase * .6) * ground.halfWidth * .65, ground.height * (.12 + phase * .56), -.12);
            particle.rotation.set(0, 0, Math.sin(i * 2.3 + phase) * .4);
            particle.scale.set(ground.halfWidth * .5 * size, ground.height * (.22 + phase * .3) * size, 1);
            particle.updateMatrix();
            heat.smoke.setMatrixAt(i, particle.matrix);
          }
          for (const instances of Object.values(heat)) instances.instanceMatrix.needsUpdate = true;
        } else {
          glow.position.y = ground.height * .4;
          glow.scale.set(ground.halfWidth * (.4 + progress), ground.height * .6 * (1 - progress * .5), .5);
          ring.scale.setScalar(ground.halfWidth * (.4 + progress));
        }
        sparks.forEach((spark, i) => {
          const phase = progress;
          const spread = (i / 17 * 2 - 1) * ground.halfWidth;
          spark.position.set(spread * phase, .1 + Math.sin(phase * Math.PI) * 1.2, .1 + (i % 3) * .05);
          spark.scale.y = (1 - phase) * .1 * fade;
        });
      },
      dispose() {
        if (heat) for (const instances of Object.values(heat)) instances.dispose();
        smokeMaterial?.dispose();
        glowMaterial.dispose();
        root.removeFromParent();
        root.clear();
      },
    };
  };
  return {
    factories: { droneBomb: factory, droneThermite: factory },
    dispose() {
      for (const geometry of [shellGeometry, bandGeometry, sphere, plane, sparkGeometry, ringGeometry]) geometry.dispose();
      for (const material of [shellMaterial, bandMaterial, moltenMaterial, coreMaterial]) material.dispose();
      glowTexture.dispose();
    },
  };
}
