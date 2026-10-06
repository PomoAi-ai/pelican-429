# Tibo human-form turnaround reference

Generated with the built-in image_gen tool on 2026-10-06. No image CLI/API, programmatic painting, alpha editing, or compositing was used.

## Selected asset

- `turnaround.png`: one 1774 × 887 landscape reference sheet, ordered FRONT / LEFT-facing profile / BACK / RIGHT-facing profile.
- Selected generated source: `[local source path removed]`.
- This is a HUMAN character: human skin, nose, ears and fingers; side-swept brown hair, brown eyes, friendly smile, short beard/stubble, charcoal hoodie, blue jeans and white shoes.
- A single turquoise clockwise-reset chest pin sits on the anatomical left chest. It is visible in the front and left-facing views, and absent from the back and right-facing view.
- The existing mole form is retained separately. No new 3D model has been generated or exported for this human form.

## Inputs and roles

1. `output/imagegen/front-portraits-v1/tibo-front.png`: human face, identity, hair and wardrobe reference.
2. `public/characters/human/turnaround-master-v2/front.png`: game body proportion and rendering style only.
3. `public/characters/tibo/reference-front.png`: reset badge design/placement only; its animal anatomy must not transfer.

## Inspection and limitations

The image was visually checked after generation. Four complete figures have distinct front/profile/rear/profile views; side views show one eye, back shows no face, and no animal features or props were introduced. Front/back arms have a clear gap from the torso, feet are separated, and all views share approximately the same crown and sole levels.

First candidate was approximately 2.9 heads tall, so one targeted proportion correction shortened the head vertically without scaling the whole figure. In the selected sheet, visual landmarks are approximately hair crown y18–24, front chin y286–291, profile chin y280–287, and shoe soles y866–868. Counting the beard bottom as chin gives approximately 3.15–3.25 heads; the target is 3.1 heads, and these are visual estimates with roughly ±6 px uncertainty. The final 3D asset must be measured and fitted to the common game scale, not treated as four geometrically exact cameras merely because this illustration is aligned.

The first candidate had true alpha (51.08% fully transparent pixels), but the proportional edit introduced extensive low-alpha background noise. Following the supervisor's direction to prioritize a clean reviewable model reference over repeated alpha attempts, a final built-in edit replaced the background with an opaque light neutral matte. **The selected image is not a transparent cutout.** No manual background removal was performed.

The matte cleanup introduced subtle ornamental microtexture into the hoodie and denim. This is a residual reference-image artifact, not an approved costume change: the 3D material should remain plain charcoal cotton/knit and ordinary blue denim, following the original human master. Overall silhouette, identity, four directions, badge placement and proportions are suitable for review and the next modeling pass. Reference images do not prove that a 3D model or its rig is complete.

## Generation prompt

```text
Use case: identity-preserve.
Asset: ONE production orthographic four-view turnaround sheet of TIBO'S HUMAN FORM for a stylized 3D side-scrolling game. Wide landscape canvas, preferably 3072 x 1536, four equally spaced full-body columns on genuine transparent alpha. Do not create a scene or multiple alternative designs.

INPUT ROLES:
Image 1 is the HUMAN identity and wardrobe master: preserve this particular friendly adult man's warm brown eyes, expressive thick brows, recognizable long side-swept rich brown fringe, smiling mouth with a little upper teeth, and short brown beard/stubble. Preserve the black hoodie, blue jeans and white sneakers. Do not copy its very short 2.5-head body.
Image 2 supplies ONLY the game's full-body proportions and polished 3D material style, not the face, youth, red clothing or hair.
Image 3 supplies ONLY the small silver/white circular chest badge with turquoise clockwise reset arrow and badge placement. Do not transfer ANY animal anatomy: no fur face, animal nose, whiskers, claws or paws.

ONE CONSISTENT MODEL, in this exact left-to-right sequence:
1 FRONT: face, shoulders and hips perfectly square to camera, both eyes and human ears visible; badge on his anatomical LEFT chest, viewer RIGHT.
2 LEFT PROFILE: exact 90-degree profile with nose and both shoe toes pointing toward the LEFT edge of the image, one eye only; anatomical left chest badge may be a narrow edge.
3 BACK: exact 180-degree rear, no face, no front badge, hoodie hood resting down on upper back, correct jean rear pockets and shoe heels.
4 RIGHT PROFILE: exact 90-degree profile with nose and both shoe toes pointing RIGHT, one eye only; left-chest badge naturally hidden.
These are four cameras around the SAME character, never mirrored copies: preserve the asymmetric hair part and fringe correctly around the skull.

CRITICAL GAME PROPORTIONS: exactly 3.1 head lengths from hair crown to shoe soles. Head length is hair crown to the bottom of human chin/beard, equal to 32.3% of full height. Enlarge the body beneath the existing head, not a small-headed realistic adult. Crown height across ALL columns at 6% of canvas height; sole baseline at 95%; chin at about 34.7%; neckline near 39%; hoodie hem near 64%; shoe upper around 86%. No guide marks. Compact adult cartoon, broad readable head, short sturdy torso and limbs, same proportional anatomy in all four views. Do not retain the 2.5-head infantlike proportions of image1 and do not make a tall normal-proportioned adult.

Pose: relaxed symmetric modeling stance, level head, no tilt, arms hanging about 12 degrees out from torso with clear gaps, human hands/five rounded fingers clearly visible, legs separated at shoulder width, feet flat and parallel on exactly one shared baseline. Keep matching crown/chin/shoulder/hoodie hem/knee/sole levels in every column. No walking or skill pose.
Human skin everywhere on face/ears/hands, ordinary human nose and lips, expressive adult stubble, no animal features whatsoever.
Clothes: plain charcoal-black cotton pullover hoodie with drawstrings, kangaroo pocket, ribbed cuffs and hem; hood DOWN. Plain medium-blue denim jeans and clean white low-top lace-up sneakers. A single small silver circular turquoise clockwise-reset chest pin links him to his companion animal form. No armour, props or weapons.

Polished high-quality soft 3D game-character rendering, sculpted chunky brown hair with tidy strand detail, natural soft skin, readable knit/cotton/denim texture without ornamental patterns. Neutral balanced studio light identical across views. Orthographic camera, no perspective distortion or foreshortening.
Full character silhouette complete in every column with generous space between figures: no cropped head, hands or shoes. Genuine transparent alpha outside the figures. NO background, backdrop glow, dark vignette, floor, floor shadow, platform, checkerboard painting, borders, labels, text, logo or watermark. Four characters only, all the same Tibo human.
```

## Targeted proportion correction

Input: `[local source path removed]`

```text
Use case: precise-object-edit.
Make ONE small proportion correction to this Tibo HUMAN four-view sheet. Keep the existing four columns, front / exact LEFT-facing profile / back / exact RIGHT-facing profile, all identity, face likeness, friendly smile, stubble, hairstyle asymmetry, clothing, materials, neutral light, badge placement and genuinely transparent alpha unchanged.

Current figure is approximately 2.9 heads tall; target is EXACTLY 3.1 heads tall. Fix ONLY head-to-body proportions consistently across all four views, by reducing hair-crown-to-chin height about 6–7% while slightly lengthening the upper torso/neck connection. Keep the SAME overall figure height, foot baseline, head-crown baseline and horizontal column positions. Do NOT scale whole figures.
At the existing 1792x896 composition, highest hair remains around y=18, soles around y=870. Front and both profile chin/beard bottoms should be around y=292 rather than current y=310. That is head height≈274 for full height≈852, ratio3.11. Keep hoodie hem around y=552 and shoes unchanged. This means preserve the wide characteristic Tibo head shape and expression but make it subtly shorter in height, then connect neck/upper hoodie naturally upward. Back skull/nape follows the same corrected skull volume; do not change hair part or invent rear face.

No changes to limbs, human hands, pose, jeans, white sneakers, lower hoodie, pockets, drawstrings or reset pin. Pin stays anatomical LEFT chest: visible in FRONT and left-facing second column, hidden in back and right-facing fourth column. All four full bodies remain uncropped. No animals, no fur nose, no claws, no tail. No text, labels, floor, shadows, backdrop, checkerboard, glow or vignette. Keep genuine transparency. Only the subtle same-head-height proportion correction in all four cameras.
```

## Matte cleanup

Input: `[local source path removed]`

```text
Use case: background-extraction.
Keep all FOUR Tibo human figures pixel-faithful in identity, proportions, pose, shape, scale, positions, clothing, hair, faces and details. The input already has the final ~3.1-head game proportions and correct four views. Do NOT change the figures or redraw the head proportions.
Replace ONLY all empty background between and around the four complete figures with a uniform flat very light neutral warm-gray (#eeeeec) matte background, fully opaque. Remove all colored speckle, mottled gray patches, black areas, transparency noise and halo remnants from the background. Clean accurate silhouette edges. No contact shadows, no floor, no gradient, no vignette, no labels or text. Four separated full-body views aligned to exactly the original shared crown/sole baselines, unchanged. Front, left-facing profile, back, right-facing profile. Do not add badges to the back or right-facing profile. This is a clean production turnaround reference sheet on one solid flat neutral background, not a scene.
```



## 独立四向 Rodin 输入（2026-10-06）

- 从已批准的 turnaround.png 出发，使用内置 image_gen 每次隔离一个指定视图，共四次编辑；没有重新设计四向总稿，也没有程序裁图或像素编辑。
- 文件：front.png、left.png、back.png、right.png，均为 1254 × 1254 PNG，单一完整人物，浅灰不透明背景。
- 逐张视觉核查：人类耳鼻与双手、侧分棕发、棕眼、笑容与短胡茬、黑帽衫/蓝裤/白鞋保留。正面徽章在画面右侧（解剖左胸），朝左侧面可见，背面和朝右侧面没有徽章。
- 比例视觉估计约 3.1–3.2 头身：可见面孔视图的头顶约 y25–30、下巴/胡须下缘约 y390–400、鞋底约 y1200–1215；四张角色尺度接近，未发生 Sam 上次单图隔离时的明显长身漂移。本轮无需追加比例重绘。
- 这些是生成式建模参考，不是严格像素裁切或几何配准；最终 3D 仍须测量共同身高与轮廓。帽衫/牛仔中原总稿的轻微装饰纹理不视为新增服装设计，沿用上文纯色布料要求。
- 仅补齐图片输入，未提交 Rodin、未制作或导出模型/动画。

### front.png

生成文件：`front.png`

提示词：

Use case: identity-preserve. The attached approved Tibo HUMAN four-view turnaround is the edit target. Produce ONE single-view full-body Rodin reconstruction reference by faithfully isolating the specified existing figure. This is an extraction/reframing edit, not a redesign. Preserve the exact Tibo character: friendly adult man with brown side-parted hair, brown eyes, thick expressive eyebrows, short brown beard/stubble and recognizable toothy smile; human skin/ears/nose/hands; black hoodie with drawstrings and kangaroo pocket, blue jeans, white low-top lace-up sneakers. Keep the same warm polished stylized 3D game rendering and pose. Preserve the approved figure's compact 3.1-head proportions EXACTLY; do not elongate the torso or legs during isolation. Hair crown to beard-bottom/chin is 32.3% of total crown-to-sole height. This ratio is more important than filling space. Square canvas, isolated complete figure centered horizontally, hair crown near 6% canvas height, chin/beard-bottom near 34.4%, sole baseline near 94%; head is intentionally large but the FACE remains the same adult bearded face, never a toddler redesign. Relaxed modeling stance with arms slightly clear of torso and feet apart, matching the selected view. Keep existing width-to-height and all local proportions, no perspective tilt. Plain uniform pale neutral gray #eeeeec background, opaque; no gradient, floor, cast shadow, halo, checkerboard, text, labels, watermark, props or additional figures. The reset badge is a small silver round badge with green/turquoise clockwise arrow on anatomical LEFT chest, no other logos. Extract ONLY the FIRST figure from the left: exact straight-on FRONT view, both eyes visible, both shoulders and hips square to camera, same smiling face and beard. Its single green reset badge is on anatomical LEFT chest = viewer RIGHT.

### left.png

生成文件：`left.png`

提示词：

Use case: identity-preserve. The attached approved Tibo HUMAN four-view turnaround is the edit target. Produce ONE single-view full-body Rodin reconstruction reference by faithfully isolating the specified existing figure. This is an extraction/reframing edit, not a redesign. Preserve the exact Tibo character: friendly adult man with brown side-parted hair, brown eyes, thick expressive eyebrows, short brown beard/stubble and recognizable toothy smile; human skin/ears/nose/hands; black hoodie with drawstrings and kangaroo pocket, blue jeans, white low-top lace-up sneakers. Keep the same warm polished stylized 3D game rendering and pose. Preserve the approved figure's compact 3.1-head proportions EXACTLY; do not elongate the torso or legs during isolation. Hair crown to beard-bottom/chin is 32.3% of total crown-to-sole height. This ratio is more important than filling space. Square canvas, isolated complete figure centered horizontally, hair crown near 6% canvas height, chin/beard-bottom near 34.4%, sole baseline near 94%; head is intentionally large but the FACE remains the same adult bearded face, never a toddler redesign. Relaxed modeling stance with arms slightly clear of torso and feet apart, matching the selected view. Keep existing width-to-height and all local proportions, no perspective tilt. Plain uniform pale neutral gray #eeeeec background, opaque; no gradient, floor, cast shadow, halo, checkerboard, text, labels, watermark, props or additional figures. The reset badge is a small silver round badge with green/turquoise clockwise arrow on anatomical LEFT chest, no other logos. Extract ONLY the SECOND figure from the left: strict LEFT-facing PROFILE, nose and shoe toes point toward the LEFT edge of the image, one eye visible. Preserve its exact asymmetric hair arrangement and profile, never mirror the right view. The badge on the anatomical LEFT chest is visible as a narrow near-front chest detail. Hood remains down behind the neck.

### back.png

生成文件：`back.png`

提示词：

Use case: identity-preserve. The attached approved Tibo HUMAN four-view turnaround is the edit target. Produce ONE single-view full-body Rodin reconstruction reference by faithfully isolating the specified existing figure. This is an extraction/reframing edit, not a redesign. Preserve the exact Tibo character: friendly adult man with brown side-parted hair, brown eyes, thick expressive eyebrows, short brown beard/stubble and recognizable toothy smile; human skin/ears/nose/hands; black hoodie with drawstrings and kangaroo pocket, blue jeans, white low-top lace-up sneakers. Keep the same warm polished stylized 3D game rendering and pose. Preserve the approved figure's compact 3.1-head proportions EXACTLY; do not elongate the torso or legs during isolation. Hair crown to beard-bottom/chin is 32.3% of total crown-to-sole height. This ratio is more important than filling space. Square canvas, isolated complete figure centered horizontally, hair crown near 6% canvas height, chin/beard-bottom near 34.4%, sole baseline near 94%; head is intentionally large but the FACE remains the same adult bearded face, never a toddler redesign. Relaxed modeling stance with arms slightly clear of torso and feet apart, matching the selected view. Keep existing width-to-height and all local proportions, no perspective tilt. Plain uniform pale neutral gray #eeeeec background, opaque; no gradient, floor, cast shadow, halo, checkerboard, text, labels, watermark, props or additional figures. The reset badge is a small silver round badge with green/turquoise clockwise arrow on anatomical LEFT chest, no other logos. Extract ONLY the THIRD figure from the left: exact BACK view, no face visible, same rear hair silhouette, hood down over upper back, rear jeans pockets, shoe heels. No badge on the back. Arms slightly apart and legs separated, exactly as approved.

### right.png

生成文件：`right.png`

提示词：

Use case: identity-preserve. The attached approved Tibo HUMAN four-view turnaround is the edit target. Produce ONE single-view full-body Rodin reconstruction reference by faithfully isolating the specified existing figure. This is an extraction/reframing edit, not a redesign. Preserve the exact Tibo character: friendly adult man with brown side-parted hair, brown eyes, thick expressive eyebrows, short brown beard/stubble and recognizable toothy smile; human skin/ears/nose/hands; black hoodie with drawstrings and kangaroo pocket, blue jeans, white low-top lace-up sneakers. Keep the same warm polished stylized 3D game rendering and pose. Preserve the approved figure's compact 3.1-head proportions EXACTLY; do not elongate the torso or legs during isolation. Hair crown to beard-bottom/chin is 32.3% of total crown-to-sole height. This ratio is more important than filling space. Square canvas, isolated complete figure centered horizontally, hair crown near 6% canvas height, chin/beard-bottom near 34.4%, sole baseline near 94%; head is intentionally large but the FACE remains the same adult bearded face, never a toddler redesign. Relaxed modeling stance with arms slightly clear of torso and feet apart, matching the selected view. Keep existing width-to-height and all local proportions, no perspective tilt. Plain uniform pale neutral gray #eeeeec background, opaque; no gradient, floor, cast shadow, halo, checkerboard, text, labels, watermark, props or additional figures. The reset badge is a small silver round badge with green/turquoise clockwise arrow on anatomical LEFT chest, no other logos. Extract ONLY the FOURTH figure from the left: strict RIGHT-facing PROFILE, nose and shoe toes point toward the RIGHT edge of the image, one eye visible. Preserve its exact asymmetric hair arrangement and profile, never mirror the left view. This is the anatomical RIGHT side: there must be NO chest badge visible. Hood down behind the neck.

