# Rodin 提示词

几何与材质分阶段。下列两套分别用于头发与身体；每次返工只修改被检查出的缺陷。正文均保持简短，避免页面长度上限。

## 头发几何

```text
ONE detachable stylized golden-blonde short bob hairstyle, matching the supplied FRONT, RIGHT and BACK views. Rounded volumetric crown, side-swept fringe, two small temple braids, layered curved locks ending at the upper neck. Build a coherent hair shell with room for a separate round head inside. Keep the face opening and ear clearance. Sculpted smooth game hair locks with tapered tips and readable braid geometry. No head, face, skin, ears, eyes, eyebrows, neck, body, mannequin, dark bands or accessories. No long hair or wispy realistic strands. Preserve the reference silhouette from all views. Front and back are different views of ONE object, not separate objects. Clean consistent surface; avoid fused clumps, paper-thin blades and holes in the rear hair coverage.
```

返工例：后脑太薄时只追加 `Increase the rounded back-of-head depth while preserving the front silhouette and short bob length.`；混入头部时追加 `Remove all head and skin geometry; retain only the detachable hair shell.`

## 身体几何（参考草稿需先修膝和小腿）

```text
ONE stylized chibi game character body matching the reference proportions and neutral A-pose. Preserve short stature, slender limbs and the large-head scale; no realistic tall proportions. Continuous torso, pelvis, arms, hands, legs and bare feet; no separate joint blocks. Natural single knees, straight neutral shins, slim ankles, correctly positioned elbows. No S-shaped shins or backward-bent knees. Hands separated from hips, five separated fingers per hand, feet parallel. Opaque plain blue fitted athletic suit with smooth surface, no decorative seams or thick fabric folds. No hair, dress, shoes, equipment or accessories. The reference head is a scale guide and will be replaced by an existing approved head. Keep neck attachment simple and consistent. Clean geometry around shoulders, hips, knees and elbows for later retopology and rigging; preserve front, right and back silhouettes.
```

生成结果仅作几何起点。服装遮盖下的皮肤连续性、关节拓扑及正确权重必须在建模软件里检查，不能由提示词视为已保证。
