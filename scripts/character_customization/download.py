"""Download exact files from a completed Hyper3D result, without credentials."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

parser = argparse.ArgumentParser()
parser.add_argument('result', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
files = json.loads(args.result.read_text())['files']
models = [item for item in files if item['name'].endswith('.glb') and 'shaded' not in item['name']]
if not models:
    raise RuntimeError(f'No PBR GLB in {args.result}')
for item in models:
    name = item['name']
    url = item['url']
    if Path(name).name != name or urlparse(url).scheme != 'https':
        raise ValueError(f'Unexpected model download metadata: {name}')
    with urlopen(url, timeout=180) as response:
        data = response.read()
    if data[:4] != b'glTF':
        raise ValueError(f'Download {name} is not a GLB')
    (args.output / name).write_bytes(data)
    print(name, len(data), flush=True)
