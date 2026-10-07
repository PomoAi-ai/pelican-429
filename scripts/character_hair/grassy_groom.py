"""Continuous short hair flow: fine fibres share each authored guide's bones."""
import json
import math
from pathlib import Path
import random

from mathutils import Vector


def build(materials, cap, mesh_object, style='soft'):
    rng = random.Random(42973)
    center = Vector((0, .035, 2.46))
    boundary = json.loads((Path(__file__).resolve().parents[2] / 'assets/characters/hair-design/scalp-boundaries.json').read_text())['grassy']

    def edge(angle):
        # The boundary uses azimuth around model +Z; Blender front is -Y.
        segment = (angle % math.tau) / math.tau * len(boundary)
        i = int(segment)
        value = Vector(boundary[i % len(boundary)]).lerp(Vector(boundary[(i + 1) % len(boundary)]), segment - i)
        return Vector((value.x, -value.z, value.y))
    vertices, faces, uvs, indices, weights, skeleton, locks = [], [], [], [], [], [], []

    def surface(angle, latitude, lift=0):
        target = edge(angle)
        limit = math.acos(max(-.98, min(.98, (target.z-2.46)/.482)))
        t = latitude / limit
        radial = math.sin(latitude) / math.sin(limit)
        p = Vector((.398*math.sin(latitude)*math.sin(angle),
                    .035-.365*math.sin(latitude)*math.cos(angle),
                    2.46+.482*math.cos(latitude)))
        fitted = Vector((target.x*radial, .035+(target.y-.035)*radial, p.z))
        q = max(0,min(1,(t-.90)/.10)); q=q*q*(3-2*q)
        p = p.lerp(fitted,q)
        ear=math.exp(-((p.z-2.28)/.125)**4-((p.y-.015)/.14)**4)
        p.x *= 1-.32*ear
        return p + (p-center).normalized()*lift

    def bezier(points, t):
        a, b, c, d = map(Vector, points)
        q = 1 - t
        return q*q*q*a + 3*q*q*t*b + 3*q*t*t*c + t*t*t*d

    def add_guide(sample, width, count, region, radius=.0025):
        if style == 'tousled':
            authored_sample = sample
            def sample(t):
                p = authored_sample(t)
                # Every visible bundle emerges from the skull, including hand-drawn fringe roots.
                return center + (p-center)*(1-.14*(1-min(1,t/.42))**2)
        index = len(locks)
        locks.append({'region': region, 'maxBend': {'front': .30, 'crown': .38, 'rear': .42}[region]} if style == 'tousled' else {'region': region})
        skeleton.append(tuple(sample(t) for t in (.2, .6, 1)))
        # A stable cross-section avoids a flipped root where a curve emerges radially.
        across_guide = (sample(.6)-center).normalized().cross(sample(.7)-sample(.5)).normalized()
        # A shallow continuous core joins the fine fibres without exposing a bare cap.
        core_depth = .030 if style == 'tousled' else (.037 if region == 'crown' else .034)
        offset = len(vertices)
        rows, sides = (24, 24) if style == 'tousled' else (18, 12)
        for row in range(rows):
            t = row / (rows - 1)
            p = sample(t)
            tangent = (sample(min(1,t+.002))-sample(max(0,t-.002))).normalized()
            across = ((across_guide-tangent*across_guide.dot(tangent)).normalized() if style == 'tousled'
                      else (p-center).normalized().cross(tangent).normalized())
            outward = tangent.cross(across).normalized()
            if style == 'tousled':
                twist = .24*math.sin(index*2.4+t*2)*math.sin(math.pi*t)
                across, outward = across*math.cos(twist)+outward*math.sin(twist),outward*math.cos(twist)-across*math.sin(twist)
            taper = (min(1,t/.30)*(.72+.36*math.sin(math.pi*t))*(1-t)**.65 if style == 'tousled' else min(1,t/.10)*(1-t**4)**.60)
            if t <= .2:
                weight = (1.,0.,0.)
            elif t <= .6:
                q = (t-.2)/.4; q=q*q*(3-2*q); weight=(1-q,q,0.)
            else:
                q = (t-.6)/.4; q=q*q*(3-2*q); weight=(0.,1-q,q)
            for side in range(sides):
                a=math.tau*side/sides
                burial = .006 if style == 'tousled' else .025
                groove = .0014*math.cos(16*math.cos(a)+.30*t)*max(0,math.sin(a))**2 if style == 'tousled' else 0
                vertices.append(p + across*(math.cos(a)*width*.95*taper) + outward*(math.sin(a)*core_depth*taper*(1-t)**(.40 if style == 'tousled' else 0)+groove-burial))
                weights.append((index,*weight))
            if row:
                for side in range(sides):
                    a=offset+(row-1)*sides+side; b=offset+(row-1)*sides+(side+1)%sides
                    faces.append((a,b,b+sides,a+sides)); u=side/sides; un=(side+1)/sides
                    uvs.append(((u,(row-1)/(rows-1)),(un,(row-1)/(rows-1)),(un,t),(u,t))); indices.append(1 if style == 'tousled' and index % 9 == 4 else 0)
        for fibre in range(count):
            across_fraction = (fibre + rng.uniform(.15, .85)) / count * 2 - 1
            length = rng.uniform(.95, 1.0)
            root_shift = rng.uniform(-.045, .025)
            phase = rng.uniform(0, math.tau)
            size = radius * rng.uniform(.65, 1.25)
            material_index = 1 if rng.random() < .10 else 0
            offset = len(vertices)
            rows, sides = 18, 5
            for row in range(rows):
                t = row / (rows - 1)
                progress = max(0, min(1, root_shift + (length - root_shift) * t))
                p = sample(progress)
                tangent = (sample(min(1, progress + .002)) - sample(max(0, progress - .002))).normalized()
                radial = (p - center).normalized()
                across = radial.cross(tangent).normalized()
                outward = tangent.cross(across).normalized()
                spread = min(1,t/.10) * (.95 + .05 * math.sin(t * math.pi)) * (1 - .13 * t)
                if style == 'tousled':
                    spread *= (1-t**2.5)**.6
                loose = 0 if style == 'tousled' else .007 * math.sin(phase) * t**7
                p += across * (width * across_fraction * spread + .0025 * math.sin(phase + t * 6) * math.sin(math.pi*t) + loose)
                relief = .023 if style == 'tousled' else .014
                p += outward * (relief * (1-progress**4)**.6 * max(0,1-across_fraction**2)**.5 - .004 + .0015 * math.sin(phase+t*4))
                taper = (1 - t) ** .48
                if t <= .2:
                    weight = (1., 0., 0.)
                elif t <= .6:
                    blend = (t - .2) / .4
                    blend = blend * blend * (3 - 2 * blend)
                    weight = (1 - blend, blend, 0.)
                else:
                    blend = (t - .6) / .4
                    blend = blend * blend * (3 - 2 * blend)
                    weight = (0., 1 - blend, blend)
                for side in range(sides):
                    angle = math.tau * side / sides
                    vertices.append(p + size * taper * (across * math.cos(angle) + outward * .65 * math.sin(angle)))
                    weights.append((index, *weight))
                if row:
                    for side in range(sides):
                        a = offset + (row-1)*sides + side
                        b = offset + (row-1)*sides + (side+1)%sides
                        faces.append((a, b, b+sides, a+sides))
                        u, un = side/sides, (side+1)/sides
                        uvs.append(((u,(row-1)/(rows-1)),(un,(row-1)/(rows-1)),(un,t),(u,t)))
                        indices.append(material_index)

    if style == 'tousled':
        tousled_guides(rng, surface, edge, add_guide)
        cap_mesh = cap('grassy', materials)
        mesh = mesh_object('HairStrands', vertices, faces, uvs, materials, indices)
        return cap_mesh, mesh, weights, skeleton, locks

    # Different falling lengths keep the forehead open around the side part.
    fringe = [
        ((.10,-.15,2.93),(-.04,-.28,3.11),(-.29,-.35,2.97),(-.37,-.26,2.73)),
        ((.14,-.15,2.92),(.02,-.33,3.06),(-.29,-.40,2.85),(-.32,-.30,2.58)),
        ((.14,-.19,2.89),(.03,-.36,3.00),(-.20,-.43,2.81),(-.22,-.34,2.57)),
        ((.15,-.22,2.86),(.09,-.39,2.94),(-.10,-.44,2.72),(-.12,-.37,2.59)),
        ((.16,-.23,2.87),(.21,-.37,2.96),(.17,-.43,2.72),(.06,-.36,2.61)),
        ((.18,-.17,2.92),(.34,-.28,3.00),(.36,-.33,2.80),(.33,-.23,2.63)),
        ((.20,-.10,2.94),(.40,-.17,2.99),(.44,-.20,2.77),(.39,-.10,2.56)),
        ((-.02,-.08,2.98),(-.17,-.20,3.05),(-.38,-.21,2.96),(-.43,-.06,2.77)),
    ]
    for i, points in enumerate(fringe):
        points = [(x,y,2.89+(z-2.89)*.44 if z>2.89 else z) for x,y,z in points]
        def front_sample(t, points=points):
            p = bezier(points,t)
            radial = Vector((p.x/.398,(p.y-.035)/.365,(p.z-2.46)/.482)).normalized()
            angle=math.atan2(radial.x,-radial.y)
            latitude=math.acos(radial.z)
            lift=-.009*(1-t)**5+.032*math.sin(math.pi*t)**.8+.008*t
            result = surface(angle,latitude,lift)
            result.z -= .035*t**5
            q=min(1,t/.38); q=q*q*(3-2*q)
            result.y -= .064*q
            return result
        add_guide(front_sample, .063 if i<5 else .055, 35, 'front', .0026)

    # Every side/back lock flows continuously from crown to hairline; no rows of scales.
    count = 38
    for i in range(count):
        angle = .85 + (math.tau - 1.65) * (i + .5) / count
        start = .055 + rng.uniform(0, .32)
        target = edge(angle)
        end = math.acos(max(-.98,min(.98,(target.z-2.46)/.482)))
        turn = .85 + .20*math.sin(angle)
        lift = .017 + rng.uniform(0, .021)
        def sample(t, angle=angle, start=start, end=end, turn=turn, lift=lift, target=target):
            latitude = start + (end-start)*t
            sweep = angle - turn*(1-t) + .18*math.sin(t*math.pi*1.6)
            p = surface(sweep, latitude, -.012*(1-t)**4 + lift*math.sin(math.pi*t)**1.1)
            return p
        add_guide(sample, .033 + rng.uniform(0,.008), 21, 'crown' if start<.32 else 'rear', .0024)

    # Short overlapping crown flow gives volume without isolated aerial tufts.
    for angle, end, turn, lift in [(.95,.83,.70,.050),(1.55,.96,.60,.041),(2.30,1.03,.52,.043),(3.00,.92,.46,.053),(3.85,1.02,.44,.039),(4.65,.98,.61,.052),(5.37,.82,.66,.062)]:
        def crown_sample(t,angle=angle,end=end,turn=turn,lift=lift):
            return surface(angle-turn*(1-t),.035+(end-.035)*t,-.010*(1-t)**4+lift*math.sin(math.pi*t)**1.2)
        add_guide(crown_sample,.045,24,'crown',.0025)

    cap_mesh = cap('grassy', materials)
    mesh = mesh_object('HairStrands', vertices, faces, uvs, materials, indices)
    return cap_mesh, mesh, weights, skeleton, locks


def tousled_guides(rng, surface, edge, add_guide):
    # Roots are distributed over the scalp: no single pole and no latitude rows.
    def lock(angle, start, end, turn, width, lift, region, tip=.030):
        def sample(t):
            sweep = angle + turn * (t + .15 * math.sin(math.pi*t))
            latitude = start + (end-start) * t
            emerge = min(1, t/.25)
            emerge = emerge*emerge*(3-2*emerge)
            height = -.019*(1-emerge) + emerge*(lift*math.sin(math.pi*t)**.8 + tip*t**2)
            p = surface(sweep, latitude, height)
            if region == 'front':
                p.y -= .047*emerge
            return p
        add_guide(sample, width, 0, region, .0015)

    # Authored asymmetric arcs keep the forehead open and hide the cap edge.
    fringe = [
        ((.07,-.24,2.91),(-.08,-.38,2.99),(-.32,-.38,2.82),(-.36,-.25,2.65)),
        ((.12,-.26,2.89),(-.03,-.42,2.90),(-.25,-.46,2.72),(-.28,-.34,2.53)),
        ((.11,-.28,2.87),(.01,-.43,2.86),(-.13,-.46,2.69),(-.16,-.37,2.56)),
        ((.16,-.25,2.90),(.17,-.41,2.85),(.07,-.45,2.67),(.02,-.37,2.57)),
        ((.18,-.24,2.91),(.27,-.37,2.88),(.22,-.42,2.70),(.15,-.34,2.58)),
        ((.20,-.22,2.91),(.37,-.32,2.87),(.40,-.30,2.70),(.33,-.21,2.56)),
        ((-.14,-.22,2.92),(-.28,-.31,2.91),(-.42,-.22,2.83),(-.42,-.09,2.72)),
        ((.19,-.13,2.95),(.36,-.25,2.98),(.44,-.17,2.85),(.43,-.01,2.77)),
        ((-.26,-.19,2.78),(-.40,-.22,2.75),(-.45,-.12,2.58),(-.35,-.10,2.42)),
        ((.29,-.19,2.79),(.40,-.19,2.74),(.43,-.10,2.58),(.35,-.09,2.44)),
        ((.11,-.20,2.94),(.02,-.29,3.02),(-.21,-.27,3.03),(-.35,-.13,2.96)),
        ((-.16,-.17,2.94),(-.27,-.23,2.99),(-.39,-.12,2.95),(-.43,.01,2.89)),
    ]
    for i, points in enumerate(fringe):
        points = [Vector(p) for p in points]
        if i < 8:
            points[-1].y -= .075
        def sample(t, points=points):
            a,b,c,d = points
            q = 1-t
            return q*q*q*a + 3*q*q*t*b + 3*q*t*t*c + t*t*t*d
        add_guide(sample, .075 if i<8 else .06, 0, 'front')
        if i < 8:
            under = [p + Vector((-.018,.025,-.082)) for p in points]
            def underneath(t, points=under):
                a,b,c,d = points; q=1-t
                return q*q*q*a+3*q*q*t*b+3*q*t*t*c+t*t*t*d
            add_guide(underneath,.068,0,'front')

    for x, lean, end in [(-.10,-.045,2.54),(-.015,-.035,2.52),(.075,-.025,2.56)]:
        points = [Vector((x,-.30,2.82)),Vector((x-.025,-.40,2.78)),
                  Vector((x+lean,-.415,2.66)),Vector((x+lean,-.445,end))]
        def inner_fringe(t, points=points):
            a,b,c,d=points; q=1-t
            return q*q*q*a+3*q*q*t*b+3*q*t*t*c+t*t*t*d
        add_guide(inner_fringe,.059,0,'front')

    # A staggered distribution gives a layered silhouette without tiled bands.
    count = 178
    for i in range(count):
        angle = (i * 2.399963229728653 + .18) % math.tau
        start = math.acos(1 - 1.55*(i+.5)/count) + rng.uniform(-.055,.055)
        if math.cos(angle) > .62 and start > .72:
            continue
        target = edge(angle)
        limit = math.acos(max(-.98,min(.98,(target.z-2.46)/.482)))
        span = rng.uniform(.37,.66)
        end = min(start + span, limit + .015)
        if end-start < .24:
            continue
        # Front-to-back sweep on both sides, softened into a crown swirl above.
        turn = .15 + .65*math.sin(angle) + rng.uniform(-.08,.08)
        if start < .46:
            turn = rng.uniform(.35,.65)
        width = rng.uniform(.070,.090)
        lift = rng.uniform(.038,.056)
        region = 'crown' if start < .78 else 'rear'
        lock(angle,start,end,turn,width,lift,region,rng.uniform(.022,.044))

    # Short nape locks close the real body's cut edge, with alternating lengths.
    for i in range(19):
        angle = 1.18 + (math.tau-2.36)*(i+.5)/19
        target = edge(angle)
        limit = math.acos(max(-.98,min(.98,(target.z-2.46)/.482)))
        lock(angle,limit-rng.uniform(.43,.60),limit+rng.uniform(.00,.06),
             .12,rng.uniform(.059,.078),.035,'rear',.030)

    # Low swept crest: several interlocking arcs, never one upright antenna.
    for angle,start,end,turn in [(0,.10,.72,-.95),(.9,.17,.82,.7),(2.0,.14,.73,.8),
                                  (3.1,.09,.68,.9),(4.2,.19,.75,.7),(5.4,.14,.72,.8)]:
        lock(angle,start,end,turn,.082,.022,'crown',.020)

    for i in range(12):
        angle = math.tau*i/12
        lock(angle,.18,.72+rng.uniform(-.06,.09),.38,.080,.026,'crown',.018)
