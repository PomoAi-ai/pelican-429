"""Read the saved candidate and verify its retained meshes and runtime contract."""
import hashlib
import importlib.util
import json
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('temple_saved_builder', HERE/'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
OUT = HERE/'draft-01'
report = json.loads((OUT/'geometry-report.json').read_text())
source_data = np.load(HERE/'source-runtime.npz')
candidate = OUT/'Temple-Root-Continuity.blend'
before = hashlib.sha256(candidate.read_bytes()).hexdigest()
assert before == report['candidateSHA256']
bpy.ops.wm.open_mainfile(filepath=str(candidate))
assert all(builder.base.shared.joint.mesh_hash(bpy.data.objects[name]) == sha for name, sha in report['other52MeshHashes'].items())
assert builder.base.shared.image_hashes() == report['allImagePixelHashesFrozen']
checks = []
for index, name in enumerate(builder.NAMES):
    obj = bpy.data.objects[name]
    points = builder.export.world_points(obj)
    uv = np.asarray([p.uv for p in obj.data.uv_layers.active.data])
    assert obj.data.uv_layers.active.name == 'Hair flow'
    assert np.array_equal(uv, source_data[f'{index}_uv'])
    _, t, flow, guides = builder.export.strand_data(obj, points, uv, 0)
    assert np.array_equal(t.astype(np.float32), source_data[f'{index}_runtimeT'].astype(np.float32))
    lower = np.r_[np.arange(builder.JOIN*builder.SIDES, len(points)-2), len(points)-1]
    assert np.array_equal(points[lower], source_data[f'{index}_points'][lower])
    actual_centres = points[:-2].reshape(41, 28, 3).mean(1)
    actual_centres[0] = points[np.r_[np.arange(28), len(points)-2]].mean(0)
    actual_centres[-1] = points[np.r_[np.arange(40*28, 41*28), len(points)-1]].mean(0)
    assert np.array_equal(actual_centres, np.asarray(json.loads(obj['guideBlender'])))
    handles = [o.name for o in bpy.context.scene.objects if o.type == 'CURVE' and o.name.startswith(name+' ')]
    checks.append(dict(name=name, lowerVertexCount=len(lower), lowerGeometryFrozen=True, activeAtlasUVFrozen=True,
        allRuntimeTFloat32Frozen=True, fixedVertexMaskExactlyFrozen=bool(np.array_equal(t <= .3, source_data[f'{index}_runtimeT'] <= .3)),
        actualGeometryGuideVerified=True, relatedCurveHandles=handles, actualGuide=guides[0]))
assert hashlib.sha256(candidate.read_bytes()).hexdigest() == before
assert hashlib.sha256(builder.SOURCE.read_bytes()).hexdigest() == report['sourceSHA256']
result = dict(candidate=str(candidate), candidateSHA256=before, sourceUnchanged=True, candidateUnchanged=True,
    other52SavedMeshesFrozen=True, allSavedImagesFrozen=True, components=checks)
(OUT/'saved-audit.json').write_text(json.dumps(result, indent=2)+'\n')
print('TEMPLE_SAVED_AUDIT', json.dumps(result), flush=True)
