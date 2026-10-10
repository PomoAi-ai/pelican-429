# 女性服装 D 组：原角色比例、装备保留

最新要求：必须使用原主角比例；白皙金发的塞尔达式日漫造型；纯白底，禁止泛黄纸张风；服装变化，装备不变。

- 输出：female-outfits-d-proportion-corrected.png，当前候选。
- D1：蓝白冒险裙装、深色打底袜、平底短靴。
- D2：薄荷色短外套、深蓝短裤、长袜、登山鞋。
- D3：浅紫连体短裤装、深色打底袜、白色短靴。
- 工具：内置 imagegen，第一轮生成三款与小背视图；发现腿偏长后做比例修订。
- female-outfits-d-draft.png 仅记录第一轮结果，其腿长不合要求，不作为建模比例母版。背面也是概念，不是装备几何验收。
- 参照：public/characters/human/models-equipped/render-game-{front,right,back}.png。保留大型护腕、黑色肩带和胸扣、飞行背包及背负键盘的原设计；建模时直接复用原装备资源，不用生成图片重建装备。
- 目视检查：最终图恢复大头短身、缩短腿部，三款一致，纯白底无装饰文字；未做像素级或 3D 地标验证，不能声称骨架/装备精确匹配。最终图无背视图，后续定稿需补侧背面。
- 未改代码或模型；未运行测试与构建。

## 游戏风格参考

- 横版冒险游戏 Wonder Boy: The Dragon's Trap 官方页面及 Wonder Girl 内容：https://www.thedragonstrap.com/
- 小比例角色风格参考 The Legend of Zelda: Echoes of Wisdom（并非同一游戏视角）：https://www.nintendo.com/en-ca/store/products/the-legend-of-zelda-echoes-of-wisdom-switch/
- 借鉴小比例角色清晰服装轮廓，头身比仍以本项目原模型为唯一尺度依据。

## 初次提示词

Use case: stylized-concept. Draw a CLEAN WHITE BACKGROUND character costume exploration sheet for a female game protagonist, THREE distinct full-body outfits side by side, each with a small rear-view equipment inset. Labels D1, D2, D3 only. No title, slogans, ornaments, paper grain, vignette, beige, yellow background or warm color filter. Pure #FFFFFF backdrop and neutral daylight color.
REFERENCES 1/2/3: original production hero front/right/back. These are MANDATORY BODY PROPORTION AND EQUIPMENT REFERENCES. User has rejected the long-legged 6–7-head-tall concepts and explicitly REQUIRES OUR ORIGINAL PROPORTIONS. Copy the reference pose, height ratio, head size, torso length, short leg length, arm length, hand and foot size. Approximately three-head-tall game silhouette, NOT fashion anatomy, NOT stretched legs, NOT a tiny head. Original head including hair occupies about one third of full character height. Torso garment hem about 60% down from crown. All three characters identical body proportions and scale, feet on same baseline. Do not make characters shorter by hiding legs in clothes; actual skeleton matches source.
FACE/STYLE: one consistent beautiful female heroine identity across all three, pale fair neutral skin WITHOUT yellow or tan cast, blonde hair, green-blue eyes, refined Japanese anime facial design inspired by Princess Zelda: graceful upper eyelid line, clear eye shape, delicate eyebrows, small nose and mouth, softly tapering jaw without puffy doll cheeks. Compact stylized adventurer, family-friendly modest design. Blonde airy short-to-shoulder hair with small temple braids, subtle pointed ears; enough visible forehead, no heavy mushroom bob. Same hairstyle across the three so costume comparison is meaningful. Clean polished anime cel-shaded game character design, readable silhouette and confident fine linework. Reference small-proportion adventure-game clarity like Zelda Echoes of Wisdom and hand-drawn Wonder Boy / Wonder Girl, NOT their exact costumes. Not plastic 3D doll or photo.
EQUIPMENT MUST REMAIN UNCHANGED FROM OUR REFERENCES, INCLUDING ITS BULK: BOTH large silver wrist cuffs with black panels and cyan circular thruster rings, same size relative to forearms and hands, not shrunk into watches. Black shoulder straps and horizontal upper-chest strap with rectangular cyan buckle. Same black/silver flight backpack, paired cyan nozzle thrusters and diagonal silver-framed dark-key keyboard on the back, SAME dimensions and mounting positions. Show equipment front and in rear inset for each option, same equipment in every outfit. No sword, bow, staff, shield, tiara or additional backpack. No cape hiding equipment.
CLOTHES ARE FULLY REDESIGNED; abandon the red sweater and blue rolled jeans. Three distinct feminine practical adventure outfits, suitable for running/jumping:
D1 left: elegant royal-blue and white adventurer DRESS, white short puff sleeves ending well above the cuffs, modest high neckline and softly fitted blue bodice with restrained small gold trim, short flared skirt just above knees, dark navy opaque leggings, white low flat ankle boots. Costume feels like a light fantasy princess on an adventure, simple enough for a small game model. Black equipment harness sits OVER the dress and remains unchanged. No ballgown or long train.
D2 center: mint/teal waist-length cropped adventure JACKET (midriff fully covered by a white high-neck inner blouse), subtle white edging, navy tailored knee-length shorts, cream knee socks, low brown flat hiking shoes. Natural gentle feminine cut, active and bright, full wrists/cuffs visible. No skirt.
D3 right: pale lavender and white practical short-sleeved ROMPER with a small stand collar, defined but comfortable waist seam and modest loose shorts reaching above knees, charcoal opaque leggings, white flat short boots. Small navy piping with tasteful cyan accents connects visually to equipment. No denim overalls, no baggy shapeless jumpsuit, no exposed midriff. Clearly a different garment silhouette from D1/D2.
All outfits should look beautifully designed rather than a recolor. Do not exaggerate anatomy or introduce sexualized elements. Front views neutral three-quarter or almost frontal stance, relaxed hands separated from hips so cuff equipment visible. Small rear insets directly below or beside each option reveal identical original keyboard arrangement and different back of garment. Keep generous white margins; no cropping of hair, equipment or shoes.
Priority: EXACT source proportions + EXACT original equipment, beautiful fair-skinned blonde anime heroine, substantially improved feminine clothing, absolutely white clean background.

## 比例修订提示词

Edit the supplied THREE-COSTUME image (image 1), preserving its D1 blue/white adventure dress, D2 mint jacket/navy shorts, D3 lavender romper, pure white background, pale skin, blonde braids, anime face identity and all equipment designs. Images 2/3/4 are the MANDATORY ORIGINAL PROPORTION reference front/profile/back. 
The ONLY significant correction is BODY PROPORTIONS. The three-costume image is still roughly 4-head-tall and its legs are too long; user requires the original game's about 3-head-tall skeleton. Make head INCLUDING HAIR occupy about 33 percent of total figure height (NOT 24 percent), shorten the torso and legs accordingly, do not merely scale the whole image. Original reference has a very large head and compact body, match it exactly. Keep original hand/foot size and the ORIGINAL LARGE wrist thrusters; do not shrink equipment to delicate bracelets. Faces must remain beautiful, clean Japanese anime, not round plastic dolls, no changes to complexion, hairstyles or clothing choice.
For each main figure in a 1536x1024 landscape sheet use these approximate landmark guides: crown y=50, chin y=340, shoulder joints y=365, waist/sweater-hem equivalent y=575, hands lowest fingers y=680, crotch y=665, knee y=770, sole y=930. This gives same approximately 3-head proportions as the original. Head width proportionately enlarged and neck short, legs truly shorter. Center figures at x=260,768,1276, all same scale and baseline. Don't draw landmark lines or numbers, these are construction instructions. Enough margins.
Keep three front views, tiny D1/D2/D3 labels below. REMOVE the small rear insets if necessary to give large heads room; prioritize accurate anatomy and silhouette. Keep visible backpack shoulder straps and cyan chest buckle, oversized silver wrist cuffs with black insets and cyan nozzle rings, subtle backpack glimpses exactly as original. No new gear. No warm filter, no yellow background or paper texture, no decoration. Colors and costume details same as edit target. Do not accidentally revert to original red sweater and jeans.

