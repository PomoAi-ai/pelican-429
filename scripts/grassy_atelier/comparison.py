"""Put the unchanged reference and real mesh render at the same display height."""
from pathlib import Path

import bpy
import numpy as np


def _normalized(path, height):
    source = bpy.data.images.load(str(path), check_existing=False)
    width, old_height = source.size
    pixels = np.empty(width*old_height*4, dtype=np.float32)
    source.pixels.foreach_get(pixels)
    pixels = pixels.reshape(old_height, width, 4)
    ys, xs = np.nonzero(pixels[:, :, 3] > .125)
    if not len(xs):
        raise ValueError(f'No visible character in comparison image: {path}')
    crop = pixels[ys.min():ys.max()+1, xs.min():xs.max()+1].copy()
    bpy.data.images.remove(source)
    scaled = bpy.data.images.new('Comparison temporary crop', width=crop.shape[1],
                                 height=crop.shape[0], alpha=True)
    scaled.colorspace_settings.name = 'Non-Color'
    scaled.pixels.foreach_set(crop.ravel())
    scaled.scale(round(crop.shape[1]*height/crop.shape[0]), height)
    result = np.empty(scaled.size[0]*height*4, dtype=np.float32)
    scaled.pixels.foreach_get(result)
    result = result.reshape(height, scaled.size[0], 4)
    bpy.data.images.remove(scaled)
    return result


def _save_sheet(images, path, min_width):
    columns = [max(min_width, image.shape[1]+64) for image in images]
    width, height = sum(columns), images[0].shape[0]+64
    sheet = np.empty((height, width, 4), dtype=np.float32)
    sheet[:] = (248/255, 246/255, 242/255, 1)
    offset = 0
    for image, column in zip(images, columns):
        start = offset+(column-image.shape[1])//2
        target = sheet[32:height-32, start:start+image.shape[1], :3]
        alpha = image[:, :, 3:4]
        target[:] = image[:, :, :3]*alpha+target*(1-alpha)
        offset += column
    boundaries = np.cumsum(columns)[:-1]
    sheet[:, boundaries, :3] = (221/255, 215/255, 206/255)
    output = bpy.data.images.new('Comparison '+path.stem, width=width, height=height, alpha=True)
    output.colorspace_settings.name = 'Non-Color'
    output.pixels.foreach_set(sheet.ravel())
    output.file_format = 'PNG'
    output.filepath_raw = str(path)
    output.save()
    bpy.data.images.remove(output)


def compare_view(public, references, view):
    images = [_normalized(Path(references)/(view+'.png'), 1040),
              _normalized(Path(public)/('render-'+view+'.png'), 1040)]
    _save_sheet(images, Path(public)/('comparison-'+view+'.png'), 490)
    heads = []
    for image in images:
        head = image[660:]
        _, xs = np.nonzero(head[:, :, 3] > .125)
        heads.append(head[:, xs.min():xs.max()+1])
    _save_sheet(heads, Path(public)/('comparison-face-'+view+'.png'), 390)
