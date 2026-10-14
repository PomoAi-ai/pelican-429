from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
HERE=Path(__file__).resolve().parent
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',22)
small=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',17)
for view in ['front','side']:
    reference=Image.open(HERE.parent/'side-reference-calibration-study-01'/f'calibrated-{view}-comparison.png').convert('RGB')
    ref=reference.crop((0,42,748 if view=='front' else 742,588 if view=='front' else 592))
    out=Image.new('RGB',(1536,610),'#f4f2ef');draw=ImageDraw.Draw(out)
    inputs=[('Painted reference / colour reference',ref),('Source / unchanged camera',Image.open(HERE/'baseline'/f'{view}.png')),('One correction / visual rejection',Image.open(HERE/'draft-02'/f'{view}.png'))]
    for i,(label,im) in enumerate(inputs):
        draw.text((i*512+10,10),label,font=small,fill='#252525')
        if i:
            im=im.convert('RGBA').crop((65,115,705,755))
            bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);im=bg.convert('RGB')
        tile=ImageOps.contain(im,(512,540),Image.Resampling.LANCZOS)
        out.paste(tile,(i*512+(512-tile.width)//2,45+(540-tile.height)//2))
    draw.text((12,586),'Geometry / UV / guides / lighting frozen. Reference is a colour comparison, not new shape registration.',font=small,fill='#252525')
    out.save(HERE/f'{view}-comparison.png')
out=Image.new('RGB',(1536,560),'#f4f2ef');draw=ImageDraw.Draw(out)
for i,(folder,label) in enumerate([('baseline','Source'),('draft-01','First draft / too uniform'),('draft-02','One correction / still too uniform')]):
    im=Image.open(HERE/folder/'three-quarter.png').convert('RGBA').crop((65,115,705,755))
    bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im)
    out.paste(bg.convert('RGB').resize((512,512),Image.Resampling.LANCZOS),(512*i,42));draw.text((512*i+12,10),label,font=font,fill='#252525')
out.save(HERE/'three-quarter-comparison.png')
print('COMPARISONS_SAVED')
