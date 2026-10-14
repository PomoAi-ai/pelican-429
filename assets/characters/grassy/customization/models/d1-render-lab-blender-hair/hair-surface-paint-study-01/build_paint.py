"""Author a restrained flow paint study on locked hair UVs and geometry."""
import argparse,hashlib,importlib.util,json,sys
from pathlib import Path
import bpy,numpy as np

HERE=Path(__file__).resolve().parent
SOURCE=HERE.parent/'temple-root-continuity-study-01/draft-01/Temple-Root-Continuity.blend'
OUT=HERE/'draft-01'
REVISION=1
TARGETS=['Single broad swept fringe','Inner long fringe','Inner short fringe','Right swept fringe',
    'Left swept crown','Rear swept crown','Right crown turn','Left crown curled tip']
spec=importlib.util.spec_from_file_location('paint_freeze',HERE.parent/'eye-outer-blink-study-01/audit_candidate.py')
shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)


def smooth(a,b,x):
    q=np.clip((x-a)/(b-a),0,1);return q*q*(3-2*q)


def color_field(u,t,name):
    # These four colours were measured from genuine side-reference hair pixels
    # in paint_components.py; no front projection or unrelated piece is sampled.
    edge=np.array([.7730416852,.3640018236,.1388256183])
    shade=np.array([.9312978613,.5149570314,.2582469494])
    base=np.array([.9846478789,.6399291495,.3754431528])
    light=np.array([.9956321043,.8406754513,.6085294532])
    x=np.cos(2*np.pi*u);outer=np.clip(np.sin(2*np.pi*u),0,1)**.5
    result=np.broadcast_to(base,(*u.shape,3)).copy()
    def blend(target,amount):
        nonlocal result
        result=result*(1-amount[...,None])+target*amount[...,None]
    blend(shade,.18*(1-outer))
    # One uninterrupted, gently curved ridge; no random strokes or repeated bars.
    crown='crown' in name
    centre=(-.10 if not crown else -.03)+.09*np.sin(np.pi*(t-.10))
    ridge=np.exp(-((x-centre)/((.36 if not crown else .42) if REVISION==2 else (.56 if not crown else .62)))**2)
    length=(.62+.38*np.sin(np.pi*np.clip(t,0,1)))*smooth(.015,.15,t)*(1-.48*smooth(.72,1.,t))
    blend(light,(.97 if REVISION==2 else .58)*ridge*length*outer)
    # A second broad shoulder gives volume without drawing a filament groove.
    shoulder=np.exp(-((x+.56-.055*np.sin(np.pi*t))/.19)**2)
    blend(light,(.22 if REVISION==2 else .13)*shoulder*length*outer)
    if REVISION==2:
        broad_groove=.25*np.exp(-((x-.43+.055*np.sin(np.pi*t))/.14)**2)*outer*np.sin(np.pi*t)**.45
        blend(shade,broad_groove)
    edge_amount=(.68 if REVISION==2 else .46)*np.exp(-((np.abs(x)-.99)/(.16 if REVISION==2 else .105))**2)
    blend(edge,edge_amount)
    blend(shade,.24*(1-smooth(0,.23,t))+.20*smooth(.76,1,t))
    return np.clip(result,0,1)


def metrics(rgb):
    y=rgb@np.array([.2126,.7152,.0722]);hi=rgb.max(-1);lo=rgb.min(-1)
    return dict(meanRGB=rgb.mean((0,1)).tolist(),luminanceMean=float(y.mean()),luminanceStd=float(y.std()),
        luminanceP95=float(np.percentile(y,95)),meanSaturation=float(np.mean((hi-lo)/np.maximum(hi,1e-8))),
        meanLongitudinalAbsoluteStep=float(abs(np.diff(y,axis=0)).mean()),
        p99LongitudinalAbsoluteStep=float(np.percentile(abs(np.diff(y,axis=0)),99)))


def main():
    global OUT,REVISION
    parser=argparse.ArgumentParser();parser.add_argument('--revision',type=int,choices=[1,2],default=1)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    REVISION=args.revision;OUT=HERE/f'draft-{REVISION:02d}'
    OUT.mkdir(exist_ok=True)
    candidate=OUT/'Hair-Surface-Paint.blend'
    assert not candidate.exists(),'Preserved first draft already exists'
    source_sha=shared.sha(SOURCE)
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    before={o.name:shared.mesh_state(o) for o in bpy.context.scene.objects if o.type=='MESH'}
    guides={n:{k:str(v) for k,v in bpy.data.objects[n].items()} for n in before}
    source_mat=bpy.data.objects[TARGETS[0]].material_slots[0].material
    source_img=next(n.image for n in source_mat.node_tree.nodes if n.type=='TEX_IMAGE')
    old=np.asarray(source_img.pixels[:],np.float32).reshape(2048,2048,4);new=old.copy()
    altered=np.zeros((2048,2048),bool);details=[]
    for name in TARGETS:
        obj=bpy.data.objects[name]
        active=next(u for u in obj.data.uv_layers if u.active_render)
        uv=np.asarray([p.uv[:] for p in active.data])
        tile=np.floor(uv.min(0)*2048/292).astype(int)
        x0,y0=tile*292
        yy,xx=np.indices((292,292));u=np.clip((xx+.5-8)/276,0,1);t=np.clip((yy+.5-8)/276,0,1)
        rgb=color_field(u,t,name)
        new[y0:y0+292,x0:x0+292,:3]=rgb
        altered[y0:y0+292,x0:x0+292]=True
        details.append(dict(name=name,tile=tile.tolist(),nativeUVLayer='Hair flow native' if obj.data.uv_layers.get('Hair flow native') else 'same source tile 8px inset / 276px extent',
            before=metrics(old[y0+8:y0+284,x0+8:x0+146,:3]),after=metrics(rgb[8:284,8:146])))
    assert np.array_equal(old[~altered],new[~altered])
    atlas=bpy.data.images.new('Hair continuous flow paint study',2048,2048,alpha=True)
    atlas.colorspace_settings.name=source_img.colorspace_settings.name
    atlas.pixels.foreach_set(new.ravel());atlas.filepath_raw=str(OUT/'hair-continuous-flow-atlas.png');atlas.file_format='PNG';atlas.save();atlas.pack()
    material=source_mat.copy();material.name='Hair continuous flow paint study'
    for n in material.node_tree.nodes:
        if n.type=='TEX_IMAGE' and n.image==source_img:n.image=atlas
    for name in TARGETS:bpy.data.objects[name].data.materials[0]=material
    after={o.name:shared.mesh_state(o) for o in bpy.context.scene.objects if o.type=='MESH'}
    for name in before:
        for field in before[name]:
            if field=='slots' and name in TARGETS:continue
            assert before[name][field]==after[name][field],(name,field)
        assert guides[name]=={k:str(v) for k,v in bpy.data.objects[name].items()},(name,'guide/properties')
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(candidate))
    assert source_sha==shared.sha(SOURCE)
    report=dict(source=str(SOURCE),sourceSHA256=source_sha,candidate=str(candidate),candidateSHA256=shared.sha(candidate),
        materialOnly=True,geometryUVWeightsNormalsAndGuidesFrozen=True,sceneMeshCount=len(before),
        modifiedMaterialObjects=TARGETS,allOtherAtlasPixelsExactlyFrozen=True,
        lightingAndMaterialResponseUnchanged=True,referencePaletteSource='paint_components.py PaintedReference.strand_palette; genuine side crop hair colour quantiles',
        revision=REVISION,correctionReason='First draft removed wrong sampled bars but its broad highlight was too weak and uniform; strengthen one continuous ridge and broad longitudinal edge shadow' if REVISION==2 else None,
        components=details,visualApproved=False,exported=False,published=False)
    (OUT/'paint-report.json').write_text(json.dumps(report,indent=2)+'\n')
    print('HAIR_PAINT_SAVED',str(candidate),flush=True)


if __name__=='__main__':main()
