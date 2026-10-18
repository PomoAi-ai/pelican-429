import * as THREE from 'three';

/** 与单向平台、家具共用玩家轮廓模板，不改变角色与墙体的深度关系。 */
export function protectPlayer(root: THREE.Object3D): void {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.stencilWrite = true;
      material.stencilRef = 1;
      material.stencilZPass = THREE.ReplaceStencilOp;
    }
  });
}

/** 连同透明能量和喷气一起后绘制，避开角色的实际可见像素。 */
export function avoidPlayer(root: THREE.Object3D): void {
  root.traverse(object => {
    object.renderOrder = 3;
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Sprite || object instanceof THREE.Line)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.transparent = true;
      material.stencilWrite = true;
      material.stencilRef = 1;
      material.stencilFunc = THREE.NotEqualStencilFunc;
      material.stencilWriteMask = 0;
    }
  });
}
