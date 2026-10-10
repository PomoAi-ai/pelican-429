# 头发重建设计稿

## 主角两款试用模型

- A「蓬松分束短发」参考 `character-hair-turnaround.png` 第一行 Grassy；实际三视图为 `grassy-tousled-model.png`，资产为 `public/characters/hair/grassy-tousled.glb`。
- B「柔软细丝侧分」参考 `grassy-soft-hair-turnaround.png`，保留已制作的 `public/characters/hair/grassy.glb`；实际三视图为 `grassy-soft-hair-model.png`。
- 展示场 `?mode=showcase&demo=grassy-hair` 并排比较两款，「控制 → 发型」可切换。两款共用身体、头脸和游戏动作；当前实际模型比图稿更整齐，三视图以模型渲染为准。
- A 使用 55 条两节骨链，138480 三角面；B 使用 53 条两节骨链，237284 三角面。默认游戏保持 B。后面的三角色概念与建模说明为原重建阶段记录。

使用内置 imagegen 生成，角色身份参考来自当前项目的主角、Sam、Tibo 正面渲染。图稿是建模与动作设计参考，不是已实现动画的截图，也不保证逐帧几何严格一致。

- `character-hair-turnaround.png`：三位角色的正面、侧面、背面与发束结构。
- `grassy-hair-ten-frames.png`：站立、起步、冲锋、刹停、回弹、下落、落地与收稳的 10 帧方向参考。

## 建模决策

保留角色面部、头骨尺寸、耳朵、年龄与身份。头骨与底帽刚性，头发单独建模。发根固定，末端软弯；不能把整片发帽缩放、拉伸或当作橡胶壳。主角冠顶收短，取消孤立高耸的呆毛；Sam 保持短而紧的上梳发型，Tibo 保持侧分。角色使用约 160 条分层短发束建立可读层次；每束独立两节骨骼，细丝复用项目已有的纵向纹理。

## 生成提示词

### 发型三视图

Create a polished production concept-art MODELING REFERENCE SHEET for rebuilding the HAIR of these three existing stylized 3D game characters from drawings. The supplied images are IDENTITY REFERENCES: 1 Grassy human boy, 2 Sam white ermine, 3 Tibo brown mole-man. Preserve each character's face, skull dimensions, ears, age, species and clothing neckline. Draw only heads and necks. Redesign ONLY the hair into clean physically buildable separated soft tapered locks, with fixed roots and subtly flexible free tips. NO tall isolated ahoge, no antenna, no rigid porcupine spikes, no loose threads, no rubbery skull. Hair should read like attractive groomed soft short brown hair with readable overlapping layers and fine strand texture. Grassy: youthful compact tousled brown short cut, small softly curved crown wisps nestled into silhouette, balanced forehead fringe. Sam: shorter slightly upright swept front, compact neat side locks keeping large white ears exposed. Tibo: unmistakable relaxed side part, broad gently draped fringe, shorter tucked sides and nape. All hair tips rounded-tapered rather than sharp weapons. COMPOSITION: landscape high resolution clean warm offwhite studio sheet, exactly THREE ROWS one character per row, FOUR COLUMNS: front, left profile, rear, and small exploded hair-only structure drawing showing rigid scalp undercap plus 6-10 representative overlapping root-to-tip locks. Main three views are richly rendered consistent 3D-inspired painted concept art, exact same hairstyle and volume across views. Exploded structure is restrained technical line art with root attachment dots, no deformation of skull. Only minimal clear labels: row names 'GRASSY', 'SAM', 'TIBO'; column labels 'FRONT', 'SIDE', 'BACK', 'STRUCTURE'. Broad margins and ample white separation, large enough head views for modelers to use. This is NEW concept art, not a screenshot collage, no UI, no decorative graphics. The user's priority is natural restrained hair movement supported by real separate hair geometry, not amplifying a single cowlick.

### 十帧动作稿

Create a precise ten-frame HAIR ANIMATION KEYFRAME MODEL SHEET using ONLY GRASSY, the human boy in the first row of the supplied approved-direction concept sheet. New drawing based on this reference, not a collage. Landscape sheet, exactly 10 panels in a 2 rows x 5 columns grid with identical large left-facing profile head and upper neck in every panel. Keep skull shape, face, eyes, ears, head angle, head position, hairstyle length and head scale EXACTLY IDENTICAL in all ten frames: all motion exists only in individual brown hair locks above the fixed scalp. Use clean professional animation-pencil linework with warm brown hair rendering and light skin shading, white background. Hair is short layered tousled, soft tapered locks; REMOVE any tall lone crown spike, use compact softly curved overlapping crown tips. Roots stay glued to scalp. Hair length does not stretch. No full head squash, no floating scalp, no hair blowing horizontally like long ribbons, no anime antenna. The largest tip displacement is only about 5% of head width; secondary locks move with a slight time offset. Frame labels exactly: '01 IDLE', '02 IDLE', '03 START', '04 DASH', '05 STOP', '06 REBOUND', '07 FALL', '08 FALL', '09 LAND', '10 SETTLE'. 01 resting natural fringe, 02 very slight soft tip breathing sway, 03 starts moving toward LEFT so tips lag RIGHT, 04 short locks subtly swept back RIGHT with no spikes, 05 deceleration tips gently overshoot LEFT, 06 mild opposite rebound, 07 downward fall causes free tips to lift slightly UP, 08 established falling slight upward bend only, 09 landing tips flex subtly DOWN, 10 settles close to frame01. Make the actual hairstyle silhouette changes restrained but clearly drawn; show only one small pale directional arrow OUTSIDE each applicable head, not drawn through face. Add a tiny grey skull contour guide at the back of each head to reinforce identical rigid skull. This is an artist's keyframe concept for subsequent 3D modeling, not proof of implemented animation. Professional legibility, tidy evenly spaced grid, no other characters, no body actions, no extra diagrams, no watermark.

提示词中的 approved-direction 是生成时的方向描述，不表示用户已批准图稿。后续以用户反馈为准。


## 可重建的独立发型资产

生成器：`scripts/character_hair/export.py`。它复用 `scripts/grassy_reference_fit/hair_fit.py` 的成熟曲面构建，按各自头型重新适配，重建独立蒙皮；Sam 前区为重新绘制的短弧后梳，Tibo 前区作斜分适配。原身体、头骨和耳朵不参与新发束蒙皮。

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/character_hair/export.py -- --profile all --output output/hair-rebuild
```

单个角色可用 `--profile grassy|sam-monster|sam-human|tibo-monster|tibo-human`；加 `--render-body <移除旧毛后的身体.glb>` 输出对应真实三视图。`scalp-boundaries.json` 是从去除旧毛后的身体发际切边提取的 24 个方位建模点（Y 向上、+Z 为正面）；发帽主体保持名义头皮椭圆，只在最后两行接到原发际，Grassy 耳窝额外向内收。它是重建输入，非运行时配置。

导出均含刚性 `HairCap`、独立 `HairStrands` 蒙皮、`HairRoot` metadata（`version=1`、`coordinateSpace=model`、各束 Mid/Tip、region、phase、maxBend）。每束最前 20% 弧长固定在 HairAnchor，后部按弧长平滑过渡至两节骨骼。GLB 不包含预置动画，运行时只旋转独立发束骨骼。
