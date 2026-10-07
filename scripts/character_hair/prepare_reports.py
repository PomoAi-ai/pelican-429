"""Prepare reports for reviewed candidates without modifying public assets."""
from pathlib import Path
import argparse
import hashlib
import json
import struct

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'output/hair-rebuild-probe'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-root', type=Path, default=ROOT)
SOURCE = parser.parse_args().source_root.resolve()
mapping = {entry['source']: entry['candidate'] for entry in json.loads((OUT / 'replacement-map.json').read_text())}
summary = {entry['output']: entry for entry in json.loads((OUT / 'clean-summary.json').read_text())}


def load(path):
    data = path.read_bytes()
    end = 20 + struct.unpack_from('<I', data, 12)[0]
    return data, json.loads(data[20:end]), data[end + 8:]


def image_bytes(doc, binary):
    result = []
    for image in doc.get('images', []):
        view = doc['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        result.append(binary[start:start + view['byteLength']])
    return result


def geometry_bytes(doc, stored):
    image_views = {image['bufferView'] for image in doc.get('images', [])}
    return sum(view.get('extensions', {}).get('EXT_meshopt_compression', view)['byteLength']
               if stored else view['byteLength'] for i, view in enumerate(doc['bufferViews']) if i not in image_views)


(OUT / 'reports').mkdir(exist_ok=True)
for tier in ['web', 'web-1k', 'ktx2', 'ktx2-256', 'ktx2-compact', 'ktx2-256-compact']:
    name = f'{tier}-models-report.json'
    report = json.loads((SOURCE / 'assets/characters' / name).read_text())
    changed = 0
    for model in report['models']:
        source_path = 'public/' + model['source'].removeprefix('./')
        if source_path not in mapping:
            continue
        output_path = 'public/' + model['output'].removeprefix('./')
        source, source_doc, _ = load(ROOT / mapping[source_path])
        output, doc, binary = load(ROOT / mapping[output_path])
        _, original_doc, original_bin = load(SOURCE / output_path)
        assert image_bytes(doc, binary) == image_bytes(original_doc, original_bin), output_path
        model.update(sourceSha256=hashlib.sha256(source).hexdigest(), sourceBytes=len(source),
                     outputBytes=len(output), sourceBufferBytes=geometry_bytes(source_doc, False),
                     storedBufferBytes=geometry_bytes(doc, True))
        cut = summary[mapping[output_path]]
        rebuilt = dict(sourceBaseline='2a5455a', textureBuffers='copied byte-for-byte from existing texture tier',
                       geometry='old fused hair removed; boundary skin triangles clipped and vertices compacted',
                       removedHairTriangles=cut['removedHairTriangles'],
                       splitBoundaryTriangles=cut['splitBoundaryTriangles'],
                       detachedCutTriangles=cut['detachedCutTriangles'],
                       finalBodyTriangles=cut['keptTriangles'])
        if 'before' in model:
            before_path = 'public/' + model['before'].removeprefix('./')
            before = (ROOT / mapping[before_path]).read_bytes()
            rebuilt['inheritedQuantization'] = dict(
                note='Historical uncut-input quantization; new boundary vertices are interpolated, not requantized.',
                quantizedViews=model.pop('quantizedViews'), bufferErrors=model.pop('bufferErrors'))
            model.update(beforeBytes=len(before), beforeSha256=hashlib.sha256(before).hexdigest())
        model['bodyRebuild'] = rebuilt
        changed += 1
    assert changed == 5, (tier, changed)
    (OUT / 'reports' / name).write_text(json.dumps(report, indent=2) + '\n')
    print(f'{name}: updated {changed} body entries; other models preserved')
