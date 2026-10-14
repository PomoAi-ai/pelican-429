"""Four reference-led bob volumes with thin attached finishing layers."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector

HERE=Path(__file__).resolve().parent;BASE=HERE.parent;OUT=HERE/'draft-01'
SOURCE=BASE/'main-back-return-motion-clearance-study-01/draft-01/D1-Hair-Painted.blend'
REFERENCE=BASE/'bob-reference-volumes-study-01/reference-volumes.json'
ROWS,SIDES=81,32
NAMES=[f'{side} lower fan {i:02}' for side in ('right','left') for i in range(1,8)]+[f'{side} lower body underfold' for side in ('right','left')]
sys.dont_write_bytecode=True;sys.path.insert(0,str(BASE))

def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
shared=module('reference_bob_contract',BASE/'inner-fringe-overlap-study-01/build.py')
sample=module('reference_bob_curves',BASE/'bob-cluster-sculpt-study-01/build.py')
cubic=module('reference_bob_cubic',BASE/'bob-surface-clumps-study-01/build_second.py')
render=module('reference_bob_render',BASE/'rear-flow-assembly-study-01/build.py')
shared.joint.audit_helper.SIDES=SIDES
REF=json.loads(REFERENCE.read_text())
GROUPS={g['id']:g for g in REF['groups']}
INFLUENCES=np.asarray([f['influences'] for f in json.loads((BASE/'main-back-return-motion-clearance-study-01/motion-check/motion-samples.json').read_text())['frames']]).reshape(-1,3,3)

# Root/support entries are hidden physical scaffolds. Pixel paths below are
# visible body paths, not physical root-to-skin correspondence.
MAIN={
  2:dict(group='rear_outer_body',root=[.19,.28,2.82],support=[.29,.355,2.66],x=[.39,.46,.51,.505,.48,.435],xp=[.39,.46,.515,.505,.48,.43],depthScale=.34),
  4:dict(group='middle_rear_body',root=[.275,.18,2.81],support=[.365,.27,2.63],x=[.42,.47,.50,.485,.45,.40],xp=[.40,.465,.49,.478,.438,.386],depthScale=.37),
  5:dict(group='middle_front_body',root=[.325,.075,2.77],support=[.395,.18,2.63],x=[.46,.515,.545,.52,.46,.37],xp=[.45,.50,.53,.506,.446,.35],depthScale=.37),
  0:dict(group='ear_neck_body',root=[.31,.10,2.77],support=[.365,.185,2.51],x=[.382,.36,.32,.275,.235],xp=[.374,.35,.306,.264,.225],depthScale=.36),
}
FORK={
  1:dict(parent=2,t=[0,.17,.38,.57,.73,.82],width=[.029,.037,.037,.026,.012,.0025],offset=-.12,tip=[.061,.046,-.010]),
  3:dict(parent=4,t=[0,.18,.42,.62,.80,.94],width=[.028,.036,.036,.028,.014,.0025],offset=.10,tip=[.010,-.027,-.017]),
  6:dict(parent=5,t=[0,.18,.41,.64,.83,.96],width=[.026,.034,.032,.025,.010,.002],offset=.12,tip=[-.016,-.018,-.027]),
  7:dict(parent=0,t=[0,.16,.38,.57,.73,.84],width=[.021,.029,.030,.023,.012,.002],offset=-.10,tip=[.011,-.016,.012]),
}

def smooth(a,b,t):
    q=np.clip((t-a)/(b-a),0,1);return q*q*(3-2*q)

def maximum_travel(guide):
    # Same guide weighting/TRAVEL/stiffness as the existing runtime.
    root,tip=guide[[0,-1]];x=(root[0]+tip[0])*.5-.000230005
    z=-(root[1]+tip[1])*.5+.006884412
    back=1-smooth(-.25,-.05,z);right=smooth(-.12,.12,x)
    weights=np.asarray([(1-right)*(1-back),right*(1-back),back])
    delta=(INFLUENCES*weights[None,:,None]).sum(axis=1)*[.024,.015,.024]*.32
    return min(float(np.linalg.norm(delta,axis=1).max()),float(np.linalg.norm(tip-root))*.1)

def interpolate(p,w,d):
    p=np.asarray(p,float);path=sample.sample_controls(p,ROWS)
    arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(p,axis=0),axis=1))];arc/=arc[-1]
    values=np.linspace(0,1,ROWS)
    return path,np.asarray([cubic.interpolate(arc,w,t) for t in values]),np.asarray([cubic.interpolate(arc,d,t) for t in values])

def frames(path,sign,front):
    result=[]
    for i,(t,n,b) in enumerate(sample.frames(path)):
        target=np.asarray([sign*.58,-.81,0.]) if front else np.asarray([sign,0.,0.])
        target-=t*np.dot(target,t);target/=np.linalg.norm(target)
        angle=np.arctan2(np.dot(t,np.cross(n,target)),np.dot(n,target))*smooth(.08,.43,i/(ROWS-1))
        n=n*np.cos(angle)+np.cross(t,n)*np.sin(angle)
        result.append((t,n,np.cross(t,n)))
    return result

def rings_for(path,w,d,sign,front):
    angles=np.arange(SIDES)*np.pi*2/SIDES;c,s=np.cos(angles),np.sin(angles)
    return np.asarray([p+np.outer(c*w0*.5,b)+np.outer(s*d0*np.where(s>=0,1.,1.10),n)
        for p,w0,d0,(_,n,b) in zip(path,w,d,frames(path,sign,front))])

def fit(path,w,d,sign,front,head):
    adjustments=[]
    for _ in range(5):
        rings=rings_for(path,w,d,sign,front)
        guide=rings.mean(axis=1);arc=np.r_[0,np.cumsum(np.linalg.norm(np.diff(guide,axis=0),axis=1))];arc/=arc[-1]
        s=np.clip((arc-.3)/.7,0,1);weight=s**3*(s*(s*6-15)+10)
        travel=maximum_travel(guide);shift=np.zeros_like(path)
        for row,ring in enumerate(rings):
            margin=-.0015 if arc[row]<.08 else .001+travel*weight[row]
            probes=np.vstack((ring,(ring+np.roll(ring,-1,axis=0))*.5))
            distances=[shared.joint.audit_helper.signed_distance(head,p) for p in probes]
            worst=int(np.argmin(distances))
            if distances[worst]<margin:
                near,normal=head.find_nearest(Vector(probes[worst]))[:2]
                shift[row]=np.asarray(normal)*(margin-distances[worst]+.00025)
        maximum=float(np.linalg.norm(shift,axis=1).max());adjustments.append(maximum)
        if maximum<1e-6:break
        padded=np.pad(shift,((2,2),(0,0)),mode='edge')
        neighbor=np.asarray([padded[i:i+5].mean(axis=0) for i in range(ROWS)])
        path+=shift*.85+neighbor*.15
    return path,rings_for(path,w,d,sign,front),adjustments

def main_layout(number,sign,head):
    r=MAIN[number];g=GROUPS[r['group']]['side']
    side=np.asarray(g['centrePath'],float)
    p=np.column_stack((np.asarray(r['x'] if sign<0 else r['xp'])*sign,
        .09-(side[:,0]-152)/256.25,2.4453+(186-side[:,1])/256.25))
    if number==0:
        p[0,1]+=.025;p[-2:,2]-=.012
    if sign>0:
        p[2:,2]+=({2:.010,4:.006,5:.011,0:.008}[number])
    root=np.asarray(r['root'])*[sign,1,1]
    near,n=head.find_nearest(Vector(root))[:2];root=np.asarray(near)+np.asarray(n)*.004
    support=np.asarray(r['support'])*[sign,1,1]
    p=np.vstack((root,support,p))
    width=np.r_[.045,.054,np.asarray(g['widthAtStationsPx'])/256.25]
    depth=np.r_[.006,.015,np.asarray(g['widthAtStationsPx'])/256.25*r['depthScale']]
    path,w,d=interpolate(p,width,depth)
    path,rings,adjustments=fit(path,w,d,sign,number==0,head)
    return dict(path=path,rings=rings,w=w,d=d,recipe=dict(group=r['group'],controls=p.tolist(),width=width.tolist(),depth=depth.tolist(),fitMaximumShifts=adjustments))

def fork_layout(number,sign,parents,head):
    r=FORK[number];parent=parents[r['parent']];pf=frames(parent['path'],sign,r['parent']==0)
    p=[]
    for t in r['t']:
        i=round(t*(ROWS-1));_,n,b=pf[i]
        p.append(parent['path'][i]+n*parent['d'][i]*.70+b*parent['w'][i]*r['offset'])
    p=np.asarray(p);tip=np.asarray(r['tip'])*[sign,1,1]
    if sign>0:
        if number==1:tip=np.asarray([.019,.007,-.023])
        else:tip[2]+={3:.008,6:.008,7:-.005}[number]
    p[-1]+=tip
    near,n=head.find_nearest(Vector(p[0]))[:2];p[0]=np.asarray(near)+np.asarray(n)*.004
    widths=r['width'];depths=np.asarray(widths)*.22+.0007
    path,w,d=interpolate(p,widths,depths)
    path,rings,adjustments=fit(path,w,d,sign,r['parent']==0,head)
    return dict(path=path,rings=rings,w=w,d=d,recipe=dict(parent=r['parent'],attachedFinishingLayer=True,controls=p.tolist(),width=widths,depth=depths.tolist(),fitMaximumShifts=adjustments))

def main():
    OUT.mkdir(exist_ok=False);sha=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene
    frozen={o.name:shared.joint.mesh_hash(o) for o in scene.objects if o.type=='MESH' and o.name not in NAMES};assert len(frozen)==38
    image_hashes=shared.image_hashes();head=shared.joint.skull_tree(bpy.data.objects['Head'])
    layouts={}
    for sign,label in [(-1,'right'),(1,'left')]:
        parents={i:main_layout(i,sign,head) for i in [0,2,4,5]}
        for i,p in parents.items():layouts[f'{label} lower fan {i:02}' if i else f'{label} lower body underfold']=p
        for i in FORK:layouts[f'{label} lower fan {i:02}']=fork_layout(i,sign,parents,head)
    reports=[]
    for name in NAMES:
        old=bpy.data.objects[name];uv=np.asarray([l.uv for l in old.data.uv_layers.active.data])
        material,matrix,region=old.active_material,old.matrix_world.copy(),old['region']
        offset,scale=uv.min(axis=0),np.ptp(uv,axis=0)
        bpy.data.objects.remove(old,do_unlink=True)
        for handle in list(scene.objects):
            if handle.type=='CURVE' and handle.name.startswith(name+' '):bpy.data.objects.remove(handle,do_unlink=True)
        layout=layouts[name];obj,guide=shared.joint.helper.closed_object(name,layout['rings'],material,matrix,region)
        shared.add_atlas_uv(obj,offset,scale)
        obj['authorControls']=json.dumps(layout['recipe']['controls'])
        r=shared.joint.inspect(obj,head,layout['recipe'])
        r['maximumMeasuredStrandTravel']=maximum_travel(guide)
        reports.append(r)
        print('REFERENCE_BOB_COMPONENT',name,r['selfIntersection']['exactCrossings'],r['headVertexMin'],flush=True)
    assert all(shared.joint.mesh_hash(bpy.data.objects[n])==h for n,h in frozen.items())
    assert shared.image_hashes()==image_hashes and hashlib.sha256(SOURCE.read_bytes()).hexdigest()==sha
    passed=all(r['closed'] and r['signedVolume']>0 and r['selfIntersection']['exactCrossings']==0 for r in reports)
    report=dict(source=str(SOURCE),sourceSHA256=sha,reference=str(REFERENCE),changedComponents=NAMES,other38MeshHashes=frozen,
        allImagePixelHashesFrozen=image_hashes,components=reports,structurePass=passed,
        guideSamples=ROWS,sectionSize=SIDES,nativeUVLayer='Hair flow native',activeUVLayer='Hair flow',
        hairComponentCount=len(json.loads(scene['Hair components'])),visualApproval=False,animationApproval=False,exported=False,published=False)
    (OUT/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
    (OUT/'build.py').write_text(Path(__file__).read_text())
    bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Bob-Reference-Sculpt.blend'))
    print('REFERENCE_BOB_SAVED',passed,OUT,flush=True)
    clay=bpy.data.materials.new('Reference-led compact bob clay');clay.use_nodes=True
    shader=clay.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.38,.38,.38,1);shader.inputs['Roughness'].default_value=.76
    for name in json.loads(scene['Hair components']):
        o=bpy.data.objects[name];o.data.materials.clear();o.data.materials.append(clay)
    render.HERE=OUT;render.render_three(scene,'',24,True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Bob-Reference-Clay.blend'))
    print('REFERENCE_BOB_THREE_VIEWS_READY',passed,OUT,flush=True)

if __name__=='__main__':main()
