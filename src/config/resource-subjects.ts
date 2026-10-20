/**
 * 资源检视的主题：名称、说明与卡片图（展示文案），页面登记表与资源目录共用这一份。
 * 每个主题的变体由 render/resource/resource-catalog 从游戏注册表生成。
 */
export const RESOURCE_SUBJECTS: readonly { readonly id: string; readonly name: string; readonly description: string; readonly image: string }[] = [
  { id: 'terrain', name: '地形瓦片', description: '完整瓦片注册表；树枝与屋顶通过所属模型展示', image: './resources/terrain.jpg' },
  { id: 'tree', name: '树木', description: '全部树种，使用游戏生成规则、树冠和枝干', image: './resources/tree.jpg' },
  { id: 'shrub', name: '灌木', description: '全部灌丛与植株轮廓', image: './resources/shrub.jpg' },
  { id: 'grass', name: '花草', description: '自然组合与全部花草物种', image: './resources/grass.jpg' },
  { id: 'climber', name: '附着与下垂植物', description: '植物的顶面、正背面、边缘与底面空间组合', image: './resources/cover.jpg' },
  { id: 'cover', name: '地被', description: '苔藓、嫩芽、落叶与垂挂地被', image: './resources/cover.jpg' },
  { id: 'rock', name: '岩石', description: '碎石、巨石、地标岩与岩脚装饰', image: './resources/rock.jpg' },
  { id: 'desert', name: '沙漠装饰', description: '仙人掌、荒漠植物、骨骸与沙纹', image: './resources/desert.jpg' },
  { id: 'hut', name: '渔屋', description: '完整屋顶、墙体、室内与栈桥', image: './resources/hut.jpg' },
  { id: 'water', name: '水池', description: '真实水体、波纹与全部配色', image: './resources/water.jpg' },
  { id: 'aquatic', name: '水生植物', description: '湖底、水面与悬浮植物的全部变体', image: './resources/aquatic.jpg' },
  { id: 'cave', name: '洞穴装饰', description: '全部地面与顶壁装饰，保留游戏的悬挂方向', image: './resources/cave.jpg' },
  { id: 'block', name: '实心建筑格', description: '1 × 1 格；标准深 0.9，齐地形变体深 1.5；暖白封板与钴蓝包边', image: './resources/free-world/building-kit/block.jpg' },
  { id: 'wall', name: '背景墙格', description: '1 × 1 格薄墙板，置于角色后方；与实心建筑格分层', image: './resources/free-world/building-kit/wall.jpg' },
  { id: 'door', name: '能量门', description: '沿通行方向厚 0.14 格；基础门高 3、Z 跨度 1.4；一体门楣高 4、Z 跨度 1.5，齐地形前后沿；开启只关闭屏障', image: './resources/free-world/building-kit/door.jpg' },
  { id: 'solar', name: '太阳能板', description: '宽 1、高 0.5、深 1 格；整板左右倾转，踩踏受力，离开后渐进恢复追光；支撑砖独立', image: './resources/free-world/building-kit/solar.jpg' },
];
