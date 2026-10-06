# Sam 人形四方向参考

- 工具：内置 image_gen。
- 图像：`turnaround.png`，正面、朝左侧面、背面、朝右侧面。
- 身份与服装参考：`output/imagegen/front-portraits-v1/sam-front.png`。
- 比例和胸章参考：`public/characters/sam/reference-front.png`；仅参考比例与服饰，不复制动物五官。
- 目标：约 3.1 头身，独立人形态；不替换现有白鼬模型。
- 当前文件是概念参考，不是 3D 模型。背景去除未被生成工具落实，文件保留背景，不作为透明贴图使用。

## 初次提示词

Use case: stylized-concept. Create a production character turnaround reference sheet for the HUMAN FORM of Sam, a recognizable friendly stylized caricature based on the attached existing human character. Image 1 is the face/hair/outfit identity reference; image 2 is ONLY the target game's body scale and wardrobe badge reference (animal Sam), do NOT copy any animal anatomy. Four complete orthographic full-body views in a single wide horizontal row, in exact order FRONT, LEFT PROFILE (nose points left on the page), BACK, RIGHT PROFILE (nose points right on the page). All views must depict exactly the same HUMAN character, same consistent head/hair/clothing proportions, same scale and shared foot baseline; enough gutter between figures, no overlap. Precisely about 3.1 heads tall counting hair to chin as one head; compact adult chibi proportions with short legs, NOT tall adult proportions and NOT 2.5-head baby proportions. Retain Sam's distinctive short tousled brown hair, slim elongated human face, raised inner brows and light blue-gray eyes, subtle closed-mouth smile. Natural peach human skin, human ears on side of head, human nose, five human fingers; no muzzle, no animal ears, no fur, no tail. Preserve charcoal-gray textured crewneck sweater, medium blue jeans with single turn-up cuffs, clean white sneakers; small circular silver badge with cyan routing-node icon on his anatomical left chest ONLY (front viewer-right; visible on matching side, never on back). Relaxed neutral riggable stance, arms about 15 degrees apart from sides leaving clear gaps, hands relaxed, feet apart and forward. Character faces front in front view, no perspective tilt. Polished game-ready 3D stylized sculpt/render, soft clean form lighting with restrained surface detail, no props, no stage, no floor, no shadows, no decorative glow, no text, no logos apart from simple routing icon. Transparent background with genuine alpha; characters isolated and whole, heads and feet never cropped. Wide 3:2 or wider image composition to fit all four views at good resolution.

## 定点修正提示词

Edit this same four-view Sam human turnaround sheet. Keep every character's face, hair, body proportions, outfit, stance, view direction, scale, texture, position and all pixel-level character detail unchanged. Make ONLY these two corrections: (1) Completely remove the entire studio gradient background, floor, glow and cast shadows to produce a genuine transparent alpha background, including all gaps between limbs and between the four figures. No checkerboard drawn into pixels, no solid color replacement. (2) On the SECOND figure from the left (profile nose pointing LEFT), remove the circular cyan routing badge and replace that tiny area with uninterrupted matching plain gray sweater fabric. Keep the badge on the FIRST front view and FOURTH right-facing profile unchanged; back remains plain. The four figures remain separate and complete with the same common baseline. Output transparent PNG.

## 视觉检查

- 四个视图均完整，脚底同基线，前后视图和侧面身高相近，头身目标约 3.1。
- 保留短棕发、蓝灰眼、灰毛衣、蓝裤、白鞋；没有动物耳朵、口鼻或尾巴。
- 独立视觉复核发现首次修正把胸章左右判断反了；最终以正面左胸为准，朝左侧面有胸章，朝右侧面与背面无胸章。
- 最后修正采用用户最早提供的人形图作为脸部依据，减少幼儿化的大眼和圆脸。正面更接近成年人的脸，侧面仍有卡通夸张。
- 当前是建模概念稿；生成网格后需继续校准四方向头发体积、头身比例与眼眶深度，尚未进行 3D 拟合验收。

## 最终身份与左右修正提示词

Edit image 1, the four-view HUMAN Sam game turnaround. Image 2 is the user's supplied Sam human portrait and is the authoritative facial identity reference. Preserve image 1's approximately 3.1-head-tall body proportions, full-body stance, four view directions (front, nose-left side, back, nose-right side), common baseline, clothes, jeans, shoes, hairstyle silhouette and framing. Correct ONLY: A) Facial identity in the three visible-face views: use the adult Sam facial structure of image 2, narrower less baby-round face, smaller blue-gray eyes (about 25% smaller than image 1), natural eyelids, long straight human nose, recognizable slightly raised inner eyebrows, characteristic thin lips and subtle closed-mouth expression. It must look like a compact 3D game caricature of the adult in image 2, not a generic cute child, while retaining image 1's large head outline and game proportions. B) Badge laterality: front badge stays on anatomical LEFT chest (= viewer RIGHT in front view); the SECOND view, nose pointing LEFT, is the visible LEFT side and must show this same badge near the front of the chest. The FOURTH view, nose pointing RIGHT, is the opposite side and MUST have plain uninterrupted gray sweater with NO badge. Back plain. Precisely one badge on the character, consistently depicted through rotation. Do not change anything else. Keep existing neutral background; no text.


## 独立四向建模输入（2026-10-06）

- 工具：内置 image_gen 编辑；没有使用 Python、图像库或画布裁图/重绘。
- 编辑目标：同目录已批准的 turnaround.png；每次只保留其中指定视图。
- 最终文件：front.png、left.png、back.png、right.png。背景为浅灰不透明色。
- 第一轮隔离造成颈以下身体变长，约 3.6 头身；已进行一次仅比例修正，保留脸/头发/方向/服装，缩短颈以下躯干与腿。
- 逐张视觉检查：正面成年 Sam 脸、蓝灰眼、灰毛衣/蓝裤/白鞋保留；正面徽章在画面右胸，朝左侧面可见，背面与朝右侧面无徽章；四张均为独立完整视图，无动物耳/口鼻/尾巴。
- 最终视觉估计约 3.1–3.3 头身，头顶/鞋底在单独画布上的留白位置略有差异；它们是生成式整理的重建参考，非像素等同裁切或精确配准图。建模时优先以批准四向总稿统一比例，以正面人脸作为身份依据。

### front.png

源输出：[local source path removed]

首次编辑提示词：

Use case: identity-preserve. Edit target: the attached approved four-view Sam HUMAN character sheet. Produce ONE standalone orthographic full-body image for 3D reconstruction by extracting the specified existing figure. This is a faithful isolation/reframing edit, NOT a redesign or a new interpretation. Preserve this exact figure's adult Sam face wherever visible, tousled brown hair, human anatomy, approximately 3.1-head-tall proportions, pose, charcoal gray sweater texture and folds, blue jeans with cuffs, white sneakers, lighting and colors. Preserve the precise head-to-body ratio; do not enlarge the eyes or head, make him younger, stretch the legs, or change the angle. Reframe the complete selected character alone centered in a square image, with hair top at about 5% and shoe soles at about 95% height, ample lateral margin, no cropping. Replace the surrounding background only with uniform pale neutral gray (#eeeeec), no gradient, no floor, no cast shadow, no props, no labels, no letters, no watermark, and absolutely no other views or characters. Select ONLY the FIRST figure from the left, the straight-on FRONT view. Both eyes and both ears remain exactly as on the approved front figure. Arms slightly away from torso, feet apart. Preserve the cyan routing badge on anatomical LEFT chest, which is viewer RIGHT. No animal features.

### left.png

源输出：[local source path removed]

首次编辑提示词：

Use case: identity-preserve. Edit target: the attached approved four-view Sam HUMAN character sheet. Produce ONE standalone orthographic full-body image for 3D reconstruction by extracting the specified existing figure. This is a faithful isolation/reframing edit, NOT a redesign or a new interpretation. Preserve this exact figure's adult Sam face wherever visible, tousled brown hair, human anatomy, approximately 3.1-head-tall proportions, pose, charcoal gray sweater texture and folds, blue jeans with cuffs, white sneakers, lighting and colors. Preserve the precise head-to-body ratio; do not enlarge the eyes or head, make him younger, stretch the legs, or change the angle. Reframe the complete selected character alone centered in a square image, with hair top at about 5% and shoe soles at about 95% height, ample lateral margin, no cropping. Replace the surrounding background only with uniform pale neutral gray (#eeeeec), no gradient, no floor, no cast shadow, no props, no labels, no letters, no watermark, and absolutely no other views or characters. Select ONLY the SECOND figure from the left, the strict LEFT-facing PROFILE with the nose pointing to the LEFT edge of the page. Copy that figure's exact silhouette and relaxed stance, do not rotate or mirror it. The anatomical LEFT side is visible, and its cyan routing chest badge MUST remain visible near the front of the chest. Do not use the other profile. No animal features.

### back.png

源输出：[local source path removed]

首次编辑提示词：

Use case: identity-preserve. Edit target: the attached approved four-view Sam HUMAN character sheet. Produce ONE standalone orthographic full-body image for 3D reconstruction by extracting the specified existing figure. This is a faithful isolation/reframing edit, NOT a redesign or a new interpretation. Preserve this exact figure's adult Sam face wherever visible, tousled brown hair, human anatomy, approximately 3.1-head-tall proportions, pose, charcoal gray sweater texture and folds, blue jeans with cuffs, white sneakers, lighting and colors. Preserve the precise head-to-body ratio; do not enlarge the eyes or head, make him younger, stretch the legs, or change the angle. Reframe the complete selected character alone centered in a square image, with hair top at about 5% and shoe soles at about 95% height, ample lateral margin, no cropping. Replace the surrounding background only with uniform pale neutral gray (#eeeeec), no gradient, no floor, no cast shadow, no props, no labels, no letters, no watermark, and absolutely no other views or characters. Select ONLY the THIRD figure from the left, the straight-on BACK view, head and body facing directly away from camera. Copy the exact rear hair, ears, sweater, jeans pockets and shoe heels. NO face visible and NO chest badge visible. Arms slightly away from torso, feet apart. Do not rotate it to three-quarter.

### right.png

源输出：[local source path removed]

首次编辑提示词：

Use case: identity-preserve. Edit target: the attached approved four-view Sam HUMAN character sheet. Produce ONE standalone orthographic full-body image for 3D reconstruction by extracting the specified existing figure. This is a faithful isolation/reframing edit, NOT a redesign or a new interpretation. Preserve this exact figure's adult Sam face wherever visible, tousled brown hair, human anatomy, approximately 3.1-head-tall proportions, pose, charcoal gray sweater texture and folds, blue jeans with cuffs, white sneakers, lighting and colors. Preserve the precise head-to-body ratio; do not enlarge the eyes or head, make him younger, stretch the legs, or change the angle. Reframe the complete selected character alone centered in a square image, with hair top at about 5% and shoe soles at about 95% height, ample lateral margin, no cropping. Replace the surrounding background only with uniform pale neutral gray (#eeeeec), no gradient, no floor, no cast shadow, no props, no labels, no letters, no watermark, and absolutely no other views or characters. Select ONLY the FOURTH figure from the left, the strict RIGHT-facing PROFILE with the nose pointing to the RIGHT edge of the page. Copy that figure's exact silhouette and relaxed stance, do not rotate or mirror it. The anatomical RIGHT side is visible; keep sweater plain with NO badge. Do not use the other profile. No animal features.

### 统一比例修正提示词

Use case: identity-preserve. Make ONE targeted proportion correction to image 1, a single isolated Sam HUMAN game character. Image 2 is the approved master turnaround and is the authoritative compact body proportion reference. Image 1 accidentally stretched the torso and legs, making him about 3.6 heads tall. Restore exactly the same compact about 3.15 heads tall proportions as the matching view in image 2, counting from hair top to chin as one head. Keep image 1's existing HEAD absolutely unchanged: same size, face, hair, eyes, ears, expression, skin, age and orientation. Shorten ONLY everything below the chin vertically by approximately 18 percent (neck, sweater torso, sleeves/arms and jeans legs), keeping the existing width. This must visibly reduce body height below the unchanged head, never reduce head height. Preserve hands and shoe shapes, stance, silhouette widths, wardrobe, badge position if present, every clothing feature and all colors. Do not redesign or make the face childish. This is a dimensional correction, not a new pose. Keep the same exact single view and plain pale gray background. Leave extra background below the shorter character instead of stretching him to fill the old height; no automatic compensating elongation. Output a single complete full-body character, no labels, no new items. 

各次分别追加：The selected view remains FRONT / LEFT / BACK / RIGHT.
