export const HARBOR_PAINTED_FILES = ['cars.png', 'trains.png'] as const;
export const HARBOR_PAINTED_PATH = 'scenes/harbor-daylight-v2';
export const HARBOR_LAKE_PATH = 'scenes/harbor-lake-layers-v1';
export const HARBOR_LAKE_FILES = ['sky.png', 'water.png', 'waterfront.png', 'midtown.png', 'horizon.png'] as const;
// 顶面由轨道与车辆共同使用；两条线都在背景二的沿岸带中。
export const HARBOR_RAILS = [{ z: -15.3, top: 2 }, { z: -16.7, top: 2.75 }] as const;
// 湖岸列车与承托轨道共用位置，全部位于对岸干陆。
export const HARBOR_LAKE_RAILS = [{ z: -187, top: 2 }, { z: -195, top: 2.75 }] as const;
