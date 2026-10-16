import * as THREE from 'three';
import { injectAfter } from '../tile-material.ts';

const PARAMETERS = `
  attribute float _d1_fiber_radius;
  attribute float _d1_fiber_side;
`;
const CENTER = `
  transformed -= normal * _d1_fiber_radius;
`;
const EXPAND = `
  if ( _d1_fiber_radius > 0.0 && _d1_fiber_side != 0.0 ) {
    vec3 d1RibbonFlow = d1HairFlow;
    vec3 d1RibbonRadial = normal;
    #ifdef USE_SKINNING
      mat4 d1RibbonSkin = bindMatrixInverse * (
        skinWeight.x * boneMatX + skinWeight.y * boneMatY +
        skinWeight.z * boneMatZ + skinWeight.w * boneMatW
      ) * bindMatrix;
      d1RibbonFlow = ( d1RibbonSkin * vec4( d1RibbonFlow, 0.0 ) ).xyz;
      d1RibbonRadial = ( d1RibbonSkin * vec4( d1RibbonRadial, 0.0 ) ).xyz;
    #endif
    mat3 d1RibbonView = mat3( modelViewMatrix );
    vec3 d1RibbonTangent = normalize( d1RibbonView * d1RibbonFlow );
    vec3 d1RibbonCenter = ( modelViewMatrix * vec4( transformed, 1.0 ) ).xyz;
    vec3 d1RibbonCamera = isOrthographic ? vec3( 0.0, 0.0, 1.0 ) : normalize( -d1RibbonCenter );
    vec3 d1RibbonSide = cross( d1RibbonTangent, d1RibbonCamera );
    // An end-on fiber has no projected tangent; use a stable perpendicular at that singularity.
    if ( dot( d1RibbonSide, d1RibbonSide ) < 1e-10 ) {
      d1RibbonSide = cross( d1RibbonTangent, abs( d1RibbonTangent.y ) < 0.9 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 ) );
    }
    d1RibbonSide = normalize( d1RibbonSide );
    float d1RibbonRadius = _d1_fiber_radius * length( d1RibbonView * d1RibbonRadial );
    transformed += inverse( d1RibbonView ) * ( d1RibbonSide * d1RibbonRadius * _d1_fiber_side );
    D1_RIBBON_NORMAL
  }
`;
const SURFACE_NORMAL = `
  #ifndef FLAT_SHADED
    vec3 d1RibbonFacing = normalize( cross( d1RibbonSide, d1RibbonTangent ) );
    vNormal = normalize( d1RibbonFacing * 0.6 + d1RibbonSide * _d1_fiber_side * 0.8 );
    #ifdef FLIP_SIDED
      vNormal = -vNormal;
    #endif
  #endif
`;

/** Only exported fiber ribbons opt in; existing solid hair and its outlines are untouched. */
export function installD1FiberRibbons(root: THREE.Object3D) {
  const fibers: Array<{ mesh: THREE.SkinnedMesh; depth: THREE.Material | undefined; ownedDepth: THREE.MeshDepthMaterial }> = [];
  const hulls: Array<{ mesh: THREE.Mesh; visible: boolean }> = [];
  const patches = new Map<THREE.Material, {
    compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey']; side: THREE.Side;
  }>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.parent instanceof THREE.SkinnedMesh && node.geometry === node.parent.geometry) return;
    if (node.userData.d1FiberRibbons !== true) return;
    if (!(node instanceof THREE.SkinnedMesh)) throw new Error(`${node.name}: fiber ribbons require a skinned Hair mesh`);
    const geometry = node.geometry, position = geometry.getAttribute('position');
    if (!position || position.itemSize !== 3 || position.count === 0) throw new Error(`${node.name}: fiber ribbons lack positions`);
    for (const [name, size] of [['normal', 3], ['d1HairFlow', 3], ['_d1_fiber_radius', 1], ['_d1_fiber_side', 1]] as const) {
      const attribute = geometry.getAttribute(name);
      if (!attribute || attribute.itemSize !== size || attribute.count !== position.count) {
        throw new Error(`${node.name}: fiber ribbons have invalid ${name}`);
      }
    }
    const radius = geometry.getAttribute('_d1_fiber_radius'), side = geometry.getAttribute('_d1_fiber_side');
    for (let i = 0; i < position.count; i++) {
      const r = radius.getX(i), s = side.getX(i);
      if (!Number.isFinite(r) || r < 0 || (s !== -1 && s !== 0 && s !== 1) || (s === 0 && r !== 0)) {
        throw new Error(`${node.name}: invalid fiber radius/side at vertex ${i}`);
      }
    }
    for (const child of node.children) {
      if (child instanceof THREE.Mesh && child.geometry === geometry) hulls.push({ mesh: child, visible: child.visible });
    }
    fibers.push({ mesh: node, depth: node.customDepthMaterial, ownedDepth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }) });
  });

  const patchMaterial = (material: THREE.Material): void => {
    if (patches.has(material)) return;
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
    patches.set(material, { compile, key, side: material.side });
    material.onBeforeCompile = function (shader, renderer) {
      compile.call(this, shader, renderer);
      const flow = /\battribute\s+vec3\s+d1HairFlow\b/.test(shader.vertexShader) ? '' : 'attribute vec3 d1HairFlow;';
      const normal = shader.vertexShader.includes('#include <normal_vertex>') ? SURFACE_NORMAL : '';
      shader.vertexShader = injectAfter(shader.vertexShader, 'common', PARAMETERS + flow, material.name);
      shader.vertexShader = injectAfter(shader.vertexShader, 'begin_vertex', CENTER, material.name);
      shader.vertexShader = injectAfter(shader.vertexShader, 'skinning_vertex', EXPAND.replace('D1_RIBBON_NORMAL', normal), material.name);
    };
    material.customProgramCacheKey = function () {
      const original = key === THREE.Material.prototype.customProgramCacheKey ? compile.toString() : key.call(this);
      return `${original}|d1-camera-fiber-ribbons-1`;
    };
    material.side = THREE.DoubleSide;
    material.needsUpdate = true;
  };
  const patchCurrentMaterials = (): void => {
    for (const { mesh, ownedDepth } of fibers) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) patchMaterial(material);
      patchMaterial(ownedDepth);
      mesh.customDepthMaterial = ownedDepth;
    }
    for (const { mesh } of hulls) mesh.visible = false;
  };
  patchCurrentMaterials();
  return {
    patchCurrentMaterials,
    dispose() {
      for (const [material, { compile, key, side }] of patches) {
        material.onBeforeCompile = compile;
        material.customProgramCacheKey = key;
        material.side = side;
        material.needsUpdate = true;
      }
      for (const { mesh, depth, ownedDepth } of fibers) {
        mesh.customDepthMaterial = depth;
        ownedDepth.dispose();
      }
      for (const { mesh, visible } of hulls) mesh.visible = visible;
      patches.clear();
    },
  };
}
