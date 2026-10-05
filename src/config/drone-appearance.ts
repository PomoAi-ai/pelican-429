/** 出生时固定外观：所有无人机保留白色主体，仅变化饰条、灯光、桨尖与桨叶数量。 */
export const DRONE_APPEARANCES = [
  { name: '白壳青蓝双叶', accent: '#16cfe3', blades: 2 },
  { name: '白壳钴蓝三叶', accent: '#377be3', blades: 3 },
  { name: '白壳橙色双叶', accent: '#f58a35', blades: 2 },
  { name: '白壳赤红三叶', accent: '#e74754', blades: 3 },
  { name: '白壳黄绿双叶', accent: '#add840', blades: 2 },
  { name: '白壳紫色三叶', accent: '#ac73e6', blades: 3 },
  { name: '白壳香槟双叶', accent: '#cfb378', blades: 2 },
  { name: '白壳冰蓝三叶', accent: '#99d9f0', blades: 3 },
  { name: '白壳石墨三叶', accent: '#526271', blades: 3 },
  { name: '白壳青绿双叶', accent: '#20c5aa', blades: 2 },
] as const;
