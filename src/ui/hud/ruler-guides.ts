/** 标准标尺画在 PNG 里；它的虚线不画进去，存在同名 *.guides.json，打开时按图片像素坐标叠画到原图上。 */
type GuideOp =
  | { readonly type: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly color: string; readonly width: number; readonly dash?: readonly [number, number] }
  | { readonly type: 'text'; readonly x: number; readonly y: number; readonly text: string; readonly color: string; readonly size: number; readonly align: CanvasTextAlign; readonly baseline: CanvasTextBaseline; readonly backdrop?: string }
  | { readonly type: 'circle'; readonly cx: number; readonly cy: number; readonly r: number; readonly color: string };

interface RulerGuides {
  readonly size: readonly [number, number];
  readonly ops: readonly GuideOp[];
}

const urls = new Map<string, Promise<string>>();

async function loadGuides(path: string): Promise<RulerGuides> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} 读取失败：${response.status}`);
  const guides = await response.json() as RulerGuides;
  if (!Array.isArray(guides.size) || !Array.isArray(guides.ops)) throw new Error(`${path} 不是虚线数据`);
  return guides;
}

function drawOp(context: CanvasRenderingContext2D, op: GuideOp): void {
  if (op.type === 'line') {
    context.strokeStyle = op.color;
    context.lineWidth = op.width;
    context.setLineDash(op.dash ? [...op.dash] : []);
    context.beginPath();
    context.moveTo(op.x1, op.y1);
    context.lineTo(op.x2, op.y2);
    context.stroke();
  } else if (op.type === 'circle') {
    context.fillStyle = op.color;
    context.beginPath();
    context.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
    context.fill();
  } else {
    context.font = `${op.size}px "STHeiti", "PingFang SC", sans-serif`;
    context.textAlign = op.align;
    context.textBaseline = op.baseline;
    if (op.backdrop) {
      const box = context.measureText(op.text);
      const left = op.align === 'right' ? op.x - box.width : op.align === 'center' ? op.x - box.width / 2 : op.x;
      context.fillStyle = op.backdrop;
      context.fillRect(left - 4, op.y - box.actualBoundingBoxAscent - 3, box.width + 8, box.actualBoundingBoxAscent + box.actualBoundingBoxDescent + 6);
    }
    context.fillStyle = op.color;
    context.fillText(op.text, op.x, op.y);
  }
}

async function draw(imagePath: string, guidesPath: string): Promise<string> {
  const image = new Image();
  image.src = imagePath;
  const [guides] = await Promise.all([loadGuides(guidesPath), image.decode()]);
  const [width, height] = guides.size;
  // 坐标按生成时的图片像素记录，尺寸对不上说明图与数据不是同一次生成。
  if (image.naturalWidth !== width || image.naturalHeight !== height) {
    throw new Error(`${guidesPath} 记录尺寸 ${width}x${height}，图片为 ${image.naturalWidth}x${image.naturalHeight}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  for (const op of guides.ops) drawOp(context, op);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve));
  if (!blob) throw new Error(`${imagePath} 叠加虚线后导出失败`);
  return URL.createObjectURL(blob);
}

/** 返回叠好虚线的图片地址；同一张图只合成一次。 */
export function guidedImageUrl(imagePath: string, guidesPath: string): Promise<string> {
  let url = urls.get(imagePath);
  if (!url) {
    url = draw(imagePath, guidesPath);
    urls.set(imagePath, url);
  }
  return url;
}
