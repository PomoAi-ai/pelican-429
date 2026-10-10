"""Depth-tested faces for concept diagrams with foliage crossing large host faces."""
import math
from PIL import ImageColor


def render_faces(image, faces, project):
    polygons = [([(project(v)[0], project(v)[1], 1 / project.depth(v)) for v in vertices], color) for vertices, color in faces]
    points = [p for polygon, _ in polygons for p in polygon]
    left = max(0, math.floor(min(p[0] for p in points)) - 1)
    top = max(0, math.floor(min(p[1] for p in points)) - 1)
    right = min(image.width - 1, math.ceil(max(p[0] for p in points)) + 1)
    bottom = min(image.height - 1, math.ceil(max(p[1] for p in points)) + 1)
    width = right - left + 1
    depth = [0.] * (width * (bottom - top + 1))
    owner = [-1] * len(depth)
    pixels = image.load()
    for face_id, (polygon, color) in enumerate(polygons):
        rgb = ImageColor.getrgb(color)
        for b, c in zip(polygon[1:-1], polygon[2:]):
            a = polygon[0]
            denominator = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1])
            if abs(denominator) < 1e-10:
                continue
            x0 = max(left, math.floor(min(a[0], b[0], c[0])))
            x1 = min(right, math.ceil(max(a[0], b[0], c[0])))
            y0 = max(top, math.floor(min(a[1], b[1], c[1])))
            y1 = min(bottom, math.ceil(max(a[1], b[1], c[1])))
            for y in range(y0, y1+1):
                row = (y-top)*width-left
                for x in range(x0, x1+1):
                    u = ((b[1]-c[1])*(x+.5-c[0]) + (c[0]-b[0])*(y+.5-c[1]))/denominator
                    v = ((c[1]-a[1])*(x+.5-c[0]) + (a[0]-c[0])*(y+.5-c[1]))/denominator
                    w = 1-u-v
                    if min(u, v, w) < -1e-8:
                        continue
                    inv_depth = u*a[2]+v*b[2]+w*c[2]
                    if inv_depth >= depth[row+x]-1e-10:
                        depth[row+x] = inv_depth
                        owner[row+x] = face_id
                        pixels[x, y] = rgb
    # Test each original edge against the same depth buffer; hidden edges stay hidden.
    for face_id, (polygon, _) in enumerate(polygons):
        for a, b in zip(polygon, polygon[1:]+polygon[:1]):
            steps = max(1, math.ceil(math.hypot(a[0]-b[0], a[1]-b[1])))
            for i in range(steps+1):
                t = i/steps
                x, y = round(a[0]+t*(b[0]-a[0])), round(a[1]+t*(b[1]-a[1]))
                if not (left <= x <= right and top <= y <= bottom):
                    continue
                inv_depth = a[2]+t*(b[2]-a[2])
                if owner[(y-top)*width+x-left] in (-1,face_id) or inv_depth > depth[(y-top)*width+x-left]+1e-5:
                    pixels[x, y] = (116, 131, 125)


if __name__ == '__main__':
    from PIL import Image
    def p(v):
        return v[0], v[1]
    p.depth = lambda v: v[2]
    wall = ([(0,0,10),(20,0,10),(20,20,10),(0,20,10)], '#B7A48B')
    leaf = ([(14,5,9),(18,5,9),(18,15,9),(14,15,9)], '#008800')
    hidden = ([(3,5,11),(7,5,11),(7,15,11),(3,15,11)], '#FF0000')
    outputs=[]
    for faces in ((leaf,wall,hidden),(hidden,wall,leaf)):
        im=Image.new('RGB',(24,24),'white')
        render_faces(im,faces,p)
        assert im.getpixel((16,10))==(0,136,0), 'front foliage was hidden by the host'
        assert im.getpixel((5,10))==ImageColor.getrgb('#B7A48B'), 'back foliage showed through the host'
        outputs.append(im.tobytes())
    assert outputs[0]==outputs[1], 'occlusion changed with face order'
    slanted_wall=([(0,0,10),(20,0,20),(20,20,20),(0,20,10)],'#B7A48B')
    near_leaf=([(14,5,15.2),(18,5,15.2),(18,15,15.2),(14,15,15.2)],'#008800')
    im=Image.new('RGB',(24,24),'white')
    render_faces(im,[near_leaf,slanted_wall],p)
    assert im.getpixel((16,10))==(0,136,0),'a large slanted face hid closer foliage'
    print('Near/far foliage occlusion and face-order self-check passed.')
