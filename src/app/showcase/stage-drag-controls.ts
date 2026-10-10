import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { StageActor } from './stage-actor.ts';

/** 角色只沿地面移动；空白区域仍交给原有镜头操作。 */
export function createStageDragControls(canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera, content: THREE.Group,
  actors: ReadonlyMap<number, { actor: StageActor }>, cameraControls: OrbitControls, onStart: () => void, onSelect: (id: number) => void) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane();
  const point = new THREE.Vector3();
  let drag: { id: number; pointer: number; offsetX: number; cameraEnabled: boolean; x: number; y: number; moved: boolean } | null = null;
  const setRay = (event: MouseEvent): void => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    camera.updateMatrixWorld();
    content.updateWorldMatrix(true, true);
    raycaster.setFromCamera(pointer, camera);
  };
  const hitActor = (event: MouseEvent): number | undefined => {
    setRay(event);
    const hits = raycaster.intersectObjects([...actors.values()].map(({ actor }) => actor.root), true);
    for (const { object } of hits) {
      if (!(object instanceof THREE.Mesh)) continue;
      let visible = true;
      for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) visible = false;
      if (!visible) continue;
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        for (const [id, { actor }] of actors) if (node === actor.root) return id;
      }
    }
    return undefined;
  };
  const groundPoint = (): boolean => {
    plane.normal.set(0, 0, 1); plane.constant = 0;
    plane.applyMatrix4(content.matrixWorld);
    if (!raycaster.ray.intersectPlane(plane, point)) return false;
    content.worldToLocal(point);
    return true;
  };
  const cancel = (): void => {
    if (!drag) return;
    const previous = drag;
    drag = null;
    cameraControls.enabled = previous.cameraEnabled;
    canvas.style.cursor = '';
    if (canvas.hasPointerCapture(previous.pointer)) canvas.releasePointerCapture(previous.pointer);
  };
  const down = (event: PointerEvent): void => {
    if (drag || !event.isPrimary || event.button !== 0) return;
    const id = hitActor(event);
    if (id === undefined || !groundPoint()) return;
    drag = { id, pointer: event.pointerId, offsetX: actors.get(id)!.actor.root.position.x - point.x,
      cameraEnabled: cameraControls.enabled, x: event.clientX, y: event.clientY, moved: false };
    // 捕获阶段接管，防止 OrbitControls 同时把角色拖动当作镜头平移。
    cameraControls.enabled = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
    onStart();
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const move = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const item = actors.get(drag.id);
    if (!item) { cancel(); return; }
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
    drag.moved = true;
    canvas.style.cursor = 'grabbing';
    setRay(event);
    if (groundPoint()) item.actor.root.position.x = point.x + drag.offsetX;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const release = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const selected = event.type === 'pointerup' && !drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4 ? drag.id : undefined;
    cancel();
    event.stopImmediatePropagation();
    if (selected !== undefined) onSelect(selected);
  };
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('pointermove', move, true);
  canvas.addEventListener('pointerup', release, true);
  canvas.addEventListener('pointercancel', release, true);
  canvas.addEventListener('lostpointercapture', release, true);
  return {
    hitActor,
    cancel,
    dispose() {
      cancel();
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move, true);
      canvas.removeEventListener('pointerup', release, true);
      canvas.removeEventListener('pointercancel', release, true);
      canvas.removeEventListener('lostpointercapture', release, true);
    },
  };
}
