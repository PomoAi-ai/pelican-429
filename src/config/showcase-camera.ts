export const RESOURCE_CAMERA_VIEWS = [
  { id: 'front', label: '正面', yaw: 0, pitch: 0 },
  { id: 'terrain', label: '地形视角', yaw: 0, pitch: 12 },
  { id: 'oblique', label: '斜侧', yaw: 35, pitch: 20 },
  { id: 'side', label: '侧面', yaw: 70, pitch: 10 },
  { id: 'top', label: '俯视', yaw: 0, pitch: 65 },
] as const;

export const RESOURCE_CAMERA_LIMITS = { minYaw: -80, maxYaw: 80, minPitch: -30, maxPitch: 75 } as const;
