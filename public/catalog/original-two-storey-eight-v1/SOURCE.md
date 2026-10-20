# 制作与复核记录

日期：2026-10-13
工具：内置 image_gen，8 张逐项生成；第 01 张局部修订两次，第 04 张局部修订一次。
输入基准：post-ai-half-brick-v1/layout-guide.png 与男女主统一标尺图。
本轮未改变游戏场景、材质、相机或碰撞，只添加候选原画及其目录条目。

## 复核结论

8 张最终稿已目视检查：双层剖面、两名角色、中央双跳台和层间缺口均保留。第 01 / 04 张首稿误留灰色人物占位，已由 image_gen 清除；第 01 张修订后误补层间桥板，再次清除了桥板。
独立复核 02 / 03：未发现占位残留、角色重复、双平台遗漏或明显乱透视，可以作为候选效果图。

生成偏差：各图取景、建筑外框宽高、墙格密度、人物相对高度、门窗净空、床脚与楼板支撑有局部偏差；不可从这些效果图反推准确的 FOV、尺寸、碰撞或素材占格。02 偏古典庭院而非原提示词的现代庭院，03/04 的材质磨损偏多，07 床较高且床脚靠近通口边缘，08 背景对比偏强。当前交付用于比较整体配色、材料与气氛，实际制作应回到原底图与共享游戏资源落实，不把这些偏差升级为新规则。

## 最终文件来源

1. 01-apricot-atelier.png
   项目存档：public/catalog/original-two-storey-eight-v1/01-apricot-atelier.png

2. 02-moss-courtyard.png
   项目存档：public/catalog/original-two-storey-eight-v1/02-moss-courtyard.png

3. 03-canal-blue.png
   项目存档：public/catalog/original-two-storey-eight-v1/03-canal-blue.png

4. 04-clay-terrace.png
   项目存档：public/catalog/original-two-storey-eight-v1/04-clay-terrace.png

5. 05-ink-observatory.png
   项目存档：public/catalog/original-two-storey-eight-v1/05-ink-observatory.png

6. 06-coral-breeze.png
   项目存档：public/catalog/original-two-storey-eight-v1/06-coral-breeze.png

7. 07-snow-maple.png
   项目存档：public/catalog/original-two-storey-eight-v1/07-snow-maple.png

8. 08-lilac-orchard.png
   项目存档：public/catalog/original-two-storey-eight-v1/08-lilac-orchard.png

## 局部修订提示词

### 01 清除占位并复原家具
Use case: precise-object-edit. Repair this game environment image without changing its composition, house size, perspective, scenery, material design or lighting. Remove the TWO solid gray-purple person-marker capsules completely (one downstairs, one upstairs); also remove the solid gray-purple rectangular bed-placeholder board at upper-left. Reconstruct the quiet bluegray tiled wall where they were. Move the girl into the exact downstairs capsule location (footpoint at x40%,y84%) and move the boy into the exact upstairs capsule location (footpoint x57%,y46%), keep both same visual height approximately3.1 gridcells, preserve their faces/hair/clothes. REMOVE boy's backpack and glowing wristdevice, simple red sweater bluejeans whiteshoes only. Place bed properly on upperfloor slab (lower it so four small wooden feet rest on actualfloor, no tallpedestal). Keep both thin jumpplatforms and central upperfloor opening intact, NO new objects in shaft. Keep flat square windows, two pendant globes, desk and quiet plants. Change the two bronze rectangular doorway-header boxes from hollow windows into simple flush bronze metal door-header panels. Both left sidewall apertures below those headers must be open doorways through the sidewall from floor toheader (background visible through the left side), exactly like a cutaway dollhouse; do not add white sidewall in those apertures. Maintain the existing wide16:9 framing. No marker capsules, no grey boards, no text.

### 01 清除误补的通口桥板
Precise small local edit. In this image the upper floor mistakenly has a thin white horizontal bridge across the central vertical jump shaft. REMOVE only this thin white bridge that runs from44.5% to52% of imagewidth, at46% to49% imageheight, exactly ABOVE the two orange floating platforms. That entire rectangular gap between the thicker left floor slab and thicker right floor slab must be OPEN, showing uninterrupted blue-grey backwall, so a character can jump from downstairs into upstairs. Also erase the corresponding thin brown floor strip spanning the gap. Preserve the left bedfloor ending at44.5% and right floor starting at52%. Keep both orange floating jumpplatforms below unchanged. Keep all other pixels and every person's face/position/size, furniture, lighting, scene composition unchanged. Do not fill the gap with any glass, beam, rail, floorboard or new platform.

### 04 清除人物占位
Use case: precise-object-edit. Repair only mistakes in this finished room concept. Keep scene framing, materials, light, tile structure, all furniture, background and image size unchanged. DELETE both dark purple-grey capsule-shaped placeholders COMPLETELY: the one downstairs beside the girl and one upstairs beside the boy. Restore the matte wall behind them. Move the girl right to stand exactly where downstairs capsule was, and move boy left to stand where upstairs capsule was. Each person must take the original capsule height and footpoint, natural3.3-head stylized anatomy, blue-white dressgirl and red-sweaterboy withjeans. Do NOT keep ANY gray rounded capsules. Clear the two door openings in the LEFT SIDE WALL: below each terracotta header down tofloor, this is an actual OPEN doorway through the SIDEWALL, background visible through the side, not a door drawn on back wall. Keep same two square right windows. No other changes, especially do not change perspectives, walls, central 2tile shaft, two thin floating platforms, two pendant lamps or bed placement.
