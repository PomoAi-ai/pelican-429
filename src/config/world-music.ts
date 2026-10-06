export const WORLD_BEAT = 60 / 90;

export const WORLD_MUSIC = {
  wilds: { title: '原野 · 风与归途', titleEn: 'Wilds · Home on the Wind', notes: '木质拨弦与暖笛 · 营地和林间', notesEn: 'Wooden plucks and warm flute · Camp and woodland' },
  lake: { title: '湖畔 · 水面来信', titleEn: 'Lakeside · Letters on Water', notes: '水滴琴与摇曳和弦 · 湖岸湿地', notesEn: 'Water bells and drifting chords · Lakes and wetlands' },
  desert: { title: '沙丘 · 远行足迹', titleEn: 'Dunes · Footprints Afar', notes: '低鼓与干燥拨弦 · 沙漠旅途', notesEn: 'Low drums and dry plucks · Desert travel' },
  cave: { title: '洞穴 · 微光回声', titleEn: 'Caves · Echoes of Light', notes: '稀疏晶体泛音与低音 · 地下探索', notesEn: 'Sparse crystal harmonics and bass · Underground' },
  sky: { title: '浮岛 · 云上航线', titleEn: 'Sky Islands · Above the Clouds', notes: '气息长笛与星点高音 · 浮岛漫游', notesEn: 'Airy flute and bright chimes · Sky islands' },
  ruins: { title: '遗迹 · 沉睡电路', titleEn: 'Ruins · Sleeping Circuits', notes: '机械拨弦与缓慢脉冲 · 相连机房', notesEn: 'Mechanical plucks and slow pulses · Connected facilities' },
} as const;

export type WorldMusicTheme = keyof typeof WORLD_MUSIC;
