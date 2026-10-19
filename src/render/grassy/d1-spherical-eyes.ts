import * as THREE from 'three';
import { injectAfter } from '../tile/tile-material.ts';

export const D1_SPHERICAL_EYE_MATERIAL = 'D1 spherical eye';
export const D1_EYELID_MATERIAL = 'D1 eyelid';
export const D1_EYELASH_MATERIAL = 'D1 eyelash';
export const D1_EYE_SOCKET_MATERIAL = 'D1 eye socket skin';

export function isD1SphericalEyeSurface(material: THREE.Material): boolean {
  return material.name === D1_SPHERICAL_EYE_MATERIAL || material.name === D1_EYELASH_MATERIAL;
}

/** 虹膜固定在球面局部方向上，眼球整体旋转；相机方向不参与虹膜位置计算。 */
export function createD1SphericalEyeMaterial(source: THREE.MeshStandardMaterial): THREE.Material {
  if (source.name === D1_EYELASH_MATERIAL) return new THREE.MeshBasicMaterial({ name: source.name, color: source.color, side: THREE.DoubleSide });
  const material = new THREE.MeshStandardMaterial({ name: source.name, color: '#fffaf4', roughness: .35, metalness: 0 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = injectAfter(shader.vertexShader, 'common', 'varying vec3 vD1SphereDirection;', material.name);
    shader.vertexShader = injectAfter(shader.vertexShader, 'begin_vertex', 'vD1SphereDirection = normalize( position );', material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', 'varying vec3 vD1SphereDirection;', material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'color_fragment', `
      vec3 eyeDirection = normalize( vD1SphereDirection );
      vec2 irisUv = eyeDirection.xy / vec2( 0.49, 0.62 );
      float irisRadius = length( irisUv );
      float irisEdge = fwidth( irisRadius );
      vec3 irisColor = mix( vec3( 0.001, 0.72, 0.90 ), vec3( 0.003, 0.08, 0.25 ), smoothstep( -0.65, 0.45, irisUv.y ) );
      irisColor = mix( irisColor, vec3( 0.001, 0.006, 0.035 ), smoothstep( -0.15, 0.55, irisUv.y ) );
      irisColor *= 1.0 + 0.07 * sin( atan( irisUv.y, irisUv.x ) * 47.0 ) * smoothstep( 0.5, 0.65, irisRadius ) * ( 1.0 - smoothstep( 0.8, 0.95, irisRadius ) );
      irisColor = mix( irisColor, vec3( 0.0005, 0.003, 0.016 ), smoothstep( 0.86, 1.0, irisRadius ) );
      float pupilRadius = length( irisUv / vec2( 0.43, 0.45 ) );
      float pupilEdge = fwidth( pupilRadius );
      irisColor = mix( irisColor, vec3( 0.0002, 0.0005, 0.003 ), 1.0 - smoothstep( 1.0 - pupilEdge, 1.0 + pupilEdge, pupilRadius ) );
      irisColor = mix( irisColor, vec3( 1.0 ), 1.0 - smoothstep( 0.115 - irisEdge, 0.115 + irisEdge, length( irisUv - vec2( -0.5, 0.48 ) ) ) );
      irisColor = mix( irisColor, vec3( 0.93, 0.97, 1.0 ), 1.0 - smoothstep( 0.085 - irisEdge, 0.085 + irisEdge, length( irisUv - vec2( 0.48, 0.53 ) ) ) );
      irisColor = mix( irisColor, vec3( 0.68, 1.0, 1.0 ), 1.0 - smoothstep( 0.035 - irisEdge, 0.035 + irisEdge, length( irisUv - vec2( 0.48, -0.53 ) ) ) );
      float iris = ( 1.0 - smoothstep( 1.0 - irisEdge, 1.0 + irisEdge, irisRadius ) ) * step( 0.0, eyeDirection.z );
      diffuseColor.rgb = mix( diffuseColor.rgb, irisColor, iris );
    `, material.name);
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'lights_fragment_end', `
      float eyeAlbedo = max( dot( material.diffuseColor, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.001 );
      float eyeLight = dot( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3( 0.2126, 0.7152, 0.0722 ) ) / eyeAlbedo;
      reflectedLight.directDiffuse = material.diffuseColor * mix( 0.74, 1.06, smoothstep( 0.0, 1.6, eyeLight ) );
      reflectedLight.indirectDiffuse = vec3( 0.0 );
      reflectedLight.directSpecular *= 0.15;
    `, material.name);
  };
  material.customProgramCacheKey = () => 'd1-spherical-eye';
  return material;
}

/** 独立眼资源只替换实例的脸皮几何；球与眼睑沿原 head 骨骼运动。 */
export function installD1SphericalEyes(model: THREE.Object3D, asset: THREE.Object3D) {
  const faceCandidates: THREE.SkinnedMesh[] = [];
  const oldEyes: THREE.Mesh[] = [];
  model.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (Array.isArray(node.material)) return;
    if (node instanceof THREE.SkinnedMesh && node.material.name === 'model') faceCandidates.push(node);
    if (node.material.name === 'D1 eye') oldEyes.push(node);
  });
  if (faceCandidates.length !== 1 || oldEyes.length !== 1) throw new Error('D1 球眼需要一个原 Head 皮面和一个眼片图元');
  const face = faceCandidates[0]!;
  const headIndex = face.skeleton.bones.findIndex(bone => bone.name === 'head');
  if (headIndex < 0) throw new Error('D1 球眼缺少原 head 骨骼');
  const head = face.skeleton.bones[headIndex]!;
  const requireMesh = (name: string): THREE.Mesh => {
    const mesh = asset.getObjectByName(name);
    if (!(mesh instanceof THREE.Mesh) || Array.isArray(mesh.material)) throw new Error(`D1 球眼资源缺少单材质网格：${name}`);
    return mesh;
  };
  const socket = requireMesh('D1EyeSocketHead');
  const sources = ['D1EyeballL', 'D1EyeballR', 'D1LidL', 'D1LidR', 'D1LashesL', 'D1LashesR'].map(requireMesh);
  const blinkNames = ['Blink25', 'Blink50', 'Blink75', 'Blink100'];
  for (const source of sources.slice(2)) {
    if (!source.morphTargetDictionary || blinkNames.some(name => source.morphTargetDictionary![name] === undefined)) {
      throw new Error(`D1 球眼资源 ${source.name} 缺少沿球面的四段眨眼形态`);
    }
  }
  const geometry = socket.geometry.clone();
  const count = geometry.getAttribute('position').count;
  const indices = new Uint16Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { indices[i * 4] = headIndex; weights[i * 4] = 1; }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  face.geometry = geometry;
  // 眼眶与眼睑共用作者法线，不能只把眼眶法线拉向整头球心。
  const faceMaterial = (face.material as THREE.MeshStandardMaterial).clone();
  faceMaterial.name = D1_EYE_SOCKET_MATERIAL;
  face.material = faceMaterial;
  for (const eye of oldEyes) eye.removeFromParent();
  model.updateMatrixWorld(true);
  const attachment = new THREE.Group();
  attachment.name = 'D1 spherical eyes';
  new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(face.matrixWorld).decompose(attachment.position, attachment.quaternion, attachment.scale);
  head.add(attachment);
  const ownedGeometry = [geometry];
  const ownedMaterials: THREE.Material[] = [faceMaterial];
  const meshes = sources.map(source => {
    const mesh = source.clone();
    mesh.geometry = source.geometry.clone();
    ownedGeometry.push(mesh.geometry);
    if (source.name.startsWith('D1Lid')) {
      const material = (face.material as THREE.MeshStandardMaterial).clone();
      material.name = D1_EYELID_MATERIAL;
      mesh.material = material;
      ownedMaterials.push(material);
    }
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    attachment.add(mesh);
    return mesh;
  });
  const balls = meshes.slice(0, 2).map(mesh => ({ mesh, rest: mesh.quaternion.clone(), neutralDirection: new THREE.Vector3() }));
  const lids = meshes.slice(2).map(mesh => ({ mesh, indices: blinkNames.map(name => mesh.morphTargetDictionary![name]!) }));
  const center = balls.reduce((sum, ball) => sum.add(ball.mesh.position), new THREE.Vector3()).multiplyScalar(1 / balls.length);
  const forward = new THREE.Vector3(0, 0, 1);
  const neutral = balls.reduce((sum, ball) => sum.add(forward.clone().applyQuaternion(ball.rest)), new THREE.Vector3()).normalize();
  const neutralTarget = neutral.clone().multiplyScalar(2).add(center);
  for (const ball of balls) ball.neutralDirection.subVectors(neutralTarget, ball.mesh.position).normalize();
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const angles = new THREE.Euler(0, 0, 0, 'YXZ');
  return {
    face,
    setPose(closure: number, gaze: THREE.Vector2) {
      rotation.setFromEuler(angles.set(-gaze.y, gaze.x, 0, 'YXZ'));
      // 共同目标只驱动相对中立姿态的变化，保留作者为倾斜眼窝校准的眼轴。
      target.copy(neutral).applyQuaternion(rotation).multiplyScalar(2).add(center);
      for (const ball of balls) {
        direction.subVectors(target, ball.mesh.position).normalize();
        ball.mesh.quaternion.setFromUnitVectors(ball.neutralDirection, direction).multiply(ball.rest);
      }
      // 只借用现有闭合形态轻微跟随下视；全闭形态始终保持原样。
      const frame = (closure + (1 - closure) * Math.max(0, -gaze.y) * .25) * 4;
      const lower = Math.min(3, Math.floor(frame));
      const blend = frame - lower;
      for (const lid of lids) {
        const influences = lid.mesh.morphTargetInfluences!;
        influences.fill(0);
        if (lower > 0) influences[lid.indices[lower - 1]!] = 1 - blend;
        influences[lid.indices[lower]!] = blend;
      }
    },
    dispose() {
      attachment.removeFromParent();
      for (const owned of ownedGeometry) owned.dispose();
      for (const owned of ownedMaterials) owned.dispose();
    },
  };
}
