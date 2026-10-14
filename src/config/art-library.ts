export interface ArtLibraryImage {
  readonly label: readonly [string, string];
  readonly path: string;
  /** 标尺虚线数据（*.guides.json，图片像素坐标）；资料库页与原画对比栏点按钮时叠画到图上。 */
  readonly guides?: string;
}

export interface ArtLibraryEntry {
  readonly id: string;
  readonly title: readonly [string, string];
  /** 目录里同一分组内的小标题（如体型），相邻同名条目归在一起。 */
  readonly subgroup?: readonly [string, string];
  readonly status: 'confirmed' | 'derived' | 'candidate';
  readonly description: readonly [string, string];
  readonly evidence: readonly [string, string];
  /** 定义字段（发型、服装、配色…），按行显示在来源说明之后。 */
  readonly facts?: readonly (readonly [readonly [string, string], string])[];
  readonly images: readonly ArtLibraryImage[];
  /** 非图片附件：提示词、定义文本、测量记录等。 */
  readonly files?: readonly ArtLibraryImage[];
}

export interface ArtLibraryGroup {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly entries: readonly ArtLibraryEntry[];
}

/** 手写条目；24 款与古典角色两组由定义 JSON 生成，见 art-library-sets.ts。 */
export const ART_LIBRARY_GROUPS: readonly ArtLibraryGroup[] = [
  {
    id: 'characters', label: ["角色设定","Characters"], entries: [
      {
        id: 'd1-shared-ruler', title: ["D1 · 四种形态拉通对比","D1 · Four-form comparison"], status: 'derived',
        description: ["赤脚基础版、无头发基础版、蓝白裙版、带装备版的正面与右侧共八个视图，使用统一角色标尺：有发赤脚基础版外观高 3.1 格，左侧 3.3 头身参照尺、右侧格子尺。四种形态按同一身体倍率放置、脚底对齐，保留头发与鞋底高度差。四种形态均为细腿定稿：在各自原稿上把腿收细约 15%，腿长与胯、膝、踝高度不变；蓝白裙以身材对齐基础版的 V3 为底，带装备以蓝白裙身体为底加丝袜裤、背包与护腕。","Eight front/right views (base, bald, dress, equipped) on the unified character ruler: the haired barefoot base stands 3.1 tiles tall beside a 3.3-head reference and a tile ruler. All forms share one body scale with aligned soles, preserving hair and boot-sole height. Every form uses the approved slim-leg sheet: legs about 15% slimmer with unchanged length and hip, knee and ankle heights."],
        evidence: ["按用户要求使用 Python 裁取现有资料并绘制统一标尺；标尺脚本不重新绘制角色。用户反馈“腿稍微粗了一点”后对比了细腿候选，确认“就是这个”（2026-10-11）；细腿重绘的输入与提示词见附件。","Python composition of existing reference artwork with a shared ruler. After the user found the legs slightly thick, the slim-leg sheets were compared and approved (2026-10-11); inputs and prompt attached."],
        images: [
          { label: ["四种形态 · 八视图共用标尺","Four forms · eight views on one ruler"], path: './art-library/d1-comparison/three-forms-shared-ruler.png', guides: './art-library/d1-comparison/three-forms-shared-ruler.guides.json' },
          { label: ["立体重绘 V1 · 八视图共用标尺（待确认）","Volumetric redraw V1 · eight views on one ruler (pending)"], path: './art-library/d1-comparison/three-forms-volumetric-shared-ruler.png', guides: './art-library/d1-comparison/three-forms-volumetric-shared-ruler.guides.json' },
          { label: ["立体重绘 V1 · 淡阴影 · 四种形态拉通对比","Volumetric redraw V1 · soft shading · four-form comparison"], path: './art-library/d1-comparison/three-forms-volumetric-soft-shared-ruler.png', guides: './art-library/d1-comparison/three-forms-volumetric-soft-shared-ruler.guides.json' },
          { label: ["立体重绘 V1 · AI 原图","Volumetric redraw V1 · raw output"], path: './art-library/d1-comparison/d1-volumetric-eight-v1.png' },
        ],
        files: [
          { label: ["细腿重绘输入与提示词","Slim-leg redraw inputs and prompt"], path: './art-library/d1-comparison/slim-legs-prompt.txt' },
          { label: ["立体重绘 V1 输入与提示词","Volumetric redraw V1 inputs and prompt"], path: './art-library/d1-comparison/volumetric-v1-prompt.txt' },
        ],
      },
      {
        id: 'd1-base', title: ["D1 · 无外服赤脚基础版","D1 · Barefoot base design"], status: 'confirmed',
        description: ["用于捏人和换装的基础造型：两件式基础内衣，去掉外服、装备和鞋子。现行版本为白色内衣细腿定稿（腿收细约 15%，腿长不变）；确认原稿为蓝色泳装。保留原独立四视图标尺，并附 Python 正侧共用标尺图，脚底对齐，按正面发顶至下巴为一个含发头高，读图约 3.23 头身；这与无头发版的颅顶测量口径不同。原确认稿及干净参考图保留。","A customization base with a two-piece base layer and bare feet. The current sheet is the approved white base layer with slim legs (about 15% slimmer, same length); the approved source wore blue swimwear. The original independent four-view ruler is retained, followed by a Python-drawn front/right ruler with aligned soles: approximately 3.23 heads, measured from hair crown to chin. This differs from the bald skull-based measurement. Approved source and clean references are retained."],
        evidence: ["指定会话「设计主角捏人方案 (2)」：用户对原图说“这个就合适”，随后要求提高画质、修正斜前视角、补充脚底。高清稿与脚底稿是按该确认制作的派生版本。","In the specified design chat, the user approved the source, then requested a clearer redraw, a corrected three-quarter view and sole references. The redraws derive from that approval."],
        images: [
          { label: ["原独立标尺 · 四视图与脚底","Original independent ruler · four views and soles"], path: './art-library/d1-base/d1-approved-swim-ruler-v1.png' },
          { label: ["统一标尺 · 读图含发顶约 3.23 头身","Unified ruler · 3.23 heads including hair"], path: './art-library/d1-base/front-right-ruler.png', guides: './art-library/d1-base/front-right-ruler.guides.json' },
          { label: ["细腿白色内衣定稿","Approved slim legs, white base layer"], path: './art-library/d1-base/d1-base-slim-legs-v1.png' },
          { label: ["立体重绘 V1 · 正面与右侧（待确认）","Volumetric redraw V1 · front and right (pending)"], path: './art-library/d1-base/d1-base-volumetric-v1.png', guides: './art-library/d1-base/d1-base-volumetric-v1.guides.json' },
          { label: ["立体重绘 V1 · 淡阴影 · 正面与右侧（待确认）","Volumetric redraw V1 · soft shading · front and right (pending)"], path: './art-library/d1-base/d1-base-volumetric-soft-v1.png', guides: './art-library/d1-base/d1-base-volumetric-soft-v1.guides.json' },
          { label: ["立体重绘 V1 · 四种形态拉通对比","Volumetric redraw V1 · four-form comparison"], path: './art-library/d1-comparison/three-forms-volumetric-shared-ruler.png', guides: './art-library/d1-comparison/three-forms-volumetric-shared-ruler.guides.json' },
          { label: ["立体重绘 V1 · 淡阴影 · 四种形态拉通对比","Volumetric redraw V1 · soft shading · four-form comparison"], path: './art-library/d1-comparison/three-forms-volumetric-soft-shared-ruler.png', guides: './art-library/d1-comparison/three-forms-volumetric-soft-shared-ruler.guides.json' },
          { label: ["四种形态拉通对比 · 立体重绘前","Four-form comparison · before volumetric redraw"], path: './art-library/d1-comparison/three-forms-shared-ruler.png', guides: './art-library/d1-comparison/three-forms-shared-ruler.guides.json' },
          { label: ["视角与脚底修订 V2 · 细腿前（蓝色）","View and sole revision V2 · before slim legs (blue)"], path: './art-library/d1-base/d1-approved-swim-angle-soles-v2.png' },
          { label: ["用户确认的原图","User-approved original"], path: './art-library/d1-base/d1-approved-swim-source.jpg' },
          { label: ["高清重绘 V1","Clear redraw V1"], path: './art-library/d1-base/d1-approved-swim-restored-v1.png' },
        ],
      },
      {
        id: 'd1-bald', title: ["D1 · 无头发基础版","D1 · Bald base"], status: 'derived',
        description: ["保留原独立四视图标尺，并附 Python 正侧共用标尺，脚底对齐，以颅顶至下巴为 1H，读图约 3.42 头身。现行版本为白色内衣细腿定稿。保留原图、四个全身视角及脚底图，用于身体建模与可替换发型。","The original independent four-view ruler is retained, followed by a Python-drawn front/right ruler with aligned soles: approximately 3.42 skull-to-chin head units. Original artwork, four body views and soles are retained for body modeling and interchangeable hairstyles."],
        evidence: ["用户在确认基础造型后要求制作“不带头发的版本”；本图为按确认稿派生，未找到对这张结果单独定稿的记录。","Requested after the base approval; this is a derivative without separate final approval."],
        images: [
          { label: ["原独立标尺 · 四视图与脚底","Original independent ruler · four views and soles"], path: './art-library/d1-bald/d1-swim-bald-ruler-v1.svg' },
          { label: ["统一标尺 · 读图颅顶约 3.42 头身","Unified ruler · 3.42 skull-based heads"], path: './art-library/d1-bald/front-right-ruler.png', guides: './art-library/d1-bald/front-right-ruler.guides.json' },
          { label: ["细腿白色内衣定稿","Approved slim legs, white base layer"], path: './art-library/d1-bald/d1-bald-slim-legs-v1.png' },
          { label: ["立体重绘 V1 · 正面与右侧（待确认）","Volumetric redraw V1 · front and right (pending)"], path: './art-library/d1-bald/d1-bald-volumetric-v1.png', guides: './art-library/d1-bald/d1-bald-volumetric-v1.guides.json' },
          { label: ["立体重绘 V1 · 淡阴影 · 正面与右侧（待确认）","Volumetric redraw V1 · soft shading · front and right (pending)"], path: './art-library/d1-bald/d1-bald-volumetric-soft-v1.png', guides: './art-library/d1-bald/d1-bald-volumetric-soft-v1.guides.json' },
          { label: ["无头发四视图与脚底 · 细腿前（蓝色）","Bald views and soles · before slim legs (blue)"], path: './art-library/d1-bald/d1-swim-bald-v1.png' },
        ],
      },
      {
        id: 'd1-bald-split', title: ["D1 · 细腿身体拆分视图","D1 · Slim-leg body views, split"], status: 'candidate',
        description: ["从无头发细腿定稿（白色两件式打底）按原像素拆出正面、右侧、背面、斜前 45° 与脚底，不重绘、不改体型；四个全身视图同一倍率（1.3 倍）、脚底对齐到同一高度，只把与画面边缘相连的底色清成纯白。另附正、右、背三张无头版：在下巴下方的颈部（原图 y=267）水平切掉头部，用作 Hyper3D 单独生成身体的输入。","Front, right, back, three-quarter and sole views cut pixel-for-pixel from the approved bald slim-leg sheet (white two-piece base layer), with no redraw or body change. The four full-body views share one scale (1.3×) and sole height; only the background connected to the image edge is cleaned to white. Three headless views cut horizontally at the neck below the chin (source y=267) are the inputs for generating the body alone in Hyper3D."],
        evidence: ["用户要求按四种形态拉通对比里的细腿版本重做身体参考，“拆好图片，放到原画资料库里面等我看看”（2026-10-11）；待用户确认。","Requested by the user for the body rebuild from the slim-leg version in the four-form comparison (2026-10-11); awaiting review."],
        images: [
          { label: ["总览 · 拆分视图与无头版","Overview · split and headless views"], path: './art-library/d1-bald/split/overview.png' },
          { label: ["正面","Front"], path: './art-library/d1-bald/split/front.png' },
          { label: ["右侧","Right"], path: './art-library/d1-bald/split/right.png' },
          { label: ["背面","Back"], path: './art-library/d1-bald/split/back.png' },
          { label: ["斜前 45°","Front 45°"], path: './art-library/d1-bald/split/front45.png' },
          { label: ["脚底","Soles"], path: './art-library/d1-bald/split/soles.png' },
          { label: ["无头 · 正面","Headless · front"], path: './art-library/d1-bald/split/front-headless.png' },
          { label: ["无头 · 右侧","Headless · right"], path: './art-library/d1-bald/split/right-headless.png' },
          { label: ["无头 · 背面","Headless · back"], path: './art-library/d1-bald/split/back-headless.png' },
        ],
      },
      {
        id: 'd1-hair', title: ["D1 · 发型试稿","D1 · Hairstyle studies"], status: 'candidate',
        description: ["黑长直、短发和双马尾的换发型参考。部分短发版本曾被要求继续修改。","Long black hair, cropped hair and twin-tail studies. Some short hairstyles were explicitly sent back for revision."],
        evidence: ["用户要求探索多个发型；不将制作请求等同于最终选型确认。","The user requested alternatives; creation requests are not final design approval."],
        images: [
          { label: ["黑长直","Long black hair"], path: './art-library/d1-hair/d1-swim-long-black-v1.png' },
          { label: ["金铜短发 V2","Copper pixie V2"], path: './art-library/d1-hair/d1-swim-pixie-v2.png' },
          { label: ["黑色短发","Black pixie"], path: './art-library/d1-hair/d1-swim-black-pixie-v1.png' },
          { label: ["黑色双马尾","Black twin tails"], path: './art-library/d1-hair/d1-swim-black-twintails-v1.png' },
        ],
      },
      {
        id: 'd1-seven', title: ["D1 · 蓝白裙七视图","D1 · Blue-white dress sheet"], status: 'confirmed',
        description: ["首图为 Python 绘制的正面＋右侧共用标尺，量的是细腿定稿：含发顶、穿靴约 3.25 头身（基础版 3.23）。它以 V3 为底（三个全身视图的头身比、肩宽、上半身体积和腰线与无外服赤脚基础版一致，服装、发色和下排细节格沿用原七视图），再把腿收细约 15%、腿长不变。较早确认的原七视图（约 3.50 头身）保留。","The Python-drawn front/right ruler measures the approved slim-leg sheet: approximately 3.25 head units including hair and boots (base: 3.23). It builds on V3, which redrew the full-body views on the barefoot base body while keeping the costume, hair colour and detail panels, with legs about 15% slimmer at the same length. The earlier approved seven-view sheet (about 3.50 heads) is retained."],
        evidence: ["精修记录明确以用户确认的七视图为依据；仓库副本与原始生成图 SHA-256 一致。V3 按用户“身材与基础版有距离”的要求用 gpt-image-2.5-sunburst 重绘（见 body-v3-prompt.txt），细腿由用户确认（见 d1-comparison/slim-legs-prompt.txt）。","The refinement record identifies the approved seven-view reference; its repository copy matches the original SHA-256. V3 was redrawn with gpt-image-2.5-sunburst after the user noted the body differed from the base (body-v3-prompt.txt); the slim legs were approved by the user (d1-comparison/slim-legs-prompt.txt)."],
        images: [
          { label: ["统一标尺 · 读图含发顶约 3.25 头身","Unified ruler · 3.25 heads including hair"], path: './art-library/d1-seven/front-right-ruler.png', guides: './art-library/d1-seven/front-right-ruler.guides.json' },
          { label: ["细腿定稿","Approved slim legs"], path: './art-library/d1-seven/character-seven-views-slim-legs-v1.png' },
          { label: ["立体重绘 V1 · 正面与右侧（待确认）","Volumetric redraw V1 · front and right (pending)"], path: './art-library/d1-seven/d1-seven-volumetric-v1.png', guides: './art-library/d1-seven/d1-seven-volumetric-v1.guides.json' },
          { label: ["立体重绘 V1 · 淡阴影 · 正面与右侧（待确认）","Volumetric redraw V1 · soft shading · front and right (pending)"], path: './art-library/d1-seven/d1-seven-volumetric-soft-v1.png', guides: './art-library/d1-seven/d1-seven-volumetric-soft-v1.guides.json' },
          { label: ["较早确认的七视图原画","Earlier approved seven-view artwork"], path: './art-library/d1-seven/character-seven-views.png' },
        ],
      },
      {
        id: 'd1-blink', title: ["D1 · 眨眼四帧","D1 · Blink frames"], status: 'derived',
        description: ["游戏眼部贴片用的眨眼帧：睁眼、半闭、将闭、闭眼。睁眼帧以头部贴图上原有的左眼为底，按蓝白裙七视图脸部特写的画风重绘；其余三帧以睁眼帧为底只移动上眼睑，内外眼角位置不变。运行时虹膜由着色器绘制，这里的虹膜只作画面参考。","Blink frames for the in-game eye decal: open, half, nearly closed and closed. The open frame repaints the head texture's original left eye in the style of the dress sheet's face close-up; the other three keep the eye corners fixed and only lower the upper lid. At runtime the iris is drawn by the shader; the painted iris is only a visual guide."],
        evidence: ["用户要求“用 openai 调用 image2.5 做一下眨眼效果”并把眨眼帧放进人物原画（2026-10-12）。gpt-image-2.5-sunburst（max）生成，输入与提示词见附件；资产链副本在 body-v2/head-look/eye-frames/。","Requested by the user (2026-10-12): draw the blink with gpt-image 2.5 and add the frames to the character art. Generated with gpt-image-2.5-sunburst (max); inputs and prompts attached; the asset-chain copy lives in body-v2/head-look/eye-frames/."],
        images: [
          { label: ["睁眼 · 半闭 · 将闭 · 闭眼","Open · half · nearly closed · closed"], path: './art-library/d1-blink/d1-blink-frames-v1.png' },
        ],
        files: [
          { label: ["输入与提示词","Inputs and prompts"], path: './art-library/d1-blink/d1-blink-prompt.txt' },
        ],
      },
      {
        id: 'd1-equipped', title: ["D1 · 带装备正侧设定","D1 · Equipped design"], status: 'confirmed',
        description: ["首图为统一标尺，量的是带装备细腿定稿：以蓝白裙的正面和右侧为身体底图，加深色丝袜裤、科技背包和双护腕，再把腿收细约 15%、腿长不变；读图含发穿靴约 3.26 头身。另附 45° 视图。较早确认的旧稿（头大、腿细长）保留在最后，不再用于比例参考。","The unified ruler measures the approved slim-leg equipped sheet: the dress front/right body with dark tights, tech backpack and wrist gauntlets, legs about 15% slimmer at the same length (about 3.26 heads with hair and boots). A 45° view is included. The earlier approved sheet (larger head, longer thin legs) is kept last and no longer used for proportions."],
        evidence: ["旧稿由 d1-comparison/README.md 登记为已确认设计。用户认为旧稿比例与其他形态差距大，按 V3 身体重绘装备后又反馈腿偏粗；在四个细腿候选中比较后，随四种形态细腿对比一起确认（2026-10-11）。gpt-image-2.5-sunburst（max）生成，输入与提示词见附件。","The earlier sheet is recorded as approved. After the gear was redrawn on the V3 body, the user found the legs thick; the slim-leg version was approved with the four-form comparison (2026-10-11). Generated with gpt-image-2.5-sunburst (max); inputs and prompts attached."],
        images: [
          { label: ["统一标尺 · 读图含发顶约 3.26 头身","Unified ruler · 3.26 heads including hair"], path: './art-library/d1-equipped/front-right-ruler.png', guides: './art-library/d1-equipped/front-right-ruler.guides.json' },
          { label: ["细腿定稿 · 正面与右侧","Approved slim legs · front and right"], path: './art-library/d1-equipped/d1-equipped-slim-legs-v1.png' },
          { label: ["立体重绘 V1 · 正面与右侧（待确认）","Volumetric redraw V1 · front and right (pending)"], path: './art-library/d1-equipped/d1-equipped-volumetric-v1.png', guides: './art-library/d1-equipped/d1-equipped-volumetric-v1.guides.json' },
          { label: ["立体重绘 V1 · 淡阴影 · 正面与右侧（待确认）","Volumetric redraw V1 · soft shading · front and right (pending)"], path: './art-library/d1-equipped/d1-equipped-volumetric-soft-v1.png', guides: './art-library/d1-equipped/d1-equipped-volumetric-soft-v1.guides.json' },
          { label: ["45° 视图","45° view"], path: './art-library/d1-equipped/d1-equipped-45-v1.png' },
          { label: ["较早确认的旧稿 · 比例不同，不作参考","Earlier approved sheet · different proportions"], path: './art-library/d1-equipped/slim-legs-front-right-v1.png' },
        ],
        files: [
          { label: ["装备重绘输入与提示词","Gear redraw inputs and prompt"], path: './art-library/d1-equipped/d1-equipped-body-v2-prompt.txt' },
          { label: ["细腿与 45° 输入与提示词","Slim legs and 45° inputs and prompts"], path: './art-library/d1-equipped/d1-equipped-slim-legs-v1-prompt.txt' },
        ],
      },
      {
        id: 'd1-head-ratio-study', title: ["D1 · 四种头身比例对照","D1 · Head-ratio study"], status: 'candidate',
        description: ["同一套带装备设计按四种常见头身重画：超 Q 版 2.5、Q 版 RPG 4、日系少女 6、写实成人 7.5，与现稿 3.3 头身并排；外观高统一为 3.1 格，鞋底对齐。仅作比例参考，不替换现有设定。","The same equipped design redrawn at four common head ratios (2.5 super-deformed, 4 chibi RPG, 6 anime teen, 7.5 realistic adult) beside the current 3.3-head sheet, all at 3.1 tiles. Reference only."],
        evidence: ["用户问“正常别人都是什么样的比例”后要求“这 4 个你都绘制给我看看”。gpt-image-2.5-sunburst（max）以带装备 V2（细腿前）为输入逐档生成，输入与提示词见附件。","Requested by the user after asking what proportions other games use. Generated with gpt-image-2.5-sunburst (max) from equipped V2; inputs and prompts attached."],
        images: [
          { label: ["五档对照 · 统一标尺","Five ratios · unified ruler"], path: './art-library/d1-equipped/head-ratio-study/head-ratio-overview.png' },
          { label: ["超 Q 版 · 2.5 头身","Super-deformed · 2.5 heads"], path: './art-library/d1-equipped/head-ratio-study/d1-heads-2.5.png' },
          { label: ["Q 版 RPG · 4 头身","Chibi RPG · 4 heads"], path: './art-library/d1-equipped/head-ratio-study/d1-heads-4.png' },
          { label: ["日系少女 · 6 头身","Anime teen · 6 heads"], path: './art-library/d1-equipped/head-ratio-study/d1-heads-6.png' },
          { label: ["写实成人 · 7.5 头身","Realistic adult · 7.5 heads"], path: './art-library/d1-equipped/head-ratio-study/d1-heads-7.5.png' },
        ],
        files: [
          { label: ["输入与提示词","Inputs and prompts"], path: './art-library/d1-equipped/head-ratio-study/prompts.txt' },
        ],
      },
      {
        id: 'grassy-d1-male-comparison', title: ["Grassy 男主定稿 · 四种形态拉通对比","Grassy hero final · Four-form comparison"], status: 'derived',
        description: ["男主定稿：B8 鹅蛋脸，深棕短发，与 D1 同画风、同身体比例。以「D1 · 四种形态拉通对比」为底稿逐格绘制赤脚基础版（白色背心短裤）、无头发版、红毛衣版、带装备版，八个视图同一张图、同一倍率。统一角色标尺：有发赤脚基础版 = 3.1 格，下颚、胸、腰、膝线贯穿四种形态。初版含发头高 1.06 格（1.13 H）、腿偏短，已用 Python 以下巴为基点把头连发缩小约 9%、拉长腿部补足总高，下颚线 2.13 格、膝线 0.70 格，与 D1 的 2.14、0.72 一致；读图含发约 3.2 头身。男孩不用 D1 的细腿：腿部再横向加粗 12%，膝宽 0.25 格，比 D1 的 0.19 格结实约 30%。红毛衣与带装备视图另下移上半身 7 px，与基础版的下巴、肩、膝对齐。","Final hero: B8 egg-shaped face and dark-brown short hair in D1's art style and body proportions. Drawn slot by slot over the D1 four-form comparison: barefoot base (white tank top and shorts), bald, red sweater and equipped, eight views on one sheet at one scale. Unified ruler with the base at 3.1 tiles. The first sheet's head with hair measured 1.13 H with short legs; a deterministic Python edit shrank the head about 9% around the chin and lengthened the legs, bringing chin and knee lines to 2.13 and 0.70 tiles (D1: 2.14 and 0.72); about 3.2 heads with hair. The boy's legs were then widened 12% (knee 0.25 tiles vs D1's slim 0.19)."],
        evidence: ["用户从脸型试画中指定“上身试画 · B8 鹅蛋八视图就这个作为最终的”，并要求删除中间产物。生成步骤：脸型设计图 → 脸线精修 → 取 B8 脸型 → 按 D1 底稿绘制八视图 → 按用户“看上去是头”的意见用 Python 修正头身 → 按“男的不要细腿”加粗腿部，步骤与提示词见附件。","The user chose the B8 egg-face eight-view fit test as final and asked to delete intermediates. Steps: face-shape sheet, contour cleanup, B8 crop, eight views over the D1 guide; prompts attached."],
        images: [
          { label: ["四种形态 · 统一标尺","Four forms · unified ruler"], path: './art-library/grassy-d1-male-comparison/three-forms-shared-ruler.png', guides: './art-library/grassy-d1-male-comparison/three-forms-shared-ruler.guides.json' },
          { label: ["男女主角对比 · 统一标尺","Hero and heroine · unified ruler"], path: './art-library/grassy-d1-male-comparison/male-female-shared-ruler.png', guides: './art-library/grassy-d1-male-comparison/male-female-shared-ruler.guides.json' },
          { label: ["八视图定稿","Final eight-view artwork"], path: './art-library/grassy-d1-male/grassy-d1-male-eight-final.png' },
          { label: ["基础版 · 统一标尺","Base · unified ruler"], path: './art-library/grassy-d1-male/grassy-d1-male-base-front-right-ruler.png', guides: './art-library/grassy-d1-male/grassy-d1-male-base-front-right-ruler.guides.json' },
          { label: ["无头发版 · 统一标尺","Bald · unified ruler"], path: './art-library/grassy-d1-male/grassy-d1-male-bald-front-right-ruler.png', guides: './art-library/grassy-d1-male/grassy-d1-male-bald-front-right-ruler.guides.json' },
          { label: ["红毛衣 · 统一标尺","Red sweater · unified ruler"], path: './art-library/grassy-d1-male/grassy-d1-male-outfit-front-right-ruler.png', guides: './art-library/grassy-d1-male/grassy-d1-male-outfit-front-right-ruler.guides.json' },
          { label: ["带装备版 · 统一标尺","Equipped · unified ruler"], path: './art-library/grassy-d1-male/grassy-d1-male-equipped-front-right-ruler.png', guides: './art-library/grassy-d1-male/grassy-d1-male-equipped-front-right-ruler.guides.json' },
        ],
        files: [
          { label: ["生成步骤与提示词","Steps and prompts"], path: './art-library/grassy-d1-male/grassy-d1-male-eight-final-prompt.txt' },
          { label: ["B8 脸型参考","B8 face reference"], path: './art-library/grassy-d1-male/grassy-d1-male-face-b8-ref.png' },
        ],
      },
      {
        id: 'grassy-shared-ruler', title: ["Grassy 日系版 · 三种形态拉通对比","Grassy anime · Three-form comparison"], status: 'derived',
        description: ["日系男主年轻版三种形态的正面与右侧共六个视图，使用统一角色标尺（有发赤脚基础版 = 3.1 格，3.3 头身参照）：基础版与无头发版同画布、同倍率；红毛衣稿按基础版生成时的输出倍率换算到同一身体，脚底（鞋底）对齐。下颚、胸、腰、膝线在三形态间对齐。","Six front/right views of the younger anime male's three forms on the unified character ruler (haired barefoot base = 3.1 tiles, 3.3-head reference); shared body scale, aligned soles, matching chin, chest, waist and knee lines."],
        evidence: ["Python 按角色标尺标准绘制，不重新绘制角色；脚本见 assets/concepts/d1-proportion-rulers。","Drawn with Python to the character ruler standard; characters are not redrawn."],
        images: [
          { label: ["三种形态 · 统一标尺","Three forms · unified ruler"], path: './art-library/grassy-comparison/three-forms-shared-ruler.png', guides: './art-library/grassy-comparison/three-forms-shared-ruler.guides.json' },
        ],
      },
      {
        id: 'grassy-base', title: ["Grassy 日系版 · 无外服赤脚基础版","Grassy anime · Barefoot base"], status: 'derived',
        description: ["年轻版日系男主的捏人基础造型：圆脸大眼、约 13 岁的少年气质；去掉红毛衣、牛仔裤和球鞋，换成与 D1 同系的蓝色背心＋短裤，赤脚并附左右脚底。统一标尺读图含发约 3.31 头身。旧的偏成熟 v1 保留在后面。","Younger anime male customization base: round face, big eyes, about 13; blue two-piece base layer like D1, barefoot with soles. Unified-ruler reading about 3.31 heads with hair. The older, more mature v1 is kept below."],
        evidence: ["用户认为日系 v1“太丑”，要求“年轻一些更可爱”；以年轻版红毛衣稿为唯一输入，gpt-image-2.5-sunburst（max）生成。待用户确认。","The user found v1 unattractive and asked for a younger, cuter look; generated from the young red-sweater sheet with gpt-image-2.5-sunburst (max). Pending review."],
        images: [
          { label: ["统一标尺 · 读图含发顶约 3.31 头身","Unified ruler · 3.31 heads including hair"], path: './art-library/grassy-base/grassy-anime-young-base-v2-front-right-ruler.png', guides: './art-library/grassy-base/grassy-anime-young-base-v2-front-right-ruler.guides.json' },
          { label: ["年轻版 v2 · 四视图与脚底","Young v2 · four views and soles"], path: './art-library/grassy-base/grassy-anime-young-base-v2.png' },
          { label: ["旧版 v1 · 偏成熟，已替换","Older v1 · too mature, replaced"], path: './art-library/grassy-base/grassy-anime-base-v1.png' },
        ],
        files: [
          { label: ["v2 输入与提示词","v2 inputs and prompt"], path: './art-library/grassy-base/grassy-anime-young-base-v2-prompt.txt' },
          { label: ["v1 输入与提示词","v1 inputs and prompt"], path: './art-library/grassy-base/grassy-anime-base-v1-prompt.txt' },
        ],
      },
      {
        id: 'grassy-bald', title: ["Grassy 日系版 · 无头发基础版","Grassy anime · Bald base"], status: 'derived',
        description: ["由年轻版赤脚基础版去掉头发，保留眉毛、耳朵、身体与脚底，用于身体建模与可替换发型。统一标尺下与基础版同一身体倍率；读图颅顶至下巴约 3.85 头身，与含发口径不同。旧版 v1 保留在后面。","Hair removed from the young base, keeping brows, ears, body and soles. Same body scale as the base on the unified ruler; skull-to-chin reading about 3.85 heads. The older v1 is kept below."],
        evidence: ["按 D1 无头发版做法派生，gpt-image-2.5-sunburst（max）生成。待用户确认。","Derived like the D1 bald sheet with gpt-image-2.5-sunburst (max). Pending review."],
        images: [
          { label: ["统一标尺 · 读图颅顶约 3.85 头身","Unified ruler · 3.85 skull-based heads"], path: './art-library/grassy-bald/grassy-anime-young-bald-v2-front-right-ruler.png', guides: './art-library/grassy-bald/grassy-anime-young-bald-v2-front-right-ruler.guides.json' },
          { label: ["年轻版 v2 · 无头发四视图与脚底","Young v2 · bald views and soles"], path: './art-library/grassy-bald/grassy-anime-young-bald-v2.png' },
          { label: ["旧版 v1 · 偏成熟，已替换","Older v1 · too mature, replaced"], path: './art-library/grassy-bald/grassy-anime-bald-v1.png' },
        ],
        files: [
          { label: ["v2 输入与提示词","v2 inputs and prompt"], path: './art-library/grassy-bald/grassy-anime-young-bald-v2-prompt.txt' },
          { label: ["v1 输入与提示词","v1 inputs and prompt"], path: './art-library/grassy-bald/grassy-anime-bald-v1-prompt.txt' },
        ],
      },
      {
        id: 'grassy-anime', title: ["Grassy 日系版 · 红毛衣四视图","Grassy anime · Red sweater sheet"], status: 'derived',
        description: ["年轻版日系男主：圆脸、大眼、小下巴，约 13 岁的可爱少年；栗棕层次短发、红色麻花针织毛衣、卷边牛仔裤、米白球鞋，正面、右侧、背面、前侧约 45°。统一标尺读图含发、穿鞋约 3.31 头身。它是两张基础版的生成依据；旧的偏成熟原稿保留在后面，3D 卡通男孩版另列条目。","Younger anime Grassy: round face, big eyes, small chin, about 13; red cable-knit sweater, rolled jeans, cream sneakers, four views. Unified-ruler reading about 3.31 heads. Source for both base sheets; the older mature sheet is kept below."],
        evidence: ["用户认为日系 v1“太丑”，要求“年轻一些更可爱”；以 core-cast/grassy-human-classic-handsome.png 为唯一输入，gpt-image-2.5-sunburst（max）重绘年龄与脸部，服装、站姿、高度不变。待用户确认。","Redrawn for a younger, cuter face from the older sheet with gpt-image-2.5-sunburst (max); outfit, pose and height unchanged. Pending review."],
        images: [
          { label: ["统一标尺 · 读图含发顶约 3.31 头身","Unified ruler · 3.31 heads including hair"], path: './art-library/grassy-anime/grassy-anime-young-v2-front-right-ruler.png', guides: './art-library/grassy-anime/grassy-anime-young-v2-front-right-ruler.guides.json' },
          { label: ["年轻版 v2 · 四视图","Young v2 · four views"], path: './art-library/grassy-anime/grassy-anime-young-v2.png' },
          { label: ["旧版 · 偏成熟原稿","Older mature sheet"], path: './art-library/core-cast/grassy-human-classic-handsome.png' },
        ],
        files: [
          { label: ["v2 输入与提示词","v2 inputs and prompt"], path: './art-library/grassy-anime/grassy-anime-young-v2-prompt.txt' },
        ],
      },
      {
        id: 'grassy-boy-shared-ruler', title: ["Grassy 男孩版 · 三种形态拉通对比","Grassy boy · Three-form comparison"], status: 'derived',
        description: ["男孩版（3D 卡通黑发）三种形态的正面与右侧共六个视图，使用统一角色标尺：有发赤脚基础版外观高 3.1 格，左侧 3.3 头身参照尺、右侧格子尺；三形态同一身体倍率、脚底对齐。与日系版并列保留，待选型。","Six front/right views of the 3D-cartoon boy's three forms on the unified character ruler: haired barefoot base = 3.1 tiles, 3.3-head reference, shared body scale and aligned soles. Kept alongside the anime version pending selection."],
        evidence: ["用户选择“两套都保留”；Python 按角色标尺标准绘制，不重新绘制角色。","The user chose to keep both sets; drawn with Python to the character ruler standard without redrawing characters."],
        images: [
          { label: ["三种形态 · 统一标尺","Three forms · unified ruler"], path: './art-library/grassy-boy-comparison/three-forms-shared-ruler.png', guides: './art-library/grassy-boy-comparison/three-forms-shared-ruler.guides.json' },
        ],
      },
      {
        id: 'grassy-boy-base', title: ["Grassy 男孩版 · 赤脚基础版与无头发版","Grassy boy · Barefoot and bald bases"], status: 'derived',
        description: ["以已确认的红毛衣四向母版为底，换成与 D1 同系的蓝色背心＋短裤、赤脚并附脚底；另有去掉头发的无头发版。统一标尺读图：含发约 3.06 头身，颅顶约 3.62 头身，均低于 3.3 设计目标（头偏大）。","Built on the approved red-sweater turnaround: blue two-piece base layer like D1, barefoot with soles, plus a hairless version. Unified-ruler readings: about 3.06 heads with hair and 3.62 skull-based, both below the 3.3 target (large head)."],
        evidence: ["gpt-image-2.5-sunburst（max）生成，输入与提示词见附件；最初的光上身版本在做无头发版时被内容审核拦截，改为两件式。待用户确认。","Generated with gpt-image-2.5-sunburst (max); a bare-torso first try was blocked by moderation at the bald step. Pending user review."],
        images: [
          { label: ["基础版统一标尺 · 读图含发顶约 3.06 头身","Base · unified ruler, 3.06 heads with hair"], path: './art-library/grassy-boy/grassy-boy-base-front-right-ruler.png', guides: './art-library/grassy-boy/grassy-boy-base-front-right-ruler.guides.json' },
          { label: ["基础版四视图与脚底","Base · four views and soles"], path: './art-library/grassy-boy/grassy-boy-base-v1.png' },
          { label: ["无头发版统一标尺 · 读图颅顶约 3.62 头身","Bald · unified ruler, 3.62 skull-based heads"], path: './art-library/grassy-boy/grassy-boy-bald-front-right-ruler.png', guides: './art-library/grassy-boy/grassy-boy-bald-front-right-ruler.guides.json' },
          { label: ["无头发四视图与脚底","Bald · four views and soles"], path: './art-library/grassy-boy/grassy-boy-bald-v1.png' },
        ],
        files: [
          { label: ["基础版输入与提示词","Base inputs and prompt"], path: './art-library/grassy-boy/grassy-boy-base-v1-prompt.txt' },
          { label: ["无头发版输入与提示词","Bald inputs and prompt"], path: './art-library/grassy-boy/grassy-boy-bald-v1-prompt.txt' },
        ],
      },
      {
        id: 'grassy-human', title: ["Grassy · 红毛衣人形","Grassy · Red sweater form"], status: 'confirmed',
        description: ["保留既有人形四方向母版。右侧为确认原图，其他方向及角色卡按确认造型绘制。","The established four-view master: approved right profile, with derived views and character card."],
        evidence: ["public/characters/human/SOURCE.md 与历史来源说明记录右侧母版和最终四向参考。","Human character source records identify the approved right master and the final reference set."],
        images: [
          { label: ["统一标尺 · 读图含发顶约 3.06 头身","Unified ruler · 3.06 heads including hair"], path: './art-library/grassy-boy/grassy-boy-clothed-front-right-ruler.png', guides: './art-library/grassy-boy/grassy-boy-clothed-front-right-ruler.guides.json' },
          { label: ["四向等比排版","Four views on one sheet"], path: './art-library/grassy-boy/grassy-boy-clothed-four-views.png' },
          { label: ["右侧母版","Right master"], path: './characters/human/turnaround-master-v2/right.png' },
          { label: ["正面","Front"], path: './characters/human/turnaround-master-v2/front.png' },
          { label: ["背面","Back"], path: './characters/human/turnaround-master-v2/back.png' },
          { label: ["左侧","Left"], path: './characters/human/turnaround-master-v2/left.png' },
          { label: ["角色卡","Character card"], path: './characters/human/grassy-human-card.png' },
        ],
      },
      {
        id: 'grassy-pelican', title: ["Grassy · 鹈鹕角色卡","Grassy · Pelican card"], status: 'derived',
        description: ["从确认的双形态角色卡独立绘制，中性白羽毛、黄色喙。","A standalone card derived from the approved dual-form design, with white feathers and a yellow bill."],
        evidence: ["鹈鹕 SOURCE.md 明确说明来源为已确认角色卡；原画不等同于实时模型。","The Pelican source record identifies the approved parent design; artwork is distinct from the real-time model."],
        images: [
          { label: ["鹈鹕角色卡","Pelican card"], path: './characters/pelican/grassy-pelican-card.png' },
        ],
      },
      {
        id: 'tibo-human', title: ["Tibo · 人形四方向","Tibo · Human references"], status: 'confirmed',
        description: ["人形四方向绘制参考，保留棕色发型、黑帽衫与重置徽章。","Four illustrated human references with brown hair, black hoodie and reset badge."],
        evidence: ["Tibo 来源说明明确为“基于已批准人形四向稿整理”。","Tibo's source record explicitly states that these derive from the approved human sheet."],
        images: [
          { label: ["已批准人形四向总图","Approved human turnaround"], path: './art-library/tibo-human/tibo-human-turnaround.png' },
          { label: ["正面","Front"], path: './characters/tibo/human/reference-front.png' },
          { label: ["右侧","Right"], path: './characters/tibo/human/reference-right.png' },
          { label: ["背面","Back"], path: './characters/tibo/human/reference-back.png' },
          { label: ["左侧","Left"], path: './characters/tibo/human/reference-left.png' },
        ],
      },

      {
        id: 'npc-identity-masters', title: ["Sam / Tibo · 早期身份母稿","Sam / Tibo · Early identity masters"], status: 'confirmed',
        description: ["用于后续动物形态设计的早期人形身份参考，保留历史选型；不替代新版人形四向稿。","Early human identity references selected for subsequent animal designs; retained as historical choices, not replacements for the later human turnarounds."],
        evidence: ["「第一章怪物」用户重新附上这两张图，说“基于这个绘制形象,你来吧”（01a10833-cdd2-7571-97fe-0ba4d67a6d12）。","The user reattached both portraits and requested that the character designs be based on them."],
        images: [
          { label: ["Sam 早期身份稿","Sam early portrait"], path: './art-library/npc-identity-masters/sam-front.png' },
          { label: ["Tibo 早期身份稿","Tibo early portrait"], path: './art-library/npc-identity-masters/tibo-front.png' },
        ],
      },
      {
        id: 'sam-human-master', title: ["Sam · 已选人形四向总图","Sam · Selected human turnaround"], status: 'confirmed',
        description: ["修订胸章方向后的人形四向总图，保留作为人形制作依据。","Human turnaround after the chest-emblem correction, retained as the selected production reference."],
        evidence: ["「第一章怪物」展示修订后的 Sam/Tibo 四向总图后，用户回复“可以”（01a10d1d-127f-79a1-b656-4516361c3cbc），随后要求“先完成sam”。","The user accepted the revised Sam/Tibo turnarounds and then requested Sam production first."],
        images: [
          { label: ["Sam 人形四向总图","Sam human turnaround"], path: './art-library/sam-human-master/sam-human-turnaround.png' },
        ],
      },
      {
        id: 'npc-animal-masters', title: ["Sam 白鼬 / Tibo 鼹鼠 · 已选母稿","Sam stoat / Tibo mole · Selected masters"], status: 'confirmed',
        description: ["Sam 白鼬 V4 与 Tibo 鼹鼠 V3 正面原稿。作为当时采纳的制作依据保存，后续四向图与模型不因此视为逐项验收。","Sam stoat V4 and Tibo mole V3 front masters, selected as production references; this does not approve later views or models."],
        evidence: ["归档会话「第一章怪物」：Sam V4 修订后，用户说“开始完成这2个角色的制作”（01a1083a-8540-79d1-b7fd-f3cccd5948b0），随后明确授权完成；上传记录对应 Sam V4 与 Tibo V3。","After Sam V4 was revised, the user requested production of both characters. The production record identifies Sam V4 and Tibo V3."],
        images: [
          { label: ["Sam 白鼬 V4","Sam stoat V4"], path: './art-library/npc-animal-masters/sam-the-model-router-front.png' },
          { label: ["Tibo 鼹鼠 V3","Tibo mole V3"], path: './art-library/npc-animal-masters/tibo-the-reset-master-front.png' },
        ],
      },

      {
        id: 'npc-references', title: ["Sam / Tibo · 其他形态参考","Sam / Tibo · Other forms"], status: 'candidate',
        description: ["Sam 人形与白鼬、Tibo 鼹鼠的四方向原画，均已用于制作；本轮未找到逐套明确的最终确认记录。","Four-view references for Sam's human and stoat forms and Tibo's mole form. Used for production, but explicit approval for each set was not located."],
        evidence: ["来源文件记录用途和生成来源，不将已用于建模自动标为已确认。","Production use and source records do not automatically establish final approval."],
        images: [
          { label: ["Sam 人形 · 正面","Sam human · Front"], path: './characters/sam/human/reference-front.png' },
          { label: ["Sam 人形 · 右侧","Sam human · Right"], path: './characters/sam/human/reference-right.png' },
          { label: ["Sam 人形 · 背面","Sam human · Back"], path: './characters/sam/human/reference-back.png' },
          { label: ["Sam 人形 · 左侧","Sam human · Left"], path: './characters/sam/human/reference-left.png' },
          { label: ["Sam 白鼬 · 正面","Sam stoat · Front"], path: './characters/sam/reference-front.png' },
          { label: ["Sam 白鼬 · 右侧","Sam stoat · Right"], path: './characters/sam/reference-right.png' },
          { label: ["Sam 白鼬 · 背面","Sam stoat · Back"], path: './characters/sam/reference-back.png' },
          { label: ["Sam 白鼬 · 左侧","Sam stoat · Left"], path: './characters/sam/reference-left.png' },
          { label: ["Tibo 鼹鼠 · 正面","Tibo mole · Front"], path: './characters/tibo/reference-front.png' },
          { label: ["Tibo 鼹鼠 · 右侧","Tibo mole · Right"], path: './characters/tibo/reference-right.png' },
          { label: ["Tibo 鼹鼠 · 背面","Tibo mole · Back"], path: './characters/tibo/reference-back.png' },
          { label: ["Tibo 鼹鼠 · 左侧","Tibo mole · Left"], path: './characters/tibo/reference-left.png' },
        ],
      },
    ],
  },
  {
    id: 'enemies', label: ["敌人设定","Enemies"], entries: [
      {
        id: 'omi', title: ["欧米 OMI-01","OMI-01"], status: 'confirmed',
        description: ["确认图中间的大头短肢双钳机器人，白色与藏蓝装甲、青色腹板、琥珀单环眼。","The central compact dual-gripper robot with white/navy armour, teal abdomen and amber eye ring."],
        evidence: ["欧米制作记录明确采用已确认造型；敌人来源文件指向此原图。","The OMI production and source records identify this approved design."],
        images: [
          { label: ["确认造型","Approved design"], path: './art-library/omi/approved-character.png' },
        ],
      },
      {
        id: 'omi-actions', title: ["欧米 · 动作与技能","OMI · Actions and skills"], status: 'derived',
        description: ["基础动作、夹爪横扫、突进夹击分镜，按确认角色造型制作。","Basic actions, clamp sweep and dash-clamp sheets derived from the approved robot."],
        evidence: ["omi-01-actions 生成记录锁定 approved-character.png 造型；动作图不单独宣称已批准。","Generation records lock the approved character; the action sheets are not independently marked approved."],
        images: [
          { label: ["基础动作","Basic actions"], path: './art-library/omi-actions/basic-actions.png' },
          { label: ["夹爪横扫","Clamp sweep"], path: './art-library/omi-actions/skill-01-clamp-sweep.png' },
          { label: ["突进夹击","Dash clamp"], path: './art-library/omi-actions/skill-02-dash-clamp.png' },
        ],
      },
      {
        id: 'watch-wasp', title: ["哨蜂 · 白壳无人机","Watch Wasp · White drone"], status: 'confirmed',
        description: ["白壳四旋翼确认参考与定稿多视图。","Approved white quadrotor reference and final multi-view design."],
        evidence: ["白壳无人机制作记录明确批准参考造型，正式来源文件指定 compact-drone-views.png 为美术定稿。","Drone production records confirm the design; the source names compact-drone-views.png as the final artwork."],
        images: [
          { label: ["批准参考","Approved reference"], path: './art-library/watch-wasp/approved-reference.png' },
          { label: ["定稿多视图","Final views"], path: './art-library/watch-wasp/compact-drone-views.png' },
        ],
      },
      {
        id: 'wasp-actions', title: ["哨蜂 · 飞行与铝热剂","Watch Wasp · Flight and thermite"], status: 'derived',
        description: ["定稿无人机的倾斜飞行与铝热剂攻击设定。","Tilted flight and thermite attack studies based on the final drone."],
        evidence: ["配套概念图随确认无人机方案保存，区别于实际模型渲染。","Companion studies saved with the approved drone design, distinct from model renders."],
        images: [
          { label: ["倾斜飞行","Tilted flight"], path: './characters/enemies/watch-wasp/flight-concept.png' },
          { label: ["铝热剂攻击","Thermite attack"], path: './characters/enemies/watch-wasp/thermite-concept.png' },
        ],
      },
      {
        id: 'line-hound', title: ["巡线犬 · 正侧面","Line Hound · Front and side"], status: 'confirmed',
        description: ["巡线犬造型参考。","Line Hound character reference."],
        evidence: ["来源说明明确为“项目已确认的正面／侧面设定”。","The source explicitly identifies the approved front/side design."],
        images: [
          { label: ["正侧面原画","Front/side artwork"], path: './characters/enemies/line-hound/reference.png' },
        ],
      },
      {
        id: 'loadmaster', title: ["搬山 · 正侧面","Loadmaster · Front and side"], status: 'candidate',
        description: ["建模采用的轮式重型机械角色参考。","Wheeled heavy robot reference used for modeling."],
        evidence: ["已找到制作来源，但没有将原画单独标为最终确认的记录。","Production provenance exists; separate final artwork approval was not located."],
        images: [
          { label: ["正侧面原画","Front/side artwork"], path: './art-library/loadmaster/loadmaster.png' },
        ],
      },
    ],
  },
  {
    id: 'equipment', label: ["装备与技能","Equipment and skills"], entries: [
      {
        id: 'npc-weapon-selection', title: ["Sam / Tibo · 已选武器方案","Sam / Tibo · Selected weapons"], status: 'confirmed',
        description: ["确认组合为 Sam B 路由核心与 Tibo A 重置锤。图中其余候选未被一并确认；之后 Sam 又明确改为平时手持法杖、仅大招升至头顶。","The selected combination is Sam B routing core and Tibo A reset hammer. Other alternatives were not approved; Sam later received a handheld-staff requirement outside his ultimate."],
        evidence: ["「第一章怪物」推荐该组合后，用户说“可以按照这个继续开发,这样他们就有普通攻击了”（01a10fed-54a6-7c42-b6d9-dc0ccc919cfa）。记录的是该阶段的已采纳方案。","After the combination was recommended, the user approved continuing development with it for their basic attacks. This records the selected design at that stage."],
        images: [
          { label: ["四案对照 · 已选 Sam B / Tibo A","Four alternatives · Sam B / Tibo A selected"], path: './art-library/npc-weapon-selection/weapon-concepts.png' },
        ],
      },
      {
        id: 'grassy-equipment', title: ["Grassy · 三张装备定稿","Grassy · Equipment designs"], status: 'confirmed',
        description: ["推进飞行、Codex 键盘攻击和日常键盘背负。","Powered flight, Codex keyboard attack and stowed keyboard."],
        evidence: ["人形来源说明明确为“三张用户确认”并授权收入资料库。","The character source explicitly records three user-approved images authorized for the library."],
        images: [
          { label: ["推进飞行","Powered flight"], path: './characters/human/equipment-concepts/flight.png' },
          { label: ["Codex 攻击","Codex attack"], path: './characters/human/equipment-concepts/codex-attack.png' },
          { label: ["键盘背负","Stowed keyboard"], path: './characters/human/equipment-concepts/keyboard-stowed.png' },
        ],
      },
      {
        id: 'keyboard-combo', title: ["单手键盘连击","One-handed keyboard combo"], status: 'confirmed',
        description: ["单手握键盘短端挥击，替代早期双手方案。","One-handed swings holding the keyboard end, replacing the earlier two-handed concept."],
        evidence: ["人形来源说明明确当前使用已确认的单手版本。","The character source identifies the approved one-handed version."],
        images: [
          { label: ["单手连击","One-handed combo"], path: './characters/human/equipment-concepts/combat-v2/keyboard-one-hand-combo.png' },
        ],
      },
      {
        id: 'combat-studies', title: ["Grassy · 技能效果试稿","Grassy · Combat studies"], status: 'candidate',
        description: ["光弹、虫群、超载和空中攻击方案；保留版本，不把较新文件自动视为定稿。","Projectile, bug, overload and airborne concepts; newer files are not automatically final designs."],
        evidence: ["现有角色图库收录；超载 V5 说明明确为设计预览。本轮未定位这些效果图逐项确认记录。","Present in the existing gallery; overload V5 is explicitly a preview. Individual approvals were not established."],
        images: [
          { label: ["Codex 光弹","Codex projectile"], path: './characters/human/equipment-concepts/combat-v2/codex-barrage.png' },
          { label: ["Bug 虫群","Bug swarm"], path: './characters/human/equipment-concepts/combat-v2/bug-swarm.png' },
          { label: ["服务器超载 V2","Server overload V2"], path: './characters/human/equipment-concepts/combat-v2/server-overload.png' },
          { label: ["服务器超载 V4","Server overload V4"], path: './characters/human/equipment-concepts/combat-v4/server-overload.png' },
          { label: ["服务器超载 V5","Server overload V5"], path: './characters/human/equipment-concepts/combat-v5/server-overload.png' },
          { label: ["空中键盘","Airborne keyboard"], path: './characters/human/equipment-concepts/combat-v3/airborne-keyboard.png' },
          { label: ["空中 Codex","Airborne Codex"], path: './characters/human/equipment-concepts/combat-v3/airborne-codex.png' },
          { label: ["空中 Bug","Airborne Bug"], path: './characters/human/equipment-concepts/combat-v3/airborne-bug.png' },
          { label: ["空中超载","Airborne overload"], path: './characters/human/equipment-concepts/combat-v3/airborne-overload.png' },
        ],
      },
      {
        id: 'd1-outfits', title: ["D1 · 服装探索","D1 · Costume studies"], status: 'candidate',
        description: ["六套服装、三套修订、星纹长袍 V2/V3，以及最新 D/E 发型服饰组合。V2 曾被指出比例偏长；V3 和新组合仍待确认，不替代已确认身体底稿。","Six outfits, three revisions, star robe V2/V3 and new D/E hairstyle-costume combinations. V2 was criticized for elongated proportions; V3 and the new sets await approval."],
        evidence: ["指定会话中仍在修改服装与比例，尚无最终选定结果。","The specified chat continues revising these outfits and proportions; no final selection is recorded."],
        images: [
          { label: ["星纹长袍 · 身体底稿修订 V3","Star robe · Source-fit V3"], path: './art-library/d1-outfits/d1-star-robe-source-fit-v3.png' },
          { label: ["服装与发型组合 D","Outfit and hairstyle set D"], path: './art-library/d1-outfits/d1-wardrobe-d-v1.png' },
          { label: ["服装与发型组合 E","Outfit and hairstyle set E"], path: './art-library/d1-outfits/d1-wardrobe-e-v1.png' },
          { label: ["六套服装","Six costumes"], path: './art-library/d1-outfits/d1-six-outfits-v1.png' },
          { label: ["三套服装修订","Three costume revisions"], path: './art-library/d1-outfits/d1-three-outfits-v2.png' },
          { label: ["星纹长袍 V2","Star robe V2"], path: './art-library/d1-outfits/d1-star-robe-four-views-v2.png' },
        ],
      },
      {
        id: 'npc-skills', title: ["鹈鹕与 NPC · 技能参考","Pelican and NPC · Skill studies"], status: 'candidate',
        description: ["鹈鹕普通攻击与技能、光子大招，以及 Sam/Tibo 技能图。","Pelican attacks, Photon ultimate and Sam/Tibo skill sheets."],
        evidence: ["绘图资料已保存；本轮未核实每张结果的最终确认记录。","Artwork is retained; final approval was not established for each image."],
        images: [
          { label: ["鹈鹕攻击与技能","Pelican attacks"], path: './characters/pelican/skill-concepts/normal-and-three-skills-v1.png' },
          { label: ["光子群大招","Photon swarm"], path: './characters/pelican/skill-concepts/photon-swarm-ultimate-v1.png' },
          { label: ["Sam 技能","Sam skills"], path: './art-library/npc-skills/sam-skills-v1.png' },
          { label: ["Tibo 技能","Tibo skills"], path: './art-library/npc-skills/tibo-skills-v1.png' },
        ],
      },
    ],
  },
  {
    id: 'scenes', label: ["场景与建筑","Scenes and buildings"], entries: [
      {
        id: 'ai-city-final-home-v1', title: ["AI 城市 · 能量门复合住宅 V1","AI city · Energy-door home V1"], status: 'candidate',
        description: ["沿 AI 城市交通枢纽方向绘制的收束设计稿：双层半砖、平视单点透视，两层左侧均用白色分段门框与蓝色六边形屏障的能量门。建筑增加深蓝设备柱、屋顶光伏花园、悬挑入口露台与充电设施，室内改为胶囊床、内嵌储物、全息工作台与折叠机械臂；中央楼板缺口与两级薄跳台保留。暖白、深蓝、少量青金灯光，融合宜居花园与超未来基础设施。","A consolidated design following the AI city transit-hub direction: a two-storey half-brick home in frontal one-point perspective, with segmented white frames and blue hexagonal energy barriers at both left-side entrances. Added blue service spines, a photovoltaic roof garden, a cantilevered entry terrace and charging facilities; interiors feature a capsule bed, fitted storage, a holographic workbench and a folded fabrication arm. The central floor opening and two thin jump ledges remain. Warm pearl white, deep blue and restrained cyan-gold lighting combine a garden home with advanced infrastructure."],
        evidence: ["用户要求“绘制最终的，需要用能量门，房子可以复杂一些”（2026-10-13）。使用内置 imagegen，参考 AI 城市交通枢纽、最新半砖布局导图及家园能量门。作为最终方向的候选原画，待用户审阅；格数、门净空与碰撞仍需制作时按定义核对。","Requested by the user: draw the final design with energy doors and a more complex house (2026-10-13). Created with built-in imagegen from the AI city transit hub, latest half-brick layout guide and homestead energy door. This is a final-direction candidate awaiting user review; exact grid dimensions, doorway clearance and collision require production verification."],
        images: [
          { label: ["最终方向稿 · 能量门复合住宅","Final-direction concept · Energy-door home"], path: './art-library/ai-city-final-home-v1/final-energy-home.png' },
        ],
        files: [
          { label: ["设计说明与绘制提示词","Design notes and generation prompt"], path: './art-library/ai-city-final-home-v1/prompts.txt' },
          { label: ["制作记录与验收范围","Production record and verification scope"], path: './art-library/ai-city-final-home-v1/SOURCE.md' },
        ],
      },
      {
        id: 'ai-city-v1', title: ["AI 城市 · 八城区 V1","AI city · Eight districts V1"], status: 'candidate',
        description: ["一座原创后 AI 时代城市的八个城区，统一建筑语言：暖白与珍珠白的圆润楼群配深蓝腰线、圆窗与胶囊窗、克制的青色光线和少量金色点缀，楼楼有绿化；每个城区都能看到城市地标「算力尖塔」（三道悬浮光环的白色细高塔）。AI 基础设施做成美好而安静的日常：绿顶数据厅、余热温室、白色磁悬浮、有序的无人机航道与服务机器人，不做监控感与霓虹广告。八城区：中枢区、花园住宅区、机器人工坊区、交通枢纽、能源冷却湖区、人机学院、自动化港区、黄昏全景。底图与比例同半砖两层房间，画面规则沿用融合八方案。左墙两处门洞为家园能量门：正面镜头下门几乎侧对镜头，所以门框模块（白色分段前柱与门框顶、青色指示灯）嵌在左墙厚度里，屏障只显出蓝色边光并照亮地面；构图底图已画入门模块。","Eight districts of one original post-AI city with a single design language: warm-white and pearl-white rounded buildings with deep-blue trim bands, round and pill windows, sparing cyan light lines and small gold accents, greenery on every building; the landmark Compute Spire (a slender white tower with three floating halo rings) appears in every district. AI infrastructure is calm and beautiful: green-roofed data halls, waste-heat greenhouses, white maglev, orderly drone lanes and service robots, without surveillance mood or neon ads. Districts: core, garden residential, robotics workshops, transit hub, energy and cooling lake, human-AI academy, autonomous harbor and twilight panorama. Same half-brick guide and scale; image rules follow the fusion set. Both left-wall doorways use the homestead energy door: seen nearly edge-on by the frontal camera, the white segmented frame with cyan indicators sits inside the wall thickness and the barrier shows as a blue edge glow lighting the floor; the door module is drawn into the layout guide."],
        evidence: ["用户要求“一个后 AI 时代的现代化城市，你来制作最多 8 个，新的一套，参考所有经验，重中之重的 AI 城市”（2026-10-13）。风格参考已确认的「白蓝科技世界」「花园城区」；gpt-image-2.5 编辑模式；尚未确认。","Requested by the user: a new set of up to eight for a modern post-AI city, using all prior lessons, with the AI city as the top priority (2026-10-13). Style references: the approved clean-future and garden-city images; gpt-image-2.5 edit mode; not yet approved."],
        images: [
          { label: ["1 中枢区 · 算力尖塔","1 Core · Compute Spire"], path: './art-library/ai-city-v1/1-core.png' },
          { label: ["2 花园住宅区","2 Garden residential"], path: './art-library/ai-city-v1/2-residential.png' },
          { label: ["3 机器人工坊区","3 Robotics workshops"], path: './art-library/ai-city-v1/3-robot-workshop.png' },
          { label: ["4 交通枢纽","4 Transit hub"], path: './art-library/ai-city-v1/4-transit-hub.png' },
          { label: ["5 能源冷却湖区","5 Energy and cooling lake"], path: './art-library/ai-city-v1/5-energy-lake.png' },
          { label: ["6 人机学院","6 Human-AI academy"], path: './art-library/ai-city-v1/6-academy.png' },
          { label: ["7 自动化港区","7 Autonomous harbor"], path: './art-library/ai-city-v1/7-harbor.png' },
          { label: ["8 黄昏全景","8 Twilight panorama"], path: './art-library/ai-city-v1/8-twilight-panorama.png' },
          { label: ["构图底图 · 半砖两层＋能量门","Layout guide · half-brick two-storey with energy doors"], path: './art-library/ai-city-v1/layout-guide-door.png' },
        ],
        files: [
          { label: ["提示词（画面规则、城市设定与八城区）","Prompts (image rules, city bible and eight districts)"], path: './art-library/ai-city-v1/prompts.txt' },
        ],
      },
      {
        id: 'post-ai-fusion-v1', title: ["双层房间 · 融合八方案","Two-storey room · Eight fusion designs"], status: 'candidate',
        description: ["融合「原创八方案」的画面规则（墙面安静、主体最清晰、远景低两档、通口留空、占位完全替换）与城市 V2 的地标取景，并补足其不足：加入 2–4 处克制的现代科技元素（光伏、服务机器人、无人机、轻轨），两侧格子改为高低错落的景观台地而非城垛，每层 3–5 组边缘陈设，远景只用白天或黄昏。八套：迪拜晨光白金、新加坡花园城市、巴黎黄昏、杏橙科技工坊、湖蓝运河科技居所、墨蓝星象实验室、上海晨雾、东京晴日。","Combines the original eight designs' image rules (quiet walls, clearest main room, distance two value steps down, open shaft, full placeholder replacement) with the city V2 landmark framing, and fixes their gaps: 2–4 restrained modern-tech touches (solar, service robot, drone, light rail), landscaped stepped terraces instead of battlements, 3–5 edge clusters per floor, and daylight or golden hour only. Eight sets: Dubai white-gold morning, Singapore garden city, Paris golden hour, apricot tech atelier, canal blue tech home, ink-blue observatory lab, Shanghai misty morning and Tokyo clear day."],
        evidence: ["用户让比较另一会话的八方案后“觉得不足就自己添加，继续添加”（2026-10-13）。共用提示词沿用原创八方案并追加修正规则；gpt-image-2.5 编辑模式；尚未确认。","After comparing with the other session's eight designs, the user asked to fill the gaps and keep adding (2026-10-13). Shared prompt reuses the original eight with added fix rules; gpt-image-2.5 edit mode; not yet approved."],
        images: [
          { label: ["1 迪拜 · 晨光白金","1 Dubai · white-gold morning"], path: './art-library/post-ai-fusion-v1/1-dubai-morning.png' },
          { label: ["2 新加坡 · 花园城市","2 Singapore · garden city"], path: './art-library/post-ai-fusion-v1/2-singapore-garden.png' },
          { label: ["3 巴黎 · 黄昏","3 Paris · golden hour"], path: './art-library/post-ai-fusion-v1/3-paris-golden.png' },
          { label: ["4 杏橙科技工坊","4 Apricot tech atelier"], path: './art-library/post-ai-fusion-v1/4-apricot-tech.png' },
          { label: ["5 湖蓝运河科技居所","5 Canal blue tech home"], path: './art-library/post-ai-fusion-v1/5-canal-tech.png' },
          { label: ["6 墨蓝星象实验室","6 Ink-blue observatory lab"], path: './art-library/post-ai-fusion-v1/6-ink-observatory-tech.png' },
          { label: ["7 上海 · 晨雾","7 Shanghai · misty morning"], path: './art-library/post-ai-fusion-v1/7-shanghai-morning.png' },
          { label: ["8 东京 · 晴日","8 Tokyo · clear day"], path: './art-library/post-ai-fusion-v1/8-tokyo-clear.png' },
        ],
        files: [
          { label: ["提示词（共用规则、修正规则与八方案）","Prompts (shared rules, fix rules and eight designs)"], path: './art-library/post-ai-fusion-v1/prompts.txt' },
        ],
      },
      {
        id: 'original-two-storey-eight-v1', title: ["双层房间 · 原创八方案 V1","Two-storey room · Eight original designs V1"], status: 'candidate',
        description: ["独立设计的八套双层房间效果图。沿用最新统一世界方格的半砖构图底图与单点透视，固定房间布置，比较建筑材质、家具、照明与室外环境：杏橙白瓷、松绿釉砖、湖蓝白木、赤陶米白、墨蓝黄铜、珊瑚浅灰、雪白枫木、烟紫银灰。这批图用于美术方向选型，不作为精确尺寸或游戏实装认证。","Eight independently designed two-storey room concepts. They use the latest half-brick guide with a shared world grid and one-point perspective, keeping the room layout consistent while comparing building materials, furniture, lighting and outdoor settings: apricot porcelain, moss glazed tile, canal blue and white timber, clay and ivory, ink blue and brass, coral and pale gray, snow white and maple, and lilac and silver gray. These are visual direction candidates, not dimensional or in-game implementation certifications."],
        evidence: ["用户要求“你自己制作8个加入这个页面”，使用既有双层透视图自行设计（2026-10-13）。构图参考 post-ai-half-brick-v1/layout-guide.png；图片生成结果仍待逐项选型与后续制作核对，尚未确认。","The user requested eight original designs for this page using the existing two-storey perspective guide (2026-10-13). Composition reference: post-ai-half-brick-v1/layout-guide.png. Generated images await design selection and further production checks; not yet approved."],
        images: [
          { label: ["01 杏橙白瓷 · 晴日工坊","01 Apricot porcelain · Sunny atelier"], path: './art-library/original-two-storey-eight-v1/01-apricot-atelier.png' },
          { label: ["02 松绿釉砖 · 雨后庭院","02 Moss glazed tile · Courtyard after rain"], path: './art-library/original-two-storey-eight-v1/02-moss-courtyard.png' },
          { label: ["03 湖蓝白木 · 运河居所","03 Canal blue and white timber · Canal home"], path: './art-library/original-two-storey-eight-v1/03-canal-blue.png' },
          { label: ["04 赤陶米白 · 坡地小屋","04 Clay and ivory · Hillside cottage"], path: './art-library/original-two-storey-eight-v1/04-clay-terrace.png' },
          { label: ["05 墨蓝黄铜 · 星象书房","05 Ink blue and brass · Observatory study"], path: './art-library/original-two-storey-eight-v1/05-ink-observatory.png' },
          { label: ["06 珊瑚浅灰 · 海风驿站","06 Coral and pale gray · Sea-breeze station"], path: './art-library/original-two-storey-eight-v1/06-coral-breeze.png' },
          { label: ["07 雪白枫木 · 冬日暖居","07 Snow white and maple · Winter retreat"], path: './art-library/original-two-storey-eight-v1/07-snow-maple.png' },
          { label: ["08 烟紫银灰 · 黄昏果园","08 Lilac and silver gray · Twilight orchard"], path: './art-library/original-two-storey-eight-v1/08-lilac-orchard.png' },
        ],
        files: [
          { label: ["设计说明与提示词","Design notes and prompts"], path: './art-library/original-two-storey-eight-v1/prompts.txt' },
          { label: ["制作记录与画面偏差","Production notes and visual deviations"], path: './art-library/original-two-storey-eight-v1/SOURCE.md' },
          { label: ["源底图 · 半砖双层单点透视","Source guide · Half-brick two-storey one-point perspective"], path: './art-library/post-ai-half-brick-v1/layout-guide.png' },
        ],
      },
      {
        id: 'post-ai-cities-v2', title: ["半砖两层房间 · 城市八风格 V2","Half-brick two-storey · Eight city styles V2"], status: 'candidate',
        description: ["按各城市宣传图与经典天际线重画：统一取蓝调时刻与水面倒影，地标按最常见的取景组合——迪拜哈利法塔＋音乐喷泉湖、纽约布鲁克林两桥看曼哈顿、新加坡擎天树＋金沙酒店、东京东京塔＋晴空塔＋富士山、上海外滩看陆家嘴、深圳湾灯光秀、首尔汉江彩虹喷泉＋南山塔＋乐天塔、巴黎特罗卡德罗看埃菲尔铁塔。室内改为各城高端住宅风格。底图与比例同半砖两层房间。","Redrawn from each city's tourism imagery and classic skylines: blue hour with water reflections and the most common landmark compositions — Dubai's Burj Khalifa and fountain lake, Manhattan from the Brooklyn bridges, Singapore's Supertrees and Marina Bay Sands, Tokyo Tower with Skytree and Fuji, Lujiazui from the Bund, the Shenzhen Bay light show, Seoul's Han River rainbow fountain with Namsan and Lotte towers, and the Eiffel Tower from Trocadéro. Interiors follow each city's upscale residential style. Same half-brick guide and scale."],
        evidence: ["用户指出“迪拜为啥要弄黄沙的感觉”，要求参考这些城市的宣传图片和天际线里最漂亮的（2026-10-13）。检索各城摄影与旅游指南后改写提示词；gpt-image-2.5 编辑模式；尚未确认。","The user questioned the sandy Dubai look and asked to follow each city's best promotional skyline imagery (2026-10-13). Prompts rewritten after reviewing photography and tourism guides; gpt-image-2.5 edit mode; not yet approved."],
        images: [
          { label: ["迪拜 · 哈利法塔与喷泉湖","Dubai · Burj Khalifa and fountain lake"], path: './art-library/post-ai-cities-v2/09-dubai.png' },
          { label: ["纽约 · 布鲁克林大桥看曼哈顿","New York · Manhattan from the Brooklyn bridges"], path: './art-library/post-ai-cities-v2/10-new-york.png' },
          { label: ["新加坡 · 滨海湾与擎天树","Singapore · Marina Bay and Supertrees"], path: './art-library/post-ai-cities-v2/11-singapore.png' },
          { label: ["东京 · 东京塔与富士山","Tokyo · Tokyo Tower and Fuji"], path: './art-library/post-ai-cities-v2/12-tokyo.png' },
          { label: ["上海 · 外滩看陆家嘴","Shanghai · Lujiazui from the Bund"], path: './art-library/post-ai-cities-v2/13-shanghai.png' },
          { label: ["深圳 · 深圳湾灯光秀","Shenzhen · Shenzhen Bay light show"], path: './art-library/post-ai-cities-v2/14-shenzhen.png' },
          { label: ["首尔 · 汉江彩虹喷泉","Seoul · Han River rainbow fountain"], path: './art-library/post-ai-cities-v2/15-seoul.png' },
          { label: ["巴黎 · 特罗卡德罗看铁塔","Paris · Eiffel Tower from Trocadéro"], path: './art-library/post-ai-cities-v2/16-paris.png' },
        ],
        files: [
          { label: ["提示词（共用规则与八城市 V2）","Prompts (shared rules and eight cities V2)"], path: './art-library/post-ai-cities-v2/prompts.txt' },
        ],
      },
      {
        id: 'post-ai-cities-v1', title: ["半砖两层房间 · 城市八风格","Half-brick two-storey · Eight city styles"], status: 'candidate',
        description: ["同一张半砖两层房间底图（②上半砖 C，真实镜头 FOV30°、距 30 格，人物 3.1 格），按城市特色适配房屋材质、室内陈设与远景天际线：迪拜、纽约、新加坡、东京、上海、深圳、首尔、巴黎，均为后 AI 时代的未来版本。首尔版在顶板上加了韩屋屋顶，超出底图。","The same half-brick two-storey guide (upper-half brick C floor, real camera FOV 30°, 30 tiles, 3.1-tile characters), adapted to each city's materials, interiors and skyline: Dubai, New York, Singapore, Tokyo, Shanghai, Shenzhen, Seoul and Paris, all as post-AI futures. The Seoul version adds a hanok roof beyond the guide."],
        evidence: ["用户要求“再加 8 个，迪拜、纽约、新加坡、东京、上海，适配他们的风格”（2026-10-13）；深圳、首尔、巴黎为补足 8 个所选。gpt-image-2.5 编辑模式；尚未确认。","Requested by the user: eight more, Dubai, New York, Singapore, Tokyo and Shanghai in their own styles (2026-10-13); Shenzhen, Seoul and Paris were added to make eight. gpt-image-2.5 edit mode; not yet approved."],
        images: [
          { label: ["迪拜 · 黄金时刻","Dubai · golden hour"], path: './art-library/post-ai-cities-v1/09-dubai.png' },
          { label: ["纽约 · 秋日早晨","New York · autumn morning"], path: './art-library/post-ai-cities-v1/10-new-york.png' },
          { label: ["新加坡 · 雨后傍晚","Singapore · evening after rain"], path: './art-library/post-ai-cities-v1/11-singapore.png' },
          { label: ["东京 · 入夜","Tokyo · early night"], path: './art-library/post-ai-cities-v1/12-tokyo.png' },
          { label: ["上海 · 外滩蓝调","Shanghai · the Bund at blue hour"], path: './art-library/post-ai-cities-v1/13-shanghai.png' },
          { label: ["深圳 · 晴天","Shenzhen · clear day"], path: './art-library/post-ai-cities-v1/14-shenzhen.png' },
          { label: ["首尔 · 春夜","Seoul · spring evening"], path: './art-library/post-ai-cities-v1/15-seoul.png' },
          { label: ["巴黎 · 清晨","Paris · morning"], path: './art-library/post-ai-cities-v1/16-paris.png' },
          { label: ["半砖构图底图 · 真实镜头投影","Half-brick layout guide · real camera projection"], path: './art-library/post-ai-half-brick-v1/layout-guide.png' },
        ],
        files: [
          { label: ["提示词（共用规则与八城市）","Prompts (shared rules and eight cities)"], path: './art-library/post-ai-cities-v1/prompts.txt' },
        ],
      },
      {
        id: 'post-ai-half-brick-v1', title: ["半砖两层房间 · 后 AI 时代八风格","Half-brick two-storey · Eight post-AI styles"], status: 'candidate',
        description: ["按半砖层间组合 ②上半砖 C 绘制构图底图：侧墙 K/L 宽 0.5，底板、层间楼板、顶板均为半砖，总高 12，一层净高 5.5、二层 5；真实镜头 FOV30°、距 30 格，人物 3.1 格。八种风格：海上浮城、太空电梯小镇、极地科研站、沙漠绿洲光伏城、云上山城、复古未来、机器人工坊街区、AI 学院春日。","Layout guide for the regular half-brick floor (option ② upper-half brick C): 0.5-wide K/L side walls, half-brick base, floor and roof slabs, total height 12, clear heights 5.5 and 5; real camera FOV 30°, 30 tiles; 3.1-tile characters. Eight styles: floating ocean city, space-elevator town, arctic station, desert oasis solar city, cloud mountain city, retro-futurism, robotics workshop district and AI academy in spring."],
        evidence: ["用户要求“多一些，继续可以用半砖 2 层那个”（2026-10-13）。gpt-image-2.5 编辑模式；尚未确认。","Requested by the user: more styles using the half-brick two-storey layout (2026-10-13). gpt-image-2.5 edit mode; not yet approved."],
        images: [
          { label: ["1 海上浮城","1 Floating ocean city"], path: './art-library/post-ai-half-brick-v1/1-ocean-city.png' },
          { label: ["2 太空电梯小镇","2 Space-elevator town"], path: './art-library/post-ai-half-brick-v1/2-space-elevator.png' },
          { label: ["3 极地科研站 · 极光","3 Arctic station · aurora"], path: './art-library/post-ai-half-brick-v1/3-arctic-station.png' },
          { label: ["4 沙漠绿洲光伏城","4 Desert oasis solar city"], path: './art-library/post-ai-half-brick-v1/4-desert-oasis.png' },
          { label: ["5 云上山城","5 Cloud mountain city"], path: './art-library/post-ai-half-brick-v1/5-cloud-mountain.png' },
          { label: ["6 复古未来","6 Retro-futurism"], path: './art-library/post-ai-half-brick-v1/6-retro-futurism.png' },
          { label: ["7 机器人工坊街区","7 Robotics workshop district"], path: './art-library/post-ai-half-brick-v1/7-robot-workshop.png' },
          { label: ["8 AI 学院 · 春日","8 AI academy · spring"], path: './art-library/post-ai-half-brick-v1/8-academy-spring.png' },
          { label: ["半砖构图底图 · 真实镜头投影","Half-brick layout guide · real camera projection"], path: './art-library/post-ai-half-brick-v1/layout-guide.png' },
        ],
        files: [
          { label: ["提示词（共用规则与八风格）","Prompts (shared rules and eight styles)"], path: './art-library/post-ai-half-brick-v1/prompts.txt' },
        ],
      },
      {
        id: 'post-ai-two-storey-v1', title: ["现代科技 · 后 AI 时代六风格","Modern tech · Six post-AI styles"], status: 'candidate',
        description: ["同一张两层房间构图底图（真实镜头 FOV30°、距 30 格，人物 3.1 格）下的六种现代科技风格：太阳朋克共生、旧算力中心改造社区、极简白色未来、东亚现代科技城、自动化农业边境、雨夜城市。用于比较场景风格方向，结构与比例沿用底图。","Six modern-tech styles on the same two-storey layout guide (real camera FOV 30°, 30 tiles, 3.1-tile characters): solarpunk symbiosis, retired compute center turned neighborhood, minimal white future, East-Asian tech city, automated farm frontier and rainy night city. For comparing scene style directions; structure and scale follow the guide."],
        evidence: ["用户要求“多绘制几个风格的，现代科技风，后ai 时代”（2026-10-13）。gpt-image-2.5 编辑模式；尚未确认。","Requested by the user: more styles, modern tech, post-AI era (2026-10-13). gpt-image-2.5 edit mode; not yet approved."],
        images: [
          { label: ["1 太阳朋克 · 共生","1 Solarpunk symbiosis"], path: './art-library/post-ai-two-storey-v1/1-solarpunk.png' },
          { label: ["2 旧算力中心改造社区","2 Repurposed compute center"], path: './art-library/post-ai-two-storey-v1/2-compute-reuse.png' },
          { label: ["3 极简白色未来","3 Minimal white future"], path: './art-library/post-ai-two-storey-v1/3-minimal-white.png' },
          { label: ["4 东亚现代科技城 · 蓝调时刻","4 East-Asian tech city · blue hour"], path: './art-library/post-ai-two-storey-v1/4-east-asian-tech.png' },
          { label: ["5 自动化农业边境","5 Automated farm frontier"], path: './art-library/post-ai-two-storey-v1/5-vertical-farm.png' },
          { label: ["6 雨夜城市","6 Rainy night city"], path: './art-library/post-ai-two-storey-v1/6-rain-night.png' },
          { label: ["构图底图 · 真实镜头投影","Layout guide · real camera projection"], path: './art-library/scifi-two-storey-v1/layout-guide.png' },
        ],
        files: [
          { label: ["提示词（共用规则与六风格）","Prompts (shared rules and six styles)"], path: './art-library/post-ai-two-storey-v1/prompts.txt' },
        ],
      },
      {
        id: 'scifi-two-storey-v1', title: ["现代科幻 · 两层房间＋远景 V1","Modern sci-fi · Two-storey house and distance V1"], status: 'candidate',
        description: ["现代科幻场景风格效果图：以已选「白蓝科技世界」「花园城区」为风格依据，男女主同框。先按游戏真实镜头（FOV30°、距 30 格）绘制构图底图，房屋按两层房屋定义 11×13 格、门洞 3＋上沿 1、2×2 窗、通口平台 2/4/6，人物 3.1 格，背景格子 −7/−16、前景 +3 下沉 1 格；再由模型按底图上色。三版为花园城区白天、白蓝科技海岸、花园城区黄昏。背景墙板与个别平台、窗尺寸和底图有出入。","Modern sci-fi style key art built on the approved clean-future and garden-city styles, with both heroes. A layout guide was first drawn with the real game camera (FOV 30°, 30 tiles): the 11×13 two-storey house, 3-tile doorways with 1-tile headers, 2×2 windows, platforms at 2/4/6, 3.1-tile characters, background tiles at −7/−16 and foreground at +3 lowered by one tile; the model then painted over it. Variants: garden day, white-blue coast, garden dusk. Back-wall panels and the sizes of some platforms and windows deviate from the guide."],
        evidence: ["用户要求在透视与男女主确定后明确场景风格为现代科幻，“特别是要绘制2层房间+远景 按照我们的透视的效果图”（2026-10-13）。gpt-image-2.5 编辑模式；尚未确认。","Requested by the user to settle the scene style as modern sci-fi, especially a two-storey house with distance in the agreed perspective (2026-10-13). gpt-image-2.5 edit mode; not yet approved."],
        images: [
          { label: ["A 花园城区 · 白天","A Garden city · day"], path: './art-library/scifi-two-storey-v1/a-garden-day.png' },
          { label: ["B 白蓝科技海岸","B White-blue tech coast"], path: './art-library/scifi-two-storey-v1/b-clean-coast.png' },
          { label: ["C 花园城区 · 黄昏","C Garden city · dusk"], path: './art-library/scifi-two-storey-v1/c-garden-dusk.png' },
          { label: ["构图底图 · 真实镜头投影","Layout guide · real camera projection"], path: './art-library/scifi-two-storey-v1/layout-guide.png' },
        ],
        files: [
          { label: ["提示词（共用规则与三版）","Prompts (shared rules and three variants)"], path: './art-library/scifi-two-storey-v1/prompts.txt' },
        ],
      },
      {
        id: 'scene-effect-v1', title: ["场景效果图 · 六场景 V1","Scene key art · six scenes V1"], status: 'candidate',
        description: ["按景深 G 层距与正面透视（FOV30°、镜头距 30 格）绘制的六个场景效果图，场景内容与色板取自资源页「透视 · 场景分层」。人物约 1.6–2 格高、画面约 13 格宽，未达 3.1 格 / 约 28 格的规范，仅作氛围参考，不作尺寸依据。","Key art for the six depth-layer scenes using the G layer distances and frontal perspective (FOV 30°, camera 30 tiles away). The character is only about 1.6–2 tiles tall and the frame about 13 tiles wide, short of the 3.1-tile / ~28-tile standard; mood reference only, not a scale reference."],
        evidence: ["用户要求透视确定后用 image2.5 绘制效果图，六场景“都按照新规则优化”（2026-10-13）。gpt-image-2.5 编辑模式，以主角右侧原图为参考；尚未确认。","Requested by the user after the perspective was settled (2026-10-13). gpt-image-2.5 edit mode with the protagonist right view as reference; not yet approved."],
        images: [
          { label: ["花园山谷","Garden valley"], path: './art-library/scene-effect-v1/valley.png' },
          { label: ["湖畔松林","Lakeside pines"], path: './art-library/scene-effect-v1/lake.png' },
          { label: ["海岸小镇","Coastal village"], path: './art-library/scene-effect-v1/coast.png' },
          { label: ["层叠城镇","Layered town"], path: './art-library/scene-effect-v1/buildings.png' },
          { label: ["月夜遗迹","Moonlit ruins"], path: './art-library/scene-effect-v1/ruins.png' },
          { label: ["晶石洞厅","Crystal cavern"], path: './art-library/scene-effect-v1/cave.png' },
        ],
        files: [
          { label: ["提示词（共用规则与六场景）","Prompts (shared rules and six scenes)"], path: './art-library/scene-effect-v1/prompts.txt' },
        ],
      },
      {
        id: 'expanded-style-studies', title: ["世界画风 · 水墨与其他探索","World styles · Expanded studies"], status: 'candidate',
        description: ["用于研究不同风格的对照原画，尚未选为游戏统一美术方案。","Comparative artwork for researching visual styles; not selected as the final game art direction."],
        evidence: ["会话「设计主角捏人方案 (3)」中用户要求“都进行绘制”及“扩大风格范围”；这些是探索请求，未找到逐款选定记录。","The user requested multiple styles and a broader exploration. These requests do not approve individual alternatives."],
        images: [
          { label: ["中国水墨","01-chinese-ink"], path: './art-library/expanded-style-studies/01-chinese-ink.png' },
          { label: ["清线漫画","02-ligne-claire"], path: './art-library/expanded-style-studies/02-ligne-claire.png' },
          { label: ["复古动画","03-rubber-hose"], path: './art-library/expanded-style-studies/03-rubber-hose.png' },
          { label: ["彩色玻璃","04-stained-glass"], path: './art-library/expanded-style-studies/04-stained-glass.png' },
          { label: ["霓虹科幻","05-neon-scifi"], path: './art-library/expanded-style-studies/05-neon-scifi.png' },
          { label: ["体素积木","06-voxel"], path: './art-library/expanded-style-studies/06-voxel.png' },
        ],
      },

      {
        id: 'additional-style-studies', title: ["世界画风 · 八种材质对照","World styles · Eight media"], status: 'candidate',
        description: ["用于研究不同风格的对照原画，尚未选为游戏统一美术方案。","Comparative artwork for researching visual styles; not selected as the final game art direction."],
        evidence: ["会话「设计主角捏人方案 (3)」中用户要求“都进行绘制”及“扩大风格范围”；这些是探索请求，未找到逐款选定记录。","The user requested multiple styles and a broader exploration. These requests do not approve individual alternatives."],
        images: [
          { label: ["手绘童话","01-storybook"], path: './art-library/additional-style-studies/01-storybook.png' },
          { label: ["水彩动画","02-watercolor"], path: './art-library/additional-style-studies/02-watercolor.png' },
          { label: ["纸片剪纸","03-papercut"], path: './art-library/additional-style-studies/03-papercut.png' },
          { label: ["高清像素","04-pixel-art"], path: './art-library/additional-style-studies/04-pixel-art.png' },
          { label: ["像素角色与立体场景","05-pixel-in-3d"], path: './art-library/additional-style-studies/05-pixel-in-3d.png' },
          { label: ["微缩模型","06-miniature"], path: './art-library/additional-style-studies/06-miniature.png' },
          { label: ["暗色童话","07-dark-fairytale"], path: './art-library/additional-style-studies/07-dark-fairytale.png' },
          { label: ["几何卡通","08-geometric-cartoon"], path: './art-library/additional-style-studies/08-geometric-cartoon.png' },
        ],
      },

      {
        id: 'anime-style-studies', title: ["世界画风 · 六种动漫对照","World styles · Anime comparison"], status: 'candidate',
        description: ["用于研究不同风格的对照原画，尚未选为游戏统一美术方案。","Comparative artwork for researching visual styles; not selected as the final game art direction."],
        evidence: ["会话「设计主角捏人方案 (3)」中用户要求“都进行绘制”及“扩大风格范围”；这些是探索请求，未找到逐款选定记录。","The user requested multiple styles and a broader exploration. These requests do not approve individual alternatives."],
        images: [
          { label: ["传统赛璐璐","01-traditional-cel"], path: './art-library/anime-style-studies/01-traditional-cel.png' },
          { label: ["精细动漫 RPG","02-polished-anime-rpg"], path: './art-library/anime-style-studies/02-polished-anime-rpg.png' },
          { label: ["绘画感幻想","03-painterly-fantasy"], path: './art-library/anime-style-studies/03-painterly-fantasy.png' },
          { label: ["厚涂动漫","04-painted-anime"], path: './art-library/anime-style-studies/04-painted-anime.png' },
          { label: ["强漫画","05-bold-manga"], path: './art-library/anime-style-studies/05-bold-manga.png' },
          { label: ["Q 版 SD","06-chibi-sd"], path: './art-library/anime-style-studies/06-chibi-sd.png' },
        ],
      },

      {
        id: 'technology-camera-studies', title: ["科技场景 · 视角返工记录","Technology scenes · Camera revisions"], status: 'candidate',
        description: ["首图为按实际游戏截图重画的湖边住宅，尚待确认；其余野外、室内、湖边三图曾被明确指出不符合游戏视角，保留作返工对照。","The first image is a game-screenshot-based lakeside revision awaiting approval. The other three images were rejected for incompatible camera framing."],
        evidence: ["「设计主角捏人方案 (3)」中用户说“都不合适我们的游戏视角”（01a12109-478d-7992-9ba5-e49e8bbdd808），随后才按游戏截图重绘。","The user rejected all three location views before the screenshot-based revision was made."],
        images: [
          { label: ["游戏镜头重绘 · 待确认","Game-camera revision · Pending"], path: './art-library/technology-camera-studies/01-lakeside-home.png' },
          { label: ["野外 · 视角被否定","Wilderness · Rejected framing"], path: './art-library/technology-camera-studies/01-wilderness.png' },
          { label: ["室内 · 视角被否定","Interior · Rejected framing"], path: './art-library/technology-camera-studies/02-home-interior.png' },
          { label: ["湖边 · 视角被否定","Lakeside · Rejected framing"], path: './art-library/technology-camera-studies/03-lakeside.png' },
        ],
      },

      {
        id: 'homestead-components', title: ["家园 · 门、太阳能与设施","Homestead · Doors, solar and facilities"], status: 'candidate',
        description: ["能量门包边、可倾斜太阳能、工作站、蓄电池、机器人坞、仓库和商店终端。太阳能最终要求只保留面板与底座；图中的砖底和尺寸不能作为定稿依据。","Energy-door edges, tilting solar panels, compute stations, batteries, docks, storage and terminals. The final solar requirement removes the building block beneath the panel."],
        evidence: ["「制作鹈鹕 429 首批概念资产」包含多轮返工。保留最新功能探索，未把用户确定功能种类视为确认每张成图。","The first concept-assets chat contains repeated revisions. Agreement on component functions does not establish approval of every image."],
        images: [
          { label: ["能量门包边修订","Sealed energy door"], path: './art-library/homestead-components/energy-door-sealed-edge.png' },
          { label: ["可倾斜太阳能","Tilting solar"], path: './art-library/homestead-components/tilting-solar-study.png' },
          { label: ["工作站、电池与机器人坞","Compute, battery and dock"], path: './art-library/homestead-components/power-compute-dock.png' },
          { label: ["仓库与商店终端","Storage and terminals"], path: './art-library/homestead-components/storage-trade-terminals.png' },
          { label: ["剖面分层说明","Cutaway layers"], path: './art-library/homestead-components/layer-study.png' },
        ],
      },

      {
        id: 'clean-future-approved', title: ["白蓝科技世界 · 已选风格","Clean future · Selected style"], status: 'confirmed',
        description: ["按 D1 原图修正男女主比例后的白蓝科技场景。确认的是风格方向，不代表构图、角色占屏比或所有场景已经通过游戏镜头验收。","White-blue future scene with revised hero proportions. Approval covers the style direction, not camera framing or gameplay scale."],
        evidence: ["会话「设计主角捏人方案 (3)」：本图完成后，用户说“这个风格可以多绘制一些”（01a120f2-9933-7c42-a34c-4d2ffac703ae）。随后生成的野外、室内、湖边三图被指出游戏视角不合适，另列返工稿。","The user requested more scenes in this style after this revision. The subsequent three location images were criticized for their game-camera framing and are archived separately."],
        images: [
          { label: ["人物比例修订 V2","Proportion revision V2"], path: './art-library/clean-future-approved/01-clean-future-proportions-v2.png' },
        ],
      },

      {
        id: 'garden-city-approved', title: ["花园城区 · 已选风格","Garden city · Selected style"], status: 'confirmed',
        description: ["暖白建筑、蓝色腰线、圆窗与河岸远景。确认范围是美术风格；建筑剖面、格子拼装和门的方向后来另行修改。","Warm white architecture, blue trim, round windows and a riverside skyline. Approval covers the art direction; cutaways, tiles and door orientation were revised separately."],
        evidence: ["会话「制作鹈鹕 429 首批概念资产」：用户先说“风格可以了”，随后附上本图要求“按照这个制作”（01a11cde-7ecd-7c23-b878-8f73c529cd7a）。","In the first concept-assets chat, the user accepted the style, then attached this image and requested production based on it."],
        images: [
          { label: ["已选花园城区原图","Selected garden city"], path: './art-library/garden-city-approved/garden-city-approved.png' },
        ],
      },

      {
        id: 'fortress', title: ["山体算力堡垒","Mountain compute fortress"], status: 'confirmed',
        description: ["已确认机房场景概念，保留原画构图与气氛。","Approved facility scene concept, preserving its composition and atmosphere."],
        evidence: ["三大机房制作记录明确为“三张已确认概念设计”。","The facility implementation record explicitly identifies three approved concepts."],
        images: [
          { label: ["场景原画","Scene artwork"], path: './art-library/fortress/01-mountain-fortress.png' },
        ],
      },
      {
        id: 'cathedral', title: ["算力大教堂","Compute cathedral"], status: 'confirmed',
        description: ["已确认机房场景概念，保留原画构图与气氛。","Approved facility scene concept, preserving its composition and atmosphere."],
        evidence: ["三大机房制作记录明确为“三张已确认概念设计”。","The facility implementation record explicitly identifies three approved concepts."],
        images: [
          { label: ["场景原画","Scene artwork"], path: './art-library/cathedral/02-compute-cathedral.png' },
        ],
      },
      {
        id: 'abyss', title: ["光纤深渊","Infiniband abyss"], status: 'confirmed',
        description: ["已确认机房场景概念，保留原画构图与气氛。","Approved facility scene concept, preserving its composition and atmosphere."],
        evidence: ["三大机房制作记录明确为“三张已确认概念设计”。","The facility implementation record explicitly identifies three approved concepts."],
        images: [
          { label: ["场景原画","Scene artwork"], path: './art-library/abyss/03-infiniband-abyss.png' },
        ],
      },
      {
        id: 'cloud-city', title: ["云上城市 · 宏大天际线","Cloud city · Grand skyline"], status: 'confirmed',
        description: ["大云团、近处楼群、中间街区和远方超高层的分层场景。","Layered clouds, nearby rooftops, middle districts and distant towers."],
        evidence: ["云城实现记录明确指定用户确认的 cloud-city-grand-skyline.png。","The city implementation record explicitly identifies this user-approved image."],
        images: [
          { label: ["云城原画","Cloud city artwork"], path: './art-library/cloud-city/cloud-city-grand-skyline.png' },
        ],
      },
      {
        id: 'homestead-studies', title: ["家园 · 建筑与设施探索","Homestead · Building studies"], status: 'candidate',
        description: ["剖面场景、建筑构件与设施概念。","Cutaway scenes, modular buildings and facility studies."],
        evidence: ["目录中保留的探索资料，尚未将整批图稿确认为定稿。","Retained exploration material; the full batch is not established as approved."],
        images: [
          { label: ["家园剖面","Homestead cutaway"], path: './art-library/homestead-studies/cutaway-scene.png' },
          { label: ["核心构件","Core building kit"], path: './art-library/homestead-studies/core-building-kit.png' },
          { label: ["生产设施","Production facilities"], path: './art-library/homestead-studies/facilities.png' },
        ],
      },
    ],
  },
  {
    id: 'storyboards', label: ["剧情与分镜","Storyboards"], entries: [
      {
        id: 'astra-rescue', title: ["拯救 GPT-6 Astra · 中英文插图","Save GPT-6 Astra · Bilingual artwork"], status: 'candidate',
        description: ["按用户要求删去对白与多余说明的最新简字版，分别保留中文、英文标题。","Latest simplified Chinese and English artwork, with dialogue and extra copy removed as requested."],
        evidence: ["「绘制游戏风格的拯救 GPT-6 Astra 图片」中用户要求“去掉多余的话”，并澄清要重新绘制图片；最新中英文结果没有后续确认。","The user requested redrawn images with reduced text; no later approval of the final bilingual pair was found."],
        images: [
          { label: ["中文简字版","Simplified Chinese version"], path: './art-library/astra-rescue/astra-rescue-zh.png' },
          { label: ["英文简字版","Simplified English version"], path: './art-library/astra-rescue/astra-rescue-en.png' },
        ],
      },

      {
        id: 'tibo-lauren-story', title: ["Tibo 与 Lauren · 家庭支线","Tibo and Lauren · Family story"], status: 'candidate',
        description: ["一家三口概念图与英文三格漫画，包含恋爱、结婚和孩子 Musk the Resetter。属于剧情插图，未接入游戏。","Family artwork and an English three-panel comic about love, marriage and baby Musk the Resetter. Not integrated into gameplay."],
        evidence: ["「绘制 Tibo 和 Lauren 恋爱场景」中用户要求家庭剧情，之后要求换成英文三格版本；未找到对最终成图单独确认的记录。","The user commissioned the family story and then an English comic; separate approval of the final images was not found."],
        images: [
          { label: ["英文三格漫画","English three-panel comic"], path: './art-library/tibo-lauren-story/tibo-lauren-musk-comic-v1.png' },
          { label: ["一家三口早期稿","Earlier family portrait"], path: './art-library/tibo-lauren-story/tibo-lauren-family-v1.png' },
        ],
      },

      {
        id: 'transformation', title: ["羽毛生长 · 变身分镜","Feather growth · Transformation"], status: 'confirmed',
        description: ["贴身长出羽毛、身体换形与反向收退的设计依据。","Reference for feather growth, transformation and reversal."],
        evidence: ["变身实现记录明确保存为已确认分镜 approved-concept.png。","The transformation record explicitly preserves this approved storyboard."],
        images: [
          { label: ["确认分镜","Approved storyboard"], path: './art-library/transformation/approved-concept.png' },
        ],
      },
      {
        id: 'teleport', title: ["传送 · 消散与重组","Teleport · Dissolve and rebuild"], status: 'confirmed',
        description: ["Sam 传送分镜，后续用于通用传送效果。","Sam's teleport storyboard, later used for shared teleport effects."],
        evidence: ["通用传送记录明确为已确认的 Sam 传送分镜。","The shared teleport record identifies the approved Sam storyboard."],
        images: [
          { label: ["确认分镜","Approved storyboard"], path: './art-library/teleport/teleport-concept.png' },
        ],
      },
    ],
  },
  {
    id: 'standards', label: ["比例与规范","Scale and guides"], entries: [
      {
        id: 'solar-grid-and-load', title: ["半格太阳能板 · 占格、踩踏与追光","Half-height solar panel · Grid, load and tracking"], status: 'confirmed',
        description: ["整板宽1、高0.5、深1格，踩踏时左右倾转，离开后渐进恢复朝向太阳。含整砖、半砖支撑与格内前偏、后偏安装候选。","One panel occupies 1 × 0.5 × 1 tiles, tilts under the player and gradually returns toward the sun after they leave. Includes full/half-tile supports and offset placement candidates."],
        evidence: ["用户确认最新Python线框透视图并要求接入资源与透视场景；半格指整件的高度，格内前偏和后偏仍为摆放候选。","The user approved the latest Python wireframe and requested resource and scene integration. Half a tile refers to the entire object's height; depth offsets remain placement candidates."],
        images: [
          { label: ["半格占位、踩踏倾转与追光线框透视","Half-height occupancy, load response and solar tracking wireframe"], path: './concepts/solar-grid-and-load-perspective.png' },
        ],
      },
      {
        id: 'spatial-guides', title: ["格子、门与场景纵深图解","Tiles, doors and scene depth"], status: 'derived',
        description: ["二维玩法平面与三维场景的关系：地块、墙板、门洞、植物和远景透视。用于解释当前空间设定，不是新场景美术定稿。","Diagrams of the 2D gameplay plane and 3D tiles, walls, doors, plants and distant scenery; guides rather than final scene artwork."],
        evidence: ["「列出场景组成与左右形态」中用户要求补绘格子、墙体、门、植物与远景透视（01a12112-3a9b-7761-8328-32e3ecee92f1），复用基础概念页原图。","Requested spatial guides, reused directly from the basic-concepts page."],
        images: [
          { label: ["格子、墙体与门","Tiles, walls and doors"], path: './concepts/tile-wall-door-depth.png' },
          { label: ["植物与远景透视","Plants and distant perspective"], path: './concepts/plants-distant-perspective.png' },
          { label: ["液体定义与水体透视","Liquid definition and water perspective"], path: './concepts/liquid-perspective.png' },
        ],
      },

      {
        id: 'scale', title: ["人物与瓦片 · 统一尺度","Character and tile scale"], status: 'confirmed',
        description: ["原画与世界格子的尺寸说明。3.3 头身为美术参照，3.1 格为角色外观高度，两者含义不同。","Artwork and world-tile scale. The 3.3-head design target and 3.1-tile visual height are different measurements."],
        evidence: ["基础概念页记录将总图与主角原图收录；图像来源保持原文件，非新角色定稿。","The basic-concepts record retains the scale sheet and original references; this is a guide, not a new character design."],
        images: [
          { label: ["统一尺度总图","Scale guide"], path: './concepts/character-tile-scale.png' },
        ],
      },
      {
        id: 'terrain', title: ["地形瓦片与组合说明","Terrain shapes and combinations"], status: 'derived',
        description: ["基础形状、拼接规范和八类地形组合，用于理解关卡尺度。","Base shapes, joining rules and eight terrain compositions for level scale."],
        evidence: ["复用基础概念页的说明图；属于逻辑与制图资料，不标为场景美术定稿。","Reuses the basic-concepts diagrams; these explain logic and scale rather than final scene art."],
        images: [
          { label: ["地形基础","Terrain basics"], path: './concepts/terrain-tile-basics.png' },
          { label: ["八类组合","Eight compositions"], path: './concepts/terrain-combinations.png' },
        ],
      },
    ],
  },
];
