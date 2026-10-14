"""Read exact section and runtime data before repairing the two temple roots."""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
sys.path.insert(0, str(BASE))
import export_assembly as export
spec = importlib.util.spec_from_file_location('temple_root_existing_helpers', BASE / 'bob-leaf-shape-study-01/build.py')
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
base = shared.base
SOURCE = BASE / 'underfold-return-study-01/draft-03/Underfold-Return-Sculpt.blend'
NAMES = ['Left temple forelock', 'Right temple forelock']


def main():
    before = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    head = base.shared.joint.skull_tree(bpy.data.objects['Head'])
    report, arrays = [], {}
    for index, name in enumerate(NAMES):
        obj = bpy.data.objects[name]
        points = export.world_points(obj)
        assert len(points) == 41*28+2
        rings = points[:-2].reshape(41, 28, 3)
        centres = rings.mean(1)
        uv = np.asarray([p.uv for p in obj.data.uv_layers.active.data])
        _, t, flow, guides = export.strand_data(obj, points, uv, 0)
        obj.data.calc_loop_triangles()
        faces = np.asarray([f.vertices[:] for f in obj.data.loop_triangles])
        arrays.update({f'{index}_points':points, f'{index}_runtimeT':t, f'{index}_runtimeFlow':flow,
            f'{index}_rings':rings, f'{index}_uv':uv, f'{index}_triangles':faces})
        rows = []
        for row, ring in enumerate(rings):
            near, normal, _, distance = head.find_nearest(Vector(centres[row]))
            signed = base.shared.joint.audit_helper.signed_distance(head, centres[row])
            rows.append(dict(row=row, centre=centres[row].tolist(), runtimeT=float(t[row*28]),
                headDistance=signed, headPoint=list(near), headNormal=list(normal),
                extent=np.ptp(ring, axis=0).tolist(), bounds=[ring.min(0).tolist(), ring.max(0).tolist()]))
        report.append(dict(name=name, oldRuntimeGuide=guides[0], rows=rows,
            oldControlGuide=json.loads(obj['guideBlender']), oldGuideMeaning='Five author controls, not section centres'))
    head_obj = bpy.data.objects['Head']
    head_obj.data.calc_loop_triangles()
    arrays['headPoints'] = export.world_points(head_obj)
    arrays['headTriangles'] = np.asarray([f.vertices[:] for f in head_obj.data.loop_triangles])
    np.savez(HERE / 'source-runtime.npz', **arrays)
    assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == before
    (HERE/'source-sections.json').write_text(json.dumps(dict(source=str(SOURCE), sourceSHA256=before,
        sourceUnchanged=True, components=report), indent=2)+'\n')
    print('TEMPLE_SOURCE_READY', flush=True)


if __name__ == '__main__':
    main()
