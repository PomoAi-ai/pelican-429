import * as THREE from 'three';
import { TUNING } from '../config/tuning.ts';
import { lerp } from '../core/math.ts';
import type { EntityViewFactory } from './view-registry.ts';

/** 下落、爆炸和火区读取同一投射物状态，展示场与实战共用。 */
export function createDronePayloadViews() {
  const shellGeometry = new THREE.CylinderGeometry(.13, .17, .4, 10);
  const bandGeometry = new THREE.TorusGeometry(.155, .025, 6, 12);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const flameShape = new THREE.Shape();
  flameShape.moveTo(0, -.5);
  flameShape.bezierCurveTo(-.6, -.5, -.48, 0, -.06, .5);
  flameShape.bezierCurveTo(.1, .13, .18, .17, .23, .3);
  flameShape.bezierCurveTo(.7, -.1, .45, -.5, 0, -.5);
  const flameGeometry = new THREE.ShapeGeometry(flameShape, 10);
  const ringGeometry = new THREE.RingGeometry(.84, 1, 40);
  const shellMaterial = new THREE.MeshStandardMaterial({ color: '#303d4c', metalness: .45, roughness: .45 });
  const bandMaterial = new THREE.MeshBasicMaterial({ color: '#ffbd48', toneMapped: false });
  const flameMaterial = new THREE.MeshBasicMaterial({ color: '#ff781f', side: THREE.DoubleSide, toneMapped: false });
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
    const glowMaterial = new THREE.MeshBasicMaterial({ color: thermite ? '#ff963b' : '#ffd78a', transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const glow = new THREE.Mesh(sphere, glowMaterial);
    const ring = new THREE.Mesh(ringGeometry, glowMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .04;
    effect.add(glow, ring);
    const flames = Array.from({ length: thermite ? 11 : 0 }, (_, i) => {
      const flame = new THREE.Mesh(flameGeometry, flameMaterial);
      const core = new THREE.Mesh(flameGeometry, coreMaterial);
      core.scale.set(.45, .7, .45);
      core.position.set(0, -.12, .04);
      flame.add(core);
      flame.position.x = ((i + .5) / 11 * 2 - 1) * ground.halfWidth;
      effect.add(flame);
      return flame;
    });
    const sparks = Array.from({ length: 18 }, () => {
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
        glow.position.y = thermite ? .07 : ground.height * .4;
        glow.scale.set(ground.halfWidth * (thermite ? 1 : .4 + progress), thermite ? .12 : ground.height * .6 * (1 - progress * .5), thermite ? .35 : .5);
        ring.scale.setScalar(ground.halfWidth * (thermite ? 1 : .4 + progress));
        flames.forEach((flame, i) => {
          const height = (.4 + .2 * Math.sin(age * 19 + i * 2.7)) * fade;
          flame.scale.set(.28 + .05 * Math.cos(age * 13 + i), height, 1);
          flame.position.y = height / 2;
          flame.rotation.z = Math.sin(age * 9 + i) * .18;
        });
        sparks.forEach((spark, i) => {
          const phase = thermite ? (age * .85 + i * .173) % 1 : progress;
          const spread = (i / 17 * 2 - 1) * ground.halfWidth;
          spark.position.set(spread * (thermite ? .9 : phase), .1 + Math.sin(phase * Math.PI) * (thermite ? .75 : 1.2), .1 + (i % 3) * .05);
          spark.scale.y = (1 - phase) * .1 * fade;
        });
      },
      dispose() { glowMaterial.dispose(); root.removeFromParent(); root.clear(); },
    };
  };
  return {
    factories: { droneBomb: factory, droneThermite: factory },
    dispose() {
      for (const geometry of [shellGeometry, bandGeometry, sphere, flameGeometry, ringGeometry]) geometry.dispose();
      for (const material of [shellMaterial, bandMaterial, flameMaterial, coreMaterial]) material.dispose();
    },
  };
}
