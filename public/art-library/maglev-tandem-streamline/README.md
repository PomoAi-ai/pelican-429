# 串列双座磁悬浮列车：多角度设计稿

文件：multiview.png

依据用户原图绘制，使用内置 image_gen。包括侧面、俯视、正面、背面和 45° 视角。

座位沿用用户此前明确要求：每排一个，前后两排，每节两人。去掉原图并排座位的一列，保持单人宽的座舱。

造型重点：尖长车头、连续白色曲面、银色下壳、侧面镂空及内部翼片、向后上扬腰线、收尖车尾、细青蓝灯线和磁悬浮滑靴。不能用简单挤出平板代替整体曲面。

这是建模依据的概念设计稿。运行中的共享 3D 车模已按此稿重做连续曲面与串列双座，模型文件位于 `public/models/maglev/`，支持悬浮行驶和落轨停靠。多视图是生成式概念参考，建模时仍需统一尺寸、投影与连接结构，不能当成已经校准的工程图。

## 生成提示词

Use case: precise-object-edit / stylized-concept.
Create a polished high-resolution MULTIVIEW DESIGN SHEET for modeling the exact futuristic open maglev rail vehicle in the supplied reference. The reference is the design authority. Preserve its pointed long nose, flowing sculpted pearl-white outer shell, brushed silver lower chassis, elongated recessed side cutout with inner silver blade, thin cyan perimeter illumination, swept tail shoulder fins, low windshield and luminous maglev shoes sitting above the guide rails. This is a game vehicle, no people.
Critical change: REMOVE the parallel seating column. There must be EXACTLY TWO individual low reclining bucket seats TOTAL, located on the longitudinal CENTERLINE, one behind the other, both facing forward toward the pointed nose. One person wide, two tandem positions. No side-by-side seating, no third seat, no empty extra seating bay. Narrow the entire passenger body accordingly. Keep elegant flowing geometry like the reference rather than a slab or box. Small legroom pockets forward of each seat; low sports car stance, no standing space.
Sheet layout on very light neutral studio background with faint orderly separators: 5 clearly separated LARGE views of the SAME IDENTICAL design with matching dimensions and seat locations. Upper full-width strict SIDE ORTHOGRAPHIC view nose left, on short straight guideway. Middle row: large TOP ORTHOGRAPHIC nose left visibly proving TWO tandem seats, plus FRONT orthographic and REAR orthographic side by side. Bottom full-width large front-left THREE QUARTER 45 degree hero view including guideway. Readable tiny labels only: SIDE, TOP, FRONT, REAR, 45°. All views uncropped. Consistent white/silver/cyan materials, crisp fine panel lines, soft studio reflections, cinematic premium industrial design quality and high detail. Do not use city backdrop on this sheet, do not add roof, wheels, rotors, jet flames, logos, measurements or people. Rail detail visible and consistent, vehicle width within guideway platform. Orthographic views truly orthographic rather than additional perspective views. The two seats must be unambiguous in TOP and 45 views.

## 定向修正提示词

Edit the supplied five-view vehicle design sheet with ONE localized correction: In the upper SIDE panel ONLY, add the missing rear seat behind the existing seat toward the right/rear. There must be TWO visible separated identical reclining bucket seat side profiles arranged longitudinally, both facing left, as the TOP and bottom 45 degree views already show. Existing front seat headrest is near x=910 at y=40 on a 1536x1024 sheet; add the second seat headrest near x=1150,y=40, its base near x=1050,y=130, matching the first seat's scale, height and rearward lean exactly. Build its small seat pan/footwell into the already existing open bay, without changing the outer shell or length. Preserve every other view, all five-panel composition, beautiful continuous pointed nose and flowing pearl-white body, elongated silver side recess, cyan light strips, swept tail, guide rails, and material treatment exactly. No extra seat anywhere else, no roof, no people. This sheet is for one person wide, TWO seats total tandem vehicle. Only fix the missing seat in SIDE.

