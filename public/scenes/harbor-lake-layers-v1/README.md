# 湖区暖白城市分层

来源：assets/concepts/harbor-lake-city-v1/master.png，用户确认后以内置 image_gen 分层拆绘，2026-10-18。保留各自生成分辨率 2172 × 724；建筑均为 RGBA 真实透明背景。

- waterfront.png：近层沿岸城市，实测岸线底边 605/724。
- midtown.png：中层地标塔群，实测底边 697/724。
- horizon.png：远层疏散楼群，实测底边 584/724。
- sky.png：独立天空。
- water.png：水平水面底材；动态建筑倒影和波纹由游戏叠加。
- 车辆不烘焙在素材里，继续使用游戏资源。

## 生成提示词

### waterfront.png

透明背景：true

Use case: background-extraction / game asset layer decomposition. Use the attached APPROVED painting as the identity, palette, lighting, design and illustration-style reference. Warm ivory and pearl-white architecture with champagne accents and restrained cool-blue glass, soft readable daylight. Frontal level camera for 2D side-scrolling game, perfectly straight verticals, no aerial view or strong receding perspective. Sharp architecture with beautifully shaded side facets and structural depth. Do not include text, labels, borders, characters, UI, mountains, trains or flying vehicles; those are separate runtime objects. Draw ONLY the nearest opposite-bank waterfront architecture layer, isolated on genuine transparent alpha. Wide horizontal 3:1 canvas. Composition: a continuous THIN dry ivory embankment along a straight horizontal baseline at 94% image height. Above it a carefully spaced rhythm of low and medium warm-white future buildings, gardens, arched civic halls, one glass dome at left and 5 distinct slim white mid-rise towers, roof terraces and balconies. Tallest roof at about 15% canvas height. No central halo landmark (belongs to a different depth layer). Cluster groups vary in height and have generous FULLY TRANSPARENT gaps above the low buildings so background layers will show through. Fine flowers and trees only on DRY shore and terraces. No sky, clouds, water, reflections, background city or haze rectangle. No train track or train. True alpha in sky spaces and below the thin embankment. Dry baseline at 94%, lower 6% entirely transparent. Fill width without cropping tall towers; buildings should look like tangible illuminated architectural volumes rather than flat icons.

### midtown.png

透明背景：true

Use case: background-extraction / game asset layer decomposition. Use the attached APPROVED painting as the identity, palette, lighting, design and illustration-style reference. Warm ivory and pearl-white architecture with champagne accents and restrained cool-blue glass, soft readable daylight. Frontal level camera for 2D side-scrolling game, perfectly straight verticals, no aerial view or strong receding perspective. Sharp architecture with beautifully shaded side facets and structural depth. Do not include text, labels, borders, characters, UI, mountains, trains or flying vehicles; those are separate runtime objects. Draw ONLY the middle-depth signature tower group, isolated on genuine transparent alpha, wide horizontal 3:1 canvas. Centered iconic very slender warm-white compute spire with TWO fine luminous halo rings, matching the approved central landmark, surrounded by 8 architecturally distinct narrow modern towers with white structural ribs, curved glass sections and elevated planted terraces. One twisting tower at left, one sharply tapered white tower at right. The central spire top begins at 5% of canvas height, nearby towers between 20% and 55%, all BUILDING BASES align along one level line at 94% canvas height. Sparse low podiums only, preserve large TRANSPARENT gaps between building groups, don't form a solid wall. Subtle atmospheric reduction of contrast but visibly warm white; keep fine window detail. No foreground shore, no sky, no clouds, no water, no reflections, no mountains, no distant skyline, no track or train or drone. Lower 6% transparent, clean cutout alpha everywhere outside actual buildings. Reconstruct buildings cleanly to their ground level.

### horizon.png

透明背景：true

Use case: background-extraction / game asset layer decomposition. Use the attached APPROVED painting as the identity, palette, lighting, design and illustration-style reference. Warm ivory and pearl-white architecture with champagne accents and restrained cool-blue glass, soft readable daylight. Frontal level camera for 2D side-scrolling game, perfectly straight verticals, no aerial view or strong receding perspective. Sharp architecture with beautifully shaded side facets and structural depth. Do not include text, labels, borders, characters, UI, mountains, trains or flying vehicles; those are separate runtime objects. Draw ONLY the furthest city skyline layer, isolated on genuine transparent alpha. Wide horizontal 3:1 canvas. Sparse separated clusters of small slim warm-white future towers, visibly simpler and paler grey-blue in shadow, fading gently with distance. About 18 structures total with VARIED silhouettes and generous transparent spaces between 5 clusters; not a continuous crowded megacity wall. Common building-base line at 94% of image height. Tallest structure top around 24% image height, others 40%-75%. No huge central landmark, no halo, no foreground, no shore details, no water, no reflections, no sky, no clouds, no haze-filled background rectangle, no mountains. Pale ivory facades and pale cool-grey recesses, low contrast, softly atmospheric but identifiable clean edges. All empty space genuine alpha, lower6% entirely transparent.

### sky.png

透明背景：false

Use case: precise-object-edit/background-extraction. Extract and extend ONLY the sky and clouds from the attached approved painting into a clean standalone full-canvas sky background, wide 3:1 aspect ratio. Preserve its soft natural cornflower blue, warm white sunlit cumulus groups at left and right, small broken wispy clouds with generous clear central sky. Near the bottom fade the sky to very pale blue-white atmospheric horizon. No horizon line, no land, no buildings, no antenna, no halo, no water, no reflections, no train, no drones, no characters or text. The entire image is sky. Refined luminous painterly game background, gentle saturation and neutral daylight, avoid electric cyan or dense storm clouds. No transparency.

### water.png

透明背景：false

Use case: background-extraction / game surface texture. Using the attached approved waterfront painting, create ONLY its calm lake water as a standalone seamless horizontally repeating surface texture, wide3:1 image. Absolutely no buildings, shore, mountain, sky above water, train, boat, object, text or UI. Entire canvas is water. Preserve the old game's soft muted blue-green lake color, clear gently greenish depths, SILVER BLUE broad soft cloud reflection patches, very fine low-contrast mostly horizontal ripples. Natural freshwater, not a saturated cobalt ocean, not emerald pool, not dark metallic or dense white glitter. No recognizable tower/vertical building reflections because runtime will supply those dynamically. Consistent ripple scale across the canvas for mapping onto a horizontal physical water plane; no baked horizon or perspective convergence. Cloud reflection patches are loose and softly broken; keep details quiet and refined. Match the supplied painting's water without oversaturating. Fill all edges with water, seamless left-right. Opaque texture.

