"""Prepare the checked temple-root repair with the existing game material."""
import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('temple_root_export_material', HERE.parent / 'rooted-fringe-assembly-study-01/prepare_export.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
helper.HERE = HERE
helper.SOURCE = HERE / 'draft-01/Temple-Root-Continuity.blend'
helper.DESTINATION = HERE / 'draft-01/PBR-Game-Export.blend'

if __name__ == '__main__':
    helper.main()
