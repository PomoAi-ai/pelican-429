"""Measure only the visible underfold shell against actual Head sections."""
import importlib.util
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
spec = importlib.util.spec_from_file_location('underfold_base', BASE / 'bob-reference-sculpt-study-01/build_fourth.py')
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
base = previous.base
SOURCE = BASE / 'bob-reference-sculpt-study-01/draft-04/Bob-Reference-Sculpt.blend'
NAMES = [f'{side} lower body underfold' for side in ('right', 'left')]

def main():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    head = base.shared.joint.skull_tree(bpy.data.objects['Head'])
    result = {}
    for name in NAMES:
        obj = bpy.data.objects[name]
        sign = -1 if name.startswith('right') else 1
        guide = np.asarray(json.loads(obj['guideBlender']))
        sides = (len(obj.data.vertices) - 2) // len(guide)
        assert sides == 28
        rings = np.asarray([v.co for v in obj.data.vertices][:-2]).reshape(len(guide), sides, 3)
        rows = []
        for row in range(0, len(rings), 5):
            ring = rings[row]
            x = ring[:, 0] * sign
            samples = []
            for col in (0, 3, 7, 10, 14, 17, 21, 24):
                p = ring[col]
                hit = head.ray_cast(Vector((sign * 2, p[1], p[2])), Vector((-sign, 0, 0)))[0]
                samples.append(dict(col=col, point=p.tolist(), headPoint=list(hit) if hit else None,
                    xGap=float(sign * (p[0] - hit[0])) if hit else None))
            rows.append(dict(row=row, z=float(ring[0, 2]), absX=[float(x.min()), float(x.max())],
                yRange=[float(ring[:, 1].min()), float(ring[:, 1].max())], samples=samples))
        result[name] = dict(sectionSize=sides, properties={key: obj[key] for key in ('guideBlender', 'region')}, rows=rows)
    (HERE / 'source-sections.json').write_text(json.dumps(result, indent=2) + '\n')
    print('UNDERFOLD_SOURCE_SECTIONS_READY', flush=True)

if __name__ == '__main__':
    main()
