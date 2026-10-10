# 女性主角三视图概念稿 v1

- 日期：2026-10-08
- 工具：内置 imagegen，参考图片生成；非 CLI。
- 状态：第一版视觉草案，尚未作为 3D 几何或正交尺寸验收结果。
- 输出：female-turnaround-v1.png
- 参照：public/characters/human/models-equipped/render-game-front.png、render-game-right.png、render-game-back.png。
- 本步范围：女性外形概念，保持现有大头短身风格、衣服主题和装备布局；未改代码、GLB 或骨架。
- 比例约束：后续模型沿用原骨架绑定姿势、关节位置、四肢长度和手脚触点；当前配置全高 3.1 格、碰撞高 2.8 格保持。不得从生成图片重新推导骨长或用发型最高点缩放身体。
- 视觉检查：三视图的短波波、红色毛衣、卷边牛仔裤、平底鞋、护腕推进器及背负键盘一致；脚底基本对齐。生成图不能证明各视角为精确正交，也不能证明骨架比例和装备尺寸完全一致。
- 下一步：以原模型为尺寸母版做女性基础网格样件，保留原模型对照，检查侧脸、发根、手腕、脚底及背包间隙。

## 实际生成提示词

Use case: stylized-concept.
Asset type: first female playable-character turnaround concept for the existing Pelican 429 game.
Input images: image 1 is the EXISTING production hero FRONT render, image 2 is his RIGHT PROFILE render, image 3 is his BACK render. These three images are mandatory anatomy/proportion, costume and equipment references, not optional style inspiration.
Primary request: create ONE clean landscape model-sheet image containing THREE full-body orthographic views of ONE consistent female counterpart: FRONT, RIGHT PROFILE (facing right), BACK, left to right. All three figures have the identical pixel scale, foot baseline and crown height. Neutral relaxed standing pose exactly matching reference joint heights and hand reach.
Critical proportion lock: preserve the reference's stylized large head to short body ratio exactly. Preserve overall height, head size, neck height, shoulder joint width, torso length, pelvis height, upper/lower arm lengths, knee height, leg lengths, hand size, shoe size and stance width. Do not lengthen legs, shrink the head, slim the body into fashion proportions, add heels or change the apparent age. The new female character belongs to exactly the same youthful family-friendly character world. No exaggerated bust, waist or hips; keep loose functional clothing and the existing silhouette envelope.
Female visual identity: softly shaped cheek and jaw planes, slightly softer brows, subtle natural eyelashes, same large warm brown eyes, small nose and friendly closed-mouth smile, no makeup. Chestnut brown neat chin-length bob with a light side part, softly sculpted clumps matching the original hair material. Hair should fit the same upper head envelope and stop above shoulders to leave the backpack clear. Keep a few small characteristic tufts, no giant bows or ornaments. Distinct female face with equal visual detail across front and profile.
Costume and equipment MUST match the reference: red long-sleeved knitted crewneck sweater with ribbed hem/cuffs, loose blue jeans with rolled cuffs, off-white flat sneakers. Black backpack shoulder straps and horizontal upper-chest strap with a cyan small rectangular buckle. Silver wrist thruster cuffs with black insets and thin cyan light rings at identical wrist locations. Back-mounted silver/black flight harness with paired cyan thrusters and the same diagonal computer keyboard, identical scale and mounting height. Right profile must show existing backpack thickness; back view must show diagonal keyboard and original harness layout, hair must not obscure equipment.
Rendering: match the reference polished stylized 3D game-character render, soft diffuse studio lighting, tactile knitted fabric and denim, softly lit skin, neutral light gray-white background. No environment, weapons in hands, new accessories or extra character.
Composition: three equally spaced panels with generous margins, full body including hair and soles. Thin subtle horizontal alignment guides behind figures at crown, chin, shoulder, pelvis, knees and soles. Only small labels FRONT, RIGHT, BACK below their feet. Do not print numeric measurements, logos, watermarks or explanatory prose.
This is a proportion-preserving concept sheet, not a beauty illustration. Priority order: exact source proportions and equipment layout, view consistency, female face/hair design, polish.

