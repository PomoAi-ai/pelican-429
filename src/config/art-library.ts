export interface ArtLibraryImage {
  readonly label: readonly [string, string];
  readonly path: string;
}

export interface ArtLibraryEntry {
  readonly id: string;
  readonly title: readonly [string, string];
  readonly status: 'confirmed' | 'derived' | 'candidate';
  readonly description: readonly [string, string];
  readonly evidence: readonly [string, string];
  readonly images: readonly ArtLibraryImage[];
}

export interface ArtLibraryGroup {
  readonly id: string;
  readonly label: readonly [string, string];
  readonly entries: readonly ArtLibraryEntry[];
}

export const ART_LIBRARY_GROUPS: readonly ArtLibraryGroup[] = [
  {
    id: "roster-24", label: ["24款换装角色","24 character variants"], entries: [
      {
        id: "roster-24-definitions", title: ["24款角色 · 四视图已齐全","24 characters · All four-view sheets"], status: "derived",
        description: ["24款原画与标尺全部齐全，季节、服装、发型和胖瘦各有变化。画稿见“包含待核对稿”或24款角色图册。","All 24 four-view artworks and rulers are available. Show candidates or open the roster gallery."],
        evidence: ["全部24款已绘制；画稿待用户选型确认，尚非3D模型。","All 24 are drawn; approval pending. These are not 3D assets."],
        images: [{"label":["第1批定义","Batch 1 definitions"],"path":"./art-library/roster-24/definitions/batch-01.svg"},{"label":["第2批定义","Batch 2 definitions"],"path":"./art-library/roster-24/definitions/batch-02.svg"},{"label":["第3批定义","Batch 3 definitions"],"path":"./art-library/roster-24/definitions/batch-03.svg"},{"label":["第4批定义","Batch 4 definitions"],"path":"./art-library/roster-24/definitions/batch-04.svg"},{"label":["第5批定义","Batch 5 definitions"],"path":"./art-library/roster-24/definitions/batch-05.svg"},{"label":["第6批定义","Batch 6 definitions"],"path":"./art-library/roster-24/definitions/batch-06.svg"}],
      },
      {
        id: "roster-r01", title: ["R01 · 经典水手裙","R01 · Character draft"], status: "candidate",
        description: ["黑色齐肩直发；侧分刘海，发尾内收，露出部分耳廓；均衡体型。象牙白水手领短袖上衣、藏蓝百褶短裙、暗红领结。正面估测约3.23H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.23 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-01/r01-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-01/r01-art.png"}],
      },
      {
        id: "roster-r02", title: ["R02 · 夏日水手短裤","R02 · Character draft"], status: "candidate",
        description: ["银灰耳上短发；蓬松侧扫，细碎后颈，单侧交叉发夹；纤细体型。天蓝短袖水手上衣、象牙白领巾、藏蓝高腰短裤。正面估测约3.18H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.18 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-01/r02-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-01/r02-art.png"}],
      },
      {
        id: "roster-r03", title: ["R03 · 牛仔背带短裤","R03 · Character draft"], status: "candidate",
        description: ["栗棕齐肩波浪半扎；小发束，后脑体积饱满；微胖体型。杏色圆领短袖、浅蓝牛仔背带短裤、雏菊胸袋。正面估测约3.32H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.32 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-01/r03-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-01/r03-art.png"}],
      },
      {
        id: "roster-r04", title: ["R04 · 秋日针织","R04 · Character draft"], status: "candidate",
        description: ["深棕齐下巴圆弧波波头；短齐刘海，不遮眼；微胖体型。苔绿宽松短开衫、奶油内搭、焦糖A字短裙。正面估测约3.31H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.31 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-02/r04-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-02/r04-art.png"}],
      },
      {
        id: "roster-r05", title: ["R05 · 冬日旅行","R05 · Character draft"], status: "candidate",
        description: ["橙金色单侧长辫；辫尾至腰，刘海与D1家族一致；均衡体型。象牙白短呢大衣、青绿围巾、藏蓝直筒长裤。正面估测约3.35H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.35 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-02/r05-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-02/r05-art.png"}],
      },
      {
        id: "roster-r06", title: ["R06 · 东方轻装","R06 · Character draft"], status: "candidate",
        description: ["黑色低发髻；中分两条短鬓发，髻不超过头高基线；纤细体型。玉色交领短外套、米白九分直筒裤、深青布腰带。正面估测约3.16H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.16 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-02/r06-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-02/r06-art.png"}],
      },
      {
        id: "roster-r07", title: ["R07 · 医生","R07 · Character draft"], status: "candidate",
        description: ["暖棕低马尾；干净侧分刘海，不遮眼耳；均衡体型。白色短医师外套、淡蓝刷手衣、深蓝直筒长裤。正面估测约3.26H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.26 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-03/r07-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-03/r07-art.png"}],
      },
      {
        id: "roster-r08", title: ["R08 · 急救员","R08 · Character draft"], status: "candidate",
        description: ["黑色利落短发；偏分，后颈贴合；微胖体型。藏蓝急救夹克、橙色肩部拼片、藏蓝工装长裤。正面估测约3.31H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.31 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-03/r08-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-03/r08-art.png"}],
      },
      {
        id: "roster-r09", title: ["R09 · 野外训练军人","R09 · Character draft"], status: "candidate",
        description: ["黑色极短碎发；露耳，短鬓角，不剃光；健壮体型。橄榄绿训练夹克、低对比迷彩工装长裤、深绿腰带。正面估测约3.29H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.29 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-02/r09-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-02/r09-art.png"}],
      },
      {
        id: "roster-r10", title: ["R10 · 田径运动员","R10 · Character draft"], status: "candidate",
        description: ["栗棕高马尾；侧分刘海，基础头顶与马尾分开识别；健壮体型。蓝白全长运动背心、藏蓝侧条纹跑步短裤。正面估测约3.29H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.29 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-01/r10-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-01/r10-art.png"}],
      },
      {
        id: "roster-r11", title: ["R11 · 网球运动员","R11 · Character draft"], status: "candidate",
        description: ["蜂蜜金单侧辫；额前自然分束，辫尾至肩下；纤细体型。白绿翻领运动上衣、白色百褶运动裙，内置同色安全短裤。正面估测约3.33H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.33 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-03/r11-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-03/r11-art.png"}],
      },
      {
        id: "roster-r12", title: ["R12 · 篮球运动员","R12 · Character draft"], status: "candidate",
        description: ["深棕双编辫；两侧对称，辫尾到肩胛；健壮体型。酒红宽松篮球背心、同色及膝篮球短裤、奶油侧条。正面估测约3.40H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.40 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-03/r12-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-03/r12-art.png"}],
      },
      {
        id: "roster-r13", title: ["R13 · 学院休闲","R13 · Character draft"], status: "candidate",
        description: ["银紫不对称短波波；一侧耳上，另一侧到下巴；纤细体型。藏蓝短西装、浅灰针织内搭、灰蓝格纹A字裙。正面估测约3.23H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.23 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-04/r13-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-04/r13-art.png"}],
      },
      {
        id: "roster-r14", title: ["R14 · 春日花瓣裙","R14 · Character draft"], status: "candidate",
        description: ["蜂蜜金半扎长卷发；发尾至肩胛，不遮腰；均衡体型。灰玫瑰色短袖连衣裙、花瓣叠片裙摆、奶油细腰带。正面估测约3.20H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.20 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-04/r14-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-04/r14-art.png"}],
      },
      {
        id: "roster-r15", title: ["R15 · 咖啡师","R15 · Character draft"], status: "candidate",
        description: ["焦糖棕低双丸子；短卷刘海，体积不超过脸宽；微胖体型。奶油衬衣、咖啡棕短围裙、深绿宽松长裤。正面估测约3.25H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.25 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-04/r15-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-04/r15-art.png"}],
      },
      {
        id: "roster-r16", title: ["R16 · 消防员","R16 · Character draft"], status: "candidate",
        description: ["棕色短碎发；露耳，干净后颈；健壮体型。深炭色防护夹克与长裤、黄灰反光带。正面估测约3.21H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.21 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-04/r16-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-04/r16-art.png"}],
      },
      {
        id: "roster-r17", title: ["R17 · 雨天出行","R17 · Character draft"], status: "candidate",
        description: ["蓝黑锁骨直发；轻薄齐刘海，露出双眼；纤细体型。湖蓝短雨衣、米白短裤、袖口收束。正面估测约3.28H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.28 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-05/r17-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-05/r17-art.png"}],
      },
      {
        id: "roster-r18", title: ["R18 · 都市侦探","R18 · Character draft"], status: "candidate",
        description: ["酒红耳下短发；侧分柔卷，后颈利落；均衡体型。驼色短风衣、炭灰马甲、米白衬衣、细格长裤。正面估测约3.30H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.30 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-05/r18-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-05/r18-art.png"}],
      },
      {
        id: "roster-r19", title: ["R19 · 园艺师","R19 · Character draft"], status: "candidate",
        description: ["铜棕蓬松短卷发；自然圆轮廓，不戴帽；微胖体型。浅绿短袖、卡其背带长裤、布质腰袋。正面估测约3.40H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.40 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-05/r19-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-05/r19-art.png"}],
      },
      {
        id: "roster-r20", title: ["R20 · 机械维修师","R20 · Character draft"], status: "candidate",
        description: ["银灰短后梳；两侧短，顶部低体积；健壮体型。灰蓝连体工装，腰部自然收束、袖子卷至肘下、少量橙色标识。正面估测约3.34H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.34 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-05/r20-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-05/r20-art.png"}],
      },
      {
        id: "roster-r21", title: ["R21 · 星纹法师","R21 · Character draft"], status: "candidate",
        description: ["橙金编辫短波波；单侧小白花，承接原参考女孩；纤细体型。深蓝金边短斗篷、星纹长袖上衣、藏蓝直筒裤。正面估测约3.27H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.27 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-06/r21-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-06/r21-art.png"}],
      },
      {
        id: "roster-r22", title: ["R22 · 礼服军官","R22 · Character draft"], status: "candidate",
        description: ["黑色低盘发；偏分刘海，头后小髻；均衡体型。藏蓝立领礼服短上衣、银色滚边、同色直筒长裤。正面估测约3.15H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.15 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-06/r22-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-06/r22-art.png"}],
      },
      {
        id: "roster-r23", title: ["R23 · 冬日居家","R23 · Character draft"], status: "candidate",
        description: ["栗棕侧低松马尾；碎发自然，不遮面；微胖体型。燕麦色宽松针织上衣、淡灰绿家居长裤。正面估测约3.29H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.29 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-06/r23-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-06/r23-art.png"}],
      },
      {
        id: "roster-r24", title: ["R24 · 足球运动员","R24 · Character draft"], status: "candidate",
        description: ["黑色耳上短卷发；小束卷曲，轮廓紧凑；健壮体型。青白足球短袖球衣、深青运动短裤、白色长运动袜。正面估测约3.31H，目标3.30H。","Four-view concept artwork. Approximate measured front ratio 3.31 heads; target 3.30."],
        evidence: ["四视图原画与独立计算标尺已保存，人工选点误差约±5像素；不是最终定稿或3D比例认证。","Artwork and calculated ruler retained; manual landmarks have approximately ±5 px uncertainty. Final approval pending."],
        images: [{"label":["四视图与标尺检查","Four views with ruler"],"path":"./art-library/roster-24/batch-06/r24-ruler.png"},{"label":["无尺原画","Clean artwork"],"path":"./art-library/roster-24/batch-06/r24-art.png"}],
      },
    ],
  },
  {
    "id": "classics-7",
    "label": [
      "刘关张与西游师徒",
      "Chinese classical characters"
    ],
    "entries": [
      {
        "id": "classics-7-overview",
        "title": [
          "刘关张与悟空 · 第一批重绘",
          "Liu Bei, Guan Yu, Zhang Fei and Wukong · Redraw batch1"
        ],
        "status": "candidate",
        "description": [
          "四款重绘，每人一个固定造型、四个视角。其余三款旧稿已否决，待下一批。",
          "Four redrawn designs with one fixed appearance each; three others pending."
        ],
        "evidence": [
          "用户否决旧风格；以游戏主角原图重新制作，尚待选型。",
          "Previous style rejected. Redrawn against the game protagonist; approval pending."
        ],
        "images": [
          {
            "label": [
              "第一批四款重绘",
              "Four redrawn sheets"
            ],
            "path": "./art-library/classics-7/overview-game-v2.png"
          }
        ]
      },
      {
        "id": "classics-c01",
        "title": [
          "刘备 · 游戏画风重绘",
          "Liu Bei · Game-style redraw"
        ],
        "status": "candidate",
        "description": [
          "温和圆脸、棕色大眼睛，黑色低束髻与细短髭。玉绿色及膝外袍配象牙白交领内衣，简洁小肩甲、棕色腰带、青灰宽松长裤和浅棕短靴；均衡体型。",
          "Liu Bei. Kind adult male, bright brown rounded eyes, soft rounded-square jaw, calm smile, black swept hair with LOW compact tied bun. Only a fine small moustache and tiny separated chin goatee, jaw still visible. Simple ivory cross-collar tunic with jade-green short open coat, thin clean gold border, brown waist belt, dark blue-green trousers, cream/brown low ankle boots. Robe hem near knees rather than hiding all legs. Small plain shoulder guards, NO elaborate armor. Warm friendly gentleman-warrior, slim-balanced width."
        ],
        "evidence": [
          "可见基础发冠与下巴轮廓估读，束髻和小山羊胡不计H。 新稿待选型。",
          "Outline estimates or target guide only; pending approval."
        ],
        "images": [
          {
            "label": [
              "唯一造型四视图",
              "Single-design four views"
            ],
            "path": "./art-library/classics-7/c01-game-v2.png"
          },
          {
            "label": [
              "比例检查标尺",
              "Proportion ruler"
            ],
            "path": "./art-library/classics-7/c01-game-v2-ruler.png"
          }
        ]
      },
      {
        "id": "classics-c02",
        "title": [
          "关羽 · 游戏画风重绘",
          "Guan Yu · Game-style redraw"
        ],
        "status": "candidate",
        "description": [
          "沉稳的圆眼和枣红脸，绿色低头巾、黑色长须。深绿战袍配简化金色胸甲与护腕，棕色腰带和短战靴；肩部略宽，保持主角的紧凑四肢。",
          "Guan Yu. Adult male general with warm muted reddish complexion (intentional character cue), big calm rounded amber eyes, level bold eyebrows, full rounded cranium. Deep green low close-fitting headcloth no towering knot. Iconic long black smooth tapered beard (three clean sculpted clumps, not wiry) begins UNDER visible jawline. Deep jade green knee-length robe over cream cross-collar inner, simple muted gold chest guard with broad clean panels, brown belt, dark trousers, neat brown boots. Moderately broad shoulders, dignified expression; no terrifying scowl or ultra-muscular limbs. Bright green/gold, NOT blackened medieval armor."
        ],
        "evidence": [
          "头巾遮住头顶、长须遮住下颌；头部选点为估读，紫尺只作3.3H目标参考。 新稿待选型。",
          "Outline estimates or target guide only; pending approval."
        ],
        "images": [
          {
            "label": [
              "唯一造型四视图",
              "Single-design four views"
            ],
            "path": "./art-library/classics-7/c02-game-v2.png"
          },
          {
            "label": [
              "比例检查标尺",
              "Proportion ruler"
            ],
            "path": "./art-library/classics-7/c02-game-v2-ruler.png"
          }
        ]
      },
      {
        "id": "classics-c03",
        "title": [
          "张飞 · 游戏画风重绘",
          "Zhang Fei · Game-style redraw"
        ],
        "status": "candidate",
        "description": [
          "黑色蓬松短发与红发带，浓眉、大圆眼、爽朗笑容和短络腮胡。赤红短战袍配深灰小肩甲，藏蓝裤、棕金短靴；宽肩厚实，腿部不过度加粗。",
          "Zhang Fei. Adult stocky strong male, lively big rounded darkbrown eyes, broad friendly rounded-square face, thick eyebrows gently curved rather than angry V, wide determined grin. Short black tousled sculpted hair with small red tie, short rounded black beard below clearly legible chin. Warm medium skin, red jacket with dark charcoal simple armor panels and narrow gold trim, cream cross collar, brown belt, navy compact trousers, brown ankleboots. Stronger shoulder/torso width and forearms, SAME head/height rhythm as hero, NOT thick stump-like legs. Clean cheerful gamehero quality, no tiny scales or dragon filigree."
        ],
        "evidence": [
          "束髻不计H，下颌被短须覆盖；紫尺为目标参考，不认证裸头比例。 新稿待选型。",
          "Outline estimates or target guide only; pending approval."
        ],
        "images": [
          {
            "label": [
              "唯一造型四视图",
              "Single-design four views"
            ],
            "path": "./art-library/classics-7/c03-game-v2.png"
          },
          {
            "label": [
              "比例检查标尺",
              "Proportion ruler"
            ],
            "path": "./art-library/classics-7/c03-game-v2-ruler.png"
          }
        ]
      },
      {
        "id": "classics-c04",
        "title": [
          "孙悟空 · 游戏画风重绘",
          "Sun Wukong · Game-style redraw"
        ],
        "status": "candidate",
        "description": [
          "金色块状头毛、圆猴耳、奶油色面部和棕金大眼，低金箍。红金短外套、象牙白内衣、腰部小块虎皮、藏蓝裤与绑腿短靴；灵巧体型，细尾巴。",
          "Sun Wukong. Adult anthropomorphic monkey hero with lively big rounded gold-brown eyes, warm golden fur, cream smooth monkeyface heart-shaped patch, compact rounded cranium and small rounded monkeyears. Swept golden sculpted hair clumps with low gold circlet, friendly confident closed-mouth smile. Scarlet short jacket with simple gold trim and creaminner, small clean gold chest panel, tigerstripe small waistcloth limited to waist, navy compact trousers, cream legwraps, brown/gold low boots. Slender agile width, SAME3.3 head anatomy as source. One slim curved tail visible in side/back45 attached anatomically to lower back; not oversized. No staff in hand, no dragon filigree, no battle glare."
        ],
        "evidence": [
          "以基础头毛轮廓估读；高翘毛束、猴耳和尾巴不计H。 新稿待选型。",
          "Outline estimates or target guide only; pending approval."
        ],
        "images": [
          {
            "label": [
              "唯一造型四视图",
              "Single-design four views"
            ],
            "path": "./art-library/classics-7/c04-game-v2.png"
          },
          {
            "label": [
              "比例检查标尺",
              "Proportion ruler"
            ],
            "path": "./art-library/classics-7/c04-game-v2-ruler.png"
          }
        ]
      }
    ]
  },
  {
    id: 'characters', label: ["角色设定","Characters"], entries: [
      {
        id: 'd1-base', title: ["D1 · 无外服赤脚基础版","D1 · Barefoot base design"], status: 'confirmed',
        description: ["用于捏人和换装的基础造型：保留蓝色两件式泳装，去掉外服、装备和鞋子。原确认稿为造型依据；首图是后续补齐斜前视角与脚底的修订。约 3.3 头身是设计目标，未进行精确图像测量。","A base for customization, with blue two-piece swimwear and no outer outfit, equipment or shoes. The approved source defines the design; the first image adds a three-quarter view and soles. Approximately 3.3 heads is a design target, not a measured result."],
        evidence: ["指定会话「设计主角捏人方案 (2)」：用户对原图说“这个就合适”，随后要求提高画质、修正斜前视角、补充脚底。高清稿与脚底稿是按该确认制作的派生版本。","In the specified design chat, the user approved the source, then requested a clearer redraw, a corrected three-quarter view and sole references. The redraws derive from that approval."],
        images: [
          { label: ["视角与脚底修订 V2","View and sole revision V2"], path: './art-library/d1-base/d1-approved-swim-angle-soles-v2.png' },
          { label: ["用户确认的原图","User-approved original"], path: './art-library/d1-base/d1-approved-swim-source.jpg' },
          { label: ["高清重绘 V1","Clear redraw V1"], path: './art-library/d1-base/d1-approved-swim-restored-v1.png' },
        ],
      },
      {
        id: 'd1-bald', title: ["D1 · 无头发基础版","D1 · Bald base"], status: 'derived',
        description: ["去掉头发，保留泳装与赤脚，用于观察头型和制作可替换发型。四个全身视角及脚底图均保留。","Hair removed for interchangeable hairstyles; swimwear, bare feet, four body views and soles are retained."],
        evidence: ["用户在确认基础造型后要求制作“不带头发的版本”；本图为按确认稿派生，未找到对这张结果单独定稿的记录。","Requested after the base approval; this is a derivative without separate final approval."],
        images: [
          { label: ["无头发四视图与脚底","Bald views and soles"], path: './art-library/d1-bald/d1-swim-bald-v1.png' },
        ],
      },
      {
        id: 'd1-hair', title: ["D1 · 发型试稿","D1 · Hairstyle studies"], status: 'candidate',
        description: ["黑长直、短发和双马尾的换发型参考。部分短发版本曾被要求继续修改。","Long black hair, cropped hair and twin-tail studies. Some short hairstyles were explicitly sent back for revision."],
        evidence: ["用户要求探索多个发型；不将制作请求等同于最终选型确认。","The user requested alternatives; creation requests are not final design approval."],
        images: [
          { label: ["黑长直","Long black hair"], path: './art-library/d1-hair/d1-swim-long-black-v1.png' },
          { label: ["金铜短发 V2","Copper pixie V2"], path: './art-library/d1-hair/d1-swim-pixie-v2.png' },
          { label: ["黑色短发","Black pixie"], path: './art-library/d1-hair/d1-swim-black-pixie-v1.png' },
          { label: ["黑色双马尾","Black twin tails"], path: './art-library/d1-hair/d1-swim-black-twintails-v1.png' },
        ],
      },
      {
        id: 'd1-seven', title: ["D1 · 蓝白裙七视图","D1 · Blue-white dress sheet"], status: 'confirmed',
        description: ["较早确认的蓝白金裙装参考，包含全身、脸部、头顶和鞋底细节；与最新泳装基础版分别保留。","Earlier approved blue-white-gold costume sheet with body, face, crown and sole details, retained separately from the newer base."],
        evidence: ["精修记录明确以用户确认的七视图为依据；仓库副本与原始生成图 SHA-256 一致。","The refinement record identifies the approved seven-view reference; its repository copy matches the original SHA-256."],
        images: [
          { label: ["七视图原画","Seven-view artwork"], path: './art-library/d1-seven/character-seven-views.png' },
        ],
      },
      {
        id: 'd1-equipped', title: ["D1 · 带装备正侧设定","D1 · Equipped design"], status: 'confirmed',
        description: ["较早确认的短细腿蓝白裙方案，带护腕和背包，保留为服饰版本。","Earlier slim-leg dress design with wrist gear and a backpack, retained as a costume version."],
        evidence: ["d1-comparison/README.md 明确登记为“已确认的设计”。","The model-comparison source record explicitly marks this design as approved."],
        images: [
          { label: ["正面与右侧","Front and right"], path: './art-library/d1-equipped/slim-legs-front-right-v1.png' },
        ],
      },
      {
        id: 'grassy-human', title: ["Grassy · 红毛衣人形","Grassy · Red sweater form"], status: 'confirmed',
        description: ["保留既有人形四方向母版。右侧为确认原图，其他方向及角色卡按确认造型绘制。","The established four-view master: approved right profile, with derived views and character card."],
        evidence: ["public/characters/human/SOURCE.md 与历史来源说明记录右侧母版和最终四向参考。","Human character source records identify the approved right master and the final reference set."],
        images: [
          { label: ["右侧母版","Right master"], path: './characters/human/turnaround-master-v2/right.png' },
          { label: ["正面","Front"], path: './characters/human/turnaround-master-v2/front.png' },
          { label: ["背面","Back"], path: './characters/human/turnaround-master-v2/back.png' },
          { label: ["左侧","Left"], path: './characters/human/turnaround-master-v2/left.png' },
          { label: ["角色卡","Character card"], path: './characters/human/grassy-human-card.png' },
        ],
      },
      {
        id: 'grassy-pelican', title: ["Grassy · 鹈鹕角色卡","Grassy · Pelican card"], status: 'derived',
        description: ["从确认的双形态角色卡独立绘制，中性白羽毛、黄色喙。","A standalone card derived from the approved dual-form design, with white feathers and a yellow bill."],
        evidence: ["鹈鹕 SOURCE.md 明确说明来源为已确认角色卡；原画不等同于实时模型。","The Pelican source record identifies the approved parent design; artwork is distinct from the real-time model."],
        images: [
          { label: ["鹈鹕角色卡","Pelican card"], path: './characters/pelican/grassy-pelican-card.png' },
        ],
      },
      {
        id: 'tibo-human', title: ["Tibo · 人形四方向","Tibo · Human references"], status: 'confirmed',
        description: ["人形四方向绘制参考，保留棕色发型、黑帽衫与重置徽章。","Four illustrated human references with brown hair, black hoodie and reset badge."],
        evidence: ["Tibo 来源说明明确为“基于已批准人形四向稿整理”。","Tibo's source record explicitly states that these derive from the approved human sheet."],
        images: [
          { label: ["已批准人形四向总图","Approved human turnaround"], path: './art-library/tibo-human/tibo-human-turnaround.png' },
          { label: ["正面","Front"], path: './characters/tibo/human/reference-front.png' },
          { label: ["右侧","Right"], path: './characters/tibo/human/reference-right.png' },
          { label: ["背面","Back"], path: './characters/tibo/human/reference-back.png' },
          { label: ["左侧","Left"], path: './characters/tibo/human/reference-left.png' },
        ],
      },

      {
        id: 'npc-identity-masters', title: ["Sam / Tibo · 早期身份母稿","Sam / Tibo · Early identity masters"], status: 'confirmed',
        description: ["用于后续动物形态设计的早期人形身份参考，保留历史选型；不替代新版人形四向稿。","Early human identity references selected for subsequent animal designs; retained as historical choices, not replacements for the later human turnarounds."],
        evidence: ["「第一章怪物」用户重新附上这两张图，说“基于这个绘制形象,你来吧”（01a10833-cdd2-7571-97fe-0ba4d67a6d12）。","The user reattached both portraits and requested that the character designs be based on them."],
        images: [
          { label: ["Sam 早期身份稿","Sam early portrait"], path: './art-library/npc-identity-masters/sam-front.png' },
          { label: ["Tibo 早期身份稿","Tibo early portrait"], path: './art-library/npc-identity-masters/tibo-front.png' },
        ],
      },
      {
        id: 'sam-human-master', title: ["Sam · 已选人形四向总图","Sam · Selected human turnaround"], status: 'confirmed',
        description: ["修订胸章方向后的人形四向总图，保留作为人形制作依据。","Human turnaround after the chest-emblem correction, retained as the selected production reference."],
        evidence: ["「第一章怪物」展示修订后的 Sam/Tibo 四向总图后，用户回复“可以”（01a10d1d-127f-79a1-b656-4516361c3cbc），随后要求“先完成sam”。","The user accepted the revised Sam/Tibo turnarounds and then requested Sam production first."],
        images: [
          { label: ["Sam 人形四向总图","Sam human turnaround"], path: './art-library/sam-human-master/sam-human-turnaround.png' },
        ],
      },
      {
        id: 'npc-animal-masters', title: ["Sam 白鼬 / Tibo 鼹鼠 · 已选母稿","Sam stoat / Tibo mole · Selected masters"], status: 'confirmed',
        description: ["Sam 白鼬 V4 与 Tibo 鼹鼠 V3 正面原稿。作为当时采纳的制作依据保存，后续四向图与模型不因此视为逐项验收。","Sam stoat V4 and Tibo mole V3 front masters, selected as production references; this does not approve later views or models."],
        evidence: ["归档会话「第一章怪物」：Sam V4 修订后，用户说“开始完成这2个角色的制作”（01a1083a-8540-79d1-b7fd-f3cccd5948b0），随后明确授权完成；上传记录对应 Sam V4 与 Tibo V3。","After Sam V4 was revised, the user requested production of both characters. The production record identifies Sam V4 and Tibo V3."],
        images: [
          { label: ["Sam 白鼬 V4","Sam stoat V4"], path: './art-library/npc-animal-masters/sam-the-model-router-front.png' },
          { label: ["Tibo 鼹鼠 V3","Tibo mole V3"], path: './art-library/npc-animal-masters/tibo-the-reset-master-front.png' },
        ],
      },

      {
        id: 'npc-references', title: ["Sam / Tibo · 其他形态参考","Sam / Tibo · Other forms"], status: 'candidate',
        description: ["Sam 人形与白鼬、Tibo 鼹鼠的四方向原画，均已用于制作；本轮未找到逐套明确的最终确认记录。","Four-view references for Sam's human and stoat forms and Tibo's mole form. Used for production, but explicit approval for each set was not located."],
        evidence: ["来源文件记录用途和生成来源，不将已用于建模自动标为已确认。","Production use and source records do not automatically establish final approval."],
        images: [
          { label: ["Sam 人形 · 正面","Sam human · Front"], path: './characters/sam/human/reference-front.png' },
          { label: ["Sam 人形 · 右侧","Sam human · Right"], path: './characters/sam/human/reference-right.png' },
          { label: ["Sam 人形 · 背面","Sam human · Back"], path: './characters/sam/human/reference-back.png' },
          { label: ["Sam 人形 · 左侧","Sam human · Left"], path: './characters/sam/human/reference-left.png' },
          { label: ["Sam 白鼬 · 正面","Sam stoat · Front"], path: './characters/sam/reference-front.png' },
          { label: ["Sam 白鼬 · 右侧","Sam stoat · Right"], path: './characters/sam/reference-right.png' },
          { label: ["Sam 白鼬 · 背面","Sam stoat · Back"], path: './characters/sam/reference-back.png' },
          { label: ["Sam 白鼬 · 左侧","Sam stoat · Left"], path: './characters/sam/reference-left.png' },
          { label: ["Tibo 鼹鼠 · 正面","Tibo mole · Front"], path: './characters/tibo/reference-front.png' },
          { label: ["Tibo 鼹鼠 · 右侧","Tibo mole · Right"], path: './characters/tibo/reference-right.png' },
          { label: ["Tibo 鼹鼠 · 背面","Tibo mole · Back"], path: './characters/tibo/reference-back.png' },
          { label: ["Tibo 鼹鼠 · 左侧","Tibo mole · Left"], path: './characters/tibo/reference-left.png' },
        ],
      },
    ],
  },
  {
    id: 'enemies', label: ["敌人设定","Enemies"], entries: [
      {
        id: 'omi', title: ["欧米 OMI-01","OMI-01"], status: 'confirmed',
        description: ["确认图中间的大头短肢双钳机器人，白色与藏蓝装甲、青色腹板、琥珀单环眼。","The central compact dual-gripper robot with white/navy armour, teal abdomen and amber eye ring."],
        evidence: ["欧米制作记录明确采用已确认造型；敌人来源文件指向此原图。","The OMI production and source records identify this approved design."],
        images: [
          { label: ["确认造型","Approved design"], path: './art-library/omi/approved-character.png' },
        ],
      },
      {
        id: 'omi-actions', title: ["欧米 · 动作与技能","OMI · Actions and skills"], status: 'derived',
        description: ["基础动作、夹爪横扫、突进夹击分镜，按确认角色造型制作。","Basic actions, clamp sweep and dash-clamp sheets derived from the approved robot."],
        evidence: ["omi-01-actions 生成记录锁定 approved-character.png 造型；动作图不单独宣称已批准。","Generation records lock the approved character; the action sheets are not independently marked approved."],
        images: [
          { label: ["基础动作","Basic actions"], path: './art-library/omi-actions/basic-actions.png' },
          { label: ["夹爪横扫","Clamp sweep"], path: './art-library/omi-actions/skill-01-clamp-sweep.png' },
          { label: ["突进夹击","Dash clamp"], path: './art-library/omi-actions/skill-02-dash-clamp.png' },
        ],
      },
      {
        id: 'watch-wasp', title: ["哨蜂 · 白壳无人机","Watch Wasp · White drone"], status: 'confirmed',
        description: ["白壳四旋翼确认参考与定稿多视图。","Approved white quadrotor reference and final multi-view design."],
        evidence: ["白壳无人机制作记录明确批准参考造型，正式来源文件指定 compact-drone-views.png 为美术定稿。","Drone production records confirm the design; the source names compact-drone-views.png as the final artwork."],
        images: [
          { label: ["批准参考","Approved reference"], path: './art-library/watch-wasp/approved-reference.png' },
          { label: ["定稿多视图","Final views"], path: './art-library/watch-wasp/compact-drone-views.png' },
        ],
      },
      {
        id: 'wasp-actions', title: ["哨蜂 · 飞行与铝热剂","Watch Wasp · Flight and thermite"], status: 'derived',
        description: ["定稿无人机的倾斜飞行与铝热剂攻击设定。","Tilted flight and thermite attack studies based on the final drone."],
        evidence: ["配套概念图随确认无人机方案保存，区别于实际模型渲染。","Companion studies saved with the approved drone design, distinct from model renders."],
        images: [
          { label: ["倾斜飞行","Tilted flight"], path: './characters/enemies/watch-wasp/flight-concept.png' },
          { label: ["铝热剂攻击","Thermite attack"], path: './characters/enemies/watch-wasp/thermite-concept.png' },
        ],
      },
      {
        id: 'line-hound', title: ["巡线犬 · 正侧面","Line Hound · Front and side"], status: 'confirmed',
        description: ["巡线犬造型参考。","Line Hound character reference."],
        evidence: ["来源说明明确为“项目已确认的正面／侧面设定”。","The source explicitly identifies the approved front/side design."],
        images: [
          { label: ["正侧面原画","Front/side artwork"], path: './characters/enemies/line-hound/reference.png' },
        ],
      },
      {
        id: 'loadmaster', title: ["搬山 · 正侧面","Loadmaster · Front and side"], status: 'candidate',
        description: ["建模采用的轮式重型机械角色参考。","Wheeled heavy robot reference used for modeling."],
        evidence: ["已找到制作来源，但没有将原画单独标为最终确认的记录。","Production provenance exists; separate final artwork approval was not located."],
        images: [
          { label: ["正侧面原画","Front/side artwork"], path: './art-library/loadmaster/loadmaster.png' },
        ],
      },
    ],
  },
  {
    id: 'equipment', label: ["装备与技能","Equipment and skills"], entries: [
      {
        id: 'npc-weapon-selection', title: ["Sam / Tibo · 已选武器方案","Sam / Tibo · Selected weapons"], status: 'confirmed',
        description: ["确认组合为 Sam B 路由核心与 Tibo A 重置锤。图中其余候选未被一并确认；之后 Sam 又明确改为平时手持法杖、仅大招升至头顶。","The selected combination is Sam B routing core and Tibo A reset hammer. Other alternatives were not approved; Sam later received a handheld-staff requirement outside his ultimate."],
        evidence: ["「第一章怪物」推荐该组合后，用户说“可以按照这个继续开发,这样他们就有普通攻击了”（01a10fed-54a6-7c42-b6d9-dc0ccc919cfa）。记录的是该阶段的已采纳方案。","After the combination was recommended, the user approved continuing development with it for their basic attacks. This records the selected design at that stage."],
        images: [
          { label: ["四案对照 · 已选 Sam B / Tibo A","Four alternatives · Sam B / Tibo A selected"], path: './art-library/npc-weapon-selection/weapon-concepts.png' },
        ],
      },
      {
        id: 'grassy-equipment', title: ["Grassy · 三张装备定稿","Grassy · Equipment designs"], status: 'confirmed',
        description: ["推进飞行、Codex 键盘攻击和日常键盘背负。","Powered flight, Codex keyboard attack and stowed keyboard."],
        evidence: ["人形来源说明明确为“三张用户确认”并授权收入资料库。","The character source explicitly records three user-approved images authorized for the library."],
        images: [
          { label: ["推进飞行","Powered flight"], path: './characters/human/equipment-concepts/flight.png' },
          { label: ["Codex 攻击","Codex attack"], path: './characters/human/equipment-concepts/codex-attack.png' },
          { label: ["键盘背负","Stowed keyboard"], path: './characters/human/equipment-concepts/keyboard-stowed.png' },
        ],
      },
      {
        id: 'keyboard-combo', title: ["单手键盘连击","One-handed keyboard combo"], status: 'confirmed',
        description: ["单手握键盘短端挥击，替代早期双手方案。","One-handed swings holding the keyboard end, replacing the earlier two-handed concept."],
        evidence: ["人形来源说明明确当前使用已确认的单手版本。","The character source identifies the approved one-handed version."],
        images: [
          { label: ["单手连击","One-handed combo"], path: './characters/human/equipment-concepts/combat-v2/keyboard-one-hand-combo.png' },
        ],
      },
      {
        id: 'combat-studies', title: ["Grassy · 技能效果试稿","Grassy · Combat studies"], status: 'candidate',
        description: ["光弹、虫群、超载和空中攻击方案；保留版本，不把较新文件自动视为定稿。","Projectile, bug, overload and airborne concepts; newer files are not automatically final designs."],
        evidence: ["现有角色图库收录；超载 V5 说明明确为设计预览。本轮未定位这些效果图逐项确认记录。","Present in the existing gallery; overload V5 is explicitly a preview. Individual approvals were not established."],
        images: [
          { label: ["Codex 光弹","Codex projectile"], path: './characters/human/equipment-concepts/combat-v2/codex-barrage.png' },
          { label: ["Bug 虫群","Bug swarm"], path: './characters/human/equipment-concepts/combat-v2/bug-swarm.png' },
          { label: ["服务器超载 V2","Server overload V2"], path: './characters/human/equipment-concepts/combat-v2/server-overload.png' },
          { label: ["服务器超载 V4","Server overload V4"], path: './characters/human/equipment-concepts/combat-v4/server-overload.png' },
          { label: ["服务器超载 V5","Server overload V5"], path: './characters/human/equipment-concepts/combat-v5/server-overload.png' },
          { label: ["空中键盘","Airborne keyboard"], path: './characters/human/equipment-concepts/combat-v3/airborne-keyboard.png' },
          { label: ["空中 Codex","Airborne Codex"], path: './characters/human/equipment-concepts/combat-v3/airborne-codex.png' },
          { label: ["空中 Bug","Airborne Bug"], path: './characters/human/equipment-concepts/combat-v3/airborne-bug.png' },
          { label: ["空中超载","Airborne overload"], path: './characters/human/equipment-concepts/combat-v3/airborne-overload.png' },
        ],
      },
      {
        id: 'd1-outfits', title: ["D1 · 服装探索","D1 · Costume studies"], status: 'candidate',
        description: ["六套服装、三套修订、星纹长袍 V2/V3，以及最新 D/E 发型服饰组合。V2 曾被指出比例偏长；V3 和新组合仍待确认，不替代已确认身体底稿。","Six outfits, three revisions, star robe V2/V3 and new D/E hairstyle-costume combinations. V2 was criticized for elongated proportions; V3 and the new sets await approval."],
        evidence: ["指定会话中仍在修改服装与比例，尚无最终选定结果。","The specified chat continues revising these outfits and proportions; no final selection is recorded."],
        images: [
          { label: ["星纹长袍 · 身体底稿修订 V3","Star robe · Source-fit V3"], path: './art-library/d1-outfits/d1-star-robe-source-fit-v3.png' },
          { label: ["服装与发型组合 D","Outfit and hairstyle set D"], path: './art-library/d1-outfits/d1-wardrobe-d-v1.png' },
          { label: ["服装与发型组合 E","Outfit and hairstyle set E"], path: './art-library/d1-outfits/d1-wardrobe-e-v1.png' },
          { label: ["六套服装","Six costumes"], path: './art-library/d1-outfits/d1-six-outfits-v1.png' },
          { label: ["三套服装修订","Three costume revisions"], path: './art-library/d1-outfits/d1-three-outfits-v2.png' },
          { label: ["星纹长袍 V2","Star robe V2"], path: './art-library/d1-outfits/d1-star-robe-four-views-v2.png' },
        ],
      },
      {
        id: 'npc-skills', title: ["鹈鹕与 NPC · 技能参考","Pelican and NPC · Skill studies"], status: 'candidate',
        description: ["鹈鹕普通攻击与技能、光子大招，以及 Sam/Tibo 技能图。","Pelican attacks, Photon ultimate and Sam/Tibo skill sheets."],
        evidence: ["绘图资料已保存；本轮未核实每张结果的最终确认记录。","Artwork is retained; final approval was not established for each image."],
        images: [
          { label: ["鹈鹕攻击与技能","Pelican attacks"], path: './characters/pelican/skill-concepts/normal-and-three-skills-v1.png' },
          { label: ["光子群大招","Photon swarm"], path: './characters/pelican/skill-concepts/photon-swarm-ultimate-v1.png' },
          { label: ["Sam 技能","Sam skills"], path: './art-library/npc-skills/sam-skills-v1.png' },
          { label: ["Tibo 技能","Tibo skills"], path: './art-library/npc-skills/tibo-skills-v1.png' },
        ],
      },
    ],
  },
  {
    id: 'scenes', label: ["场景与建筑","Scenes and buildings"], entries: [
      {
        id: 'expanded-style-studies', title: ["世界画风 · 水墨与其他探索","World styles · Expanded studies"], status: 'candidate',
        description: ["用于研究不同风格的对照原画，尚未选为游戏统一美术方案。","Comparative artwork for researching visual styles; not selected as the final game art direction."],
        evidence: ["会话「设计主角捏人方案 (3)」中用户要求“都进行绘制”及“扩大风格范围”；这些是探索请求，未找到逐款选定记录。","The user requested multiple styles and a broader exploration. These requests do not approve individual alternatives."],
        images: [
          { label: ["中国水墨","01-chinese-ink"], path: './art-library/expanded-style-studies/01-chinese-ink.png' },
          { label: ["清线漫画","02-ligne-claire"], path: './art-library/expanded-style-studies/02-ligne-claire.png' },
          { label: ["复古动画","03-rubber-hose"], path: './art-library/expanded-style-studies/03-rubber-hose.png' },
          { label: ["彩色玻璃","04-stained-glass"], path: './art-library/expanded-style-studies/04-stained-glass.png' },
          { label: ["霓虹科幻","05-neon-scifi"], path: './art-library/expanded-style-studies/05-neon-scifi.png' },
          { label: ["体素积木","06-voxel"], path: './art-library/expanded-style-studies/06-voxel.png' },
        ],
      },

      {
        id: 'additional-style-studies', title: ["世界画风 · 八种材质对照","World styles · Eight media"], status: 'candidate',
        description: ["用于研究不同风格的对照原画，尚未选为游戏统一美术方案。","Comparative artwork for researching visual styles; not selected as the final game art direction."],
        evidence: ["会话「设计主角捏人方案 (3)」中用户要求“都进行绘制”及“扩大风格范围”；这些是探索请求，未找到逐款选定记录。","The user requested multiple styles and a broader exploration. These requests do not approve individual alternatives."],
        images: [
          { label: ["手绘童话","01-storybook"], path: './art-library/additional-style-studies/01-storybook.png' },
          { label: ["水彩动画","02-watercolor"], path: './art-library/additional-style-studies/02-watercolor.png' },
          { label: ["纸片剪纸","03-papercut"], path: './art-library/additional-style-studies/03-papercut.png' },
          { label: ["高清像素","04-pixel-art"], path: './art-library/additional-style-studies/04-pixel-art.png' },
          { label: ["像素角色与立体场景","05-pixel-in-3d"], path: './art-library/additional-style-studies/05-pixel-in-3d.png' },
          { label: ["微缩模型","06-miniature"], path: './art-library/additional-style-studies/06-miniature.png' },
          { label: ["暗色童话","07-dark-fairytale"], path: './art-library/additional-style-studies/07-dark-fairytale.png' },
          { label: ["几何卡通","08-geometric-cartoon"], path: './art-library/additional-style-studies/08-geometric-cartoon.png' },
        ],
      },

      {
        id: 'anime-style-studies', title: ["世界画风 · 六种动漫对照","World styles · Anime comparison"], status: 'candidate',
        description: ["用于研究不同风格的对照原画，尚未选为游戏统一美术方案。","Comparative artwork for researching visual styles; not selected as the final game art direction."],
        evidence: ["会话「设计主角捏人方案 (3)」中用户要求“都进行绘制”及“扩大风格范围”；这些是探索请求，未找到逐款选定记录。","The user requested multiple styles and a broader exploration. These requests do not approve individual alternatives."],
        images: [
          { label: ["传统赛璐璐","01-traditional-cel"], path: './art-library/anime-style-studies/01-traditional-cel.png' },
          { label: ["精细动漫 RPG","02-polished-anime-rpg"], path: './art-library/anime-style-studies/02-polished-anime-rpg.png' },
          { label: ["绘画感幻想","03-painterly-fantasy"], path: './art-library/anime-style-studies/03-painterly-fantasy.png' },
          { label: ["厚涂动漫","04-painted-anime"], path: './art-library/anime-style-studies/04-painted-anime.png' },
          { label: ["强漫画","05-bold-manga"], path: './art-library/anime-style-studies/05-bold-manga.png' },
          { label: ["Q 版 SD","06-chibi-sd"], path: './art-library/anime-style-studies/06-chibi-sd.png' },
        ],
      },

      {
        id: 'technology-camera-studies', title: ["科技场景 · 视角返工记录","Technology scenes · Camera revisions"], status: 'candidate',
        description: ["首图为按实际游戏截图重画的湖边住宅，尚待确认；其余野外、室内、湖边三图曾被明确指出不符合游戏视角，保留作返工对照。","The first image is a game-screenshot-based lakeside revision awaiting approval. The other three images were rejected for incompatible camera framing."],
        evidence: ["「设计主角捏人方案 (3)」中用户说“都不合适我们的游戏视角”（01a12109-478d-7992-9ba5-e49e8bbdd808），随后才按游戏截图重绘。","The user rejected all three location views before the screenshot-based revision was made."],
        images: [
          { label: ["游戏镜头重绘 · 待确认","Game-camera revision · Pending"], path: './art-library/technology-camera-studies/01-lakeside-home.png' },
          { label: ["野外 · 视角被否定","Wilderness · Rejected framing"], path: './art-library/technology-camera-studies/01-wilderness.png' },
          { label: ["室内 · 视角被否定","Interior · Rejected framing"], path: './art-library/technology-camera-studies/02-home-interior.png' },
          { label: ["湖边 · 视角被否定","Lakeside · Rejected framing"], path: './art-library/technology-camera-studies/03-lakeside.png' },
        ],
      },

      {
        id: 'homestead-components', title: ["家园 · 门、太阳能与设施","Homestead · Doors, solar and facilities"], status: 'candidate',
        description: ["能量门包边、可倾斜太阳能、工作站、蓄电池、机器人坞、仓库和商店终端。太阳能最终要求只保留面板与底座；图中的砖底和尺寸不能作为定稿依据。","Energy-door edges, tilting solar panels, compute stations, batteries, docks, storage and terminals. The final solar requirement removes the building block beneath the panel."],
        evidence: ["「制作鹈鹕 429 首批概念资产」包含多轮返工。保留最新功能探索，未把用户确定功能种类视为确认每张成图。","The first concept-assets chat contains repeated revisions. Agreement on component functions does not establish approval of every image."],
        images: [
          { label: ["能量门包边修订","Sealed energy door"], path: './art-library/homestead-components/energy-door-sealed-edge.png' },
          { label: ["可倾斜太阳能","Tilting solar"], path: './art-library/homestead-components/tilting-solar-study.png' },
          { label: ["工作站、电池与机器人坞","Compute, battery and dock"], path: './art-library/homestead-components/power-compute-dock.png' },
          { label: ["仓库与商店终端","Storage and terminals"], path: './art-library/homestead-components/storage-trade-terminals.png' },
          { label: ["剖面分层说明","Cutaway layers"], path: './art-library/homestead-components/layer-study.png' },
        ],
      },

      {
        id: 'clean-future-approved', title: ["白蓝科技世界 · 已选风格","Clean future · Selected style"], status: 'confirmed',
        description: ["按 D1 原图修正男女主比例后的白蓝科技场景。确认的是风格方向，不代表构图、角色占屏比或所有场景已经通过游戏镜头验收。","White-blue future scene with revised hero proportions. Approval covers the style direction, not camera framing or gameplay scale."],
        evidence: ["会话「设计主角捏人方案 (3)」：本图完成后，用户说“这个风格可以多绘制一些”（01a120f2-9933-7c42-a34c-4d2ffac703ae）。随后生成的野外、室内、湖边三图被指出游戏视角不合适，另列返工稿。","The user requested more scenes in this style after this revision. The subsequent three location images were criticized for their game-camera framing and are archived separately."],
        images: [
          { label: ["人物比例修订 V2","Proportion revision V2"], path: './art-library/clean-future-approved/01-clean-future-proportions-v2.png' },
        ],
      },

      {
        id: 'garden-city-approved', title: ["花园城区 · 已选风格","Garden city · Selected style"], status: 'confirmed',
        description: ["暖白建筑、蓝色腰线、圆窗与河岸远景。确认范围是美术风格；建筑剖面、格子拼装和门的方向后来另行修改。","Warm white architecture, blue trim, round windows and a riverside skyline. Approval covers the art direction; cutaways, tiles and door orientation were revised separately."],
        evidence: ["会话「制作鹈鹕 429 首批概念资产」：用户先说“风格可以了”，随后附上本图要求“按照这个制作”（01a11cde-7ecd-7c23-b878-8f73c529cd7a）。","In the first concept-assets chat, the user accepted the style, then attached this image and requested production based on it."],
        images: [
          { label: ["已选花园城区原图","Selected garden city"], path: './art-library/garden-city-approved/garden-city-approved.png' },
        ],
      },

      {
        id: 'fortress', title: ["山体算力堡垒","Mountain compute fortress"], status: 'confirmed',
        description: ["已确认机房场景概念，保留原画构图与气氛。","Approved facility scene concept, preserving its composition and atmosphere."],
        evidence: ["三大机房制作记录明确为“三张已确认概念设计”。","The facility implementation record explicitly identifies three approved concepts."],
        images: [
          { label: ["场景原画","Scene artwork"], path: './art-library/fortress/01-mountain-fortress.png' },
        ],
      },
      {
        id: 'cathedral', title: ["算力大教堂","Compute cathedral"], status: 'confirmed',
        description: ["已确认机房场景概念，保留原画构图与气氛。","Approved facility scene concept, preserving its composition and atmosphere."],
        evidence: ["三大机房制作记录明确为“三张已确认概念设计”。","The facility implementation record explicitly identifies three approved concepts."],
        images: [
          { label: ["场景原画","Scene artwork"], path: './art-library/cathedral/02-compute-cathedral.png' },
        ],
      },
      {
        id: 'abyss', title: ["光纤深渊","Infiniband abyss"], status: 'confirmed',
        description: ["已确认机房场景概念，保留原画构图与气氛。","Approved facility scene concept, preserving its composition and atmosphere."],
        evidence: ["三大机房制作记录明确为“三张已确认概念设计”。","The facility implementation record explicitly identifies three approved concepts."],
        images: [
          { label: ["场景原画","Scene artwork"], path: './art-library/abyss/03-infiniband-abyss.png' },
        ],
      },
      {
        id: 'cloud-city', title: ["云上城市 · 宏大天际线","Cloud city · Grand skyline"], status: 'confirmed',
        description: ["大云团、近处楼群、中间街区和远方超高层的分层场景。","Layered clouds, nearby rooftops, middle districts and distant towers."],
        evidence: ["云城实现记录明确指定用户确认的 cloud-city-grand-skyline.png。","The city implementation record explicitly identifies this user-approved image."],
        images: [
          { label: ["云城原画","Cloud city artwork"], path: './art-library/cloud-city/cloud-city-grand-skyline.png' },
        ],
      },
      {
        id: 'homestead-studies', title: ["家园 · 建筑与设施探索","Homestead · Building studies"], status: 'candidate',
        description: ["剖面场景、建筑构件与设施概念。","Cutaway scenes, modular buildings and facility studies."],
        evidence: ["目录中保留的探索资料，尚未将整批图稿确认为定稿。","Retained exploration material; the full batch is not established as approved."],
        images: [
          { label: ["家园剖面","Homestead cutaway"], path: './art-library/homestead-studies/cutaway-scene.png' },
          { label: ["核心构件","Core building kit"], path: './art-library/homestead-studies/core-building-kit.png' },
          { label: ["生产设施","Production facilities"], path: './art-library/homestead-studies/facilities.png' },
        ],
      },
    ],
  },
  {
    id: 'storyboards', label: ["剧情与分镜","Storyboards"], entries: [
      {
        id: 'astra-rescue', title: ["拯救 GPT-6 Astra · 中英文插图","Save GPT-6 Astra · Bilingual artwork"], status: 'candidate',
        description: ["按用户要求删去对白与多余说明的最新简字版，分别保留中文、英文标题。","Latest simplified Chinese and English artwork, with dialogue and extra copy removed as requested."],
        evidence: ["「绘制游戏风格的拯救 GPT-6 Astra 图片」中用户要求“去掉多余的话”，并澄清要重新绘制图片；最新中英文结果没有后续确认。","The user requested redrawn images with reduced text; no later approval of the final bilingual pair was found."],
        images: [
          { label: ["中文简字版","Simplified Chinese version"], path: './art-library/astra-rescue/astra-rescue-zh.png' },
          { label: ["英文简字版","Simplified English version"], path: './art-library/astra-rescue/astra-rescue-en.png' },
        ],
      },

      {
        id: 'tibo-lauren-story', title: ["Tibo 与 Lauren · 家庭支线","Tibo and Lauren · Family story"], status: 'candidate',
        description: ["一家三口概念图与英文三格漫画，包含恋爱、结婚和孩子 Musk the Resetter。属于剧情插图，未接入游戏。","Family artwork and an English three-panel comic about love, marriage and baby Musk the Resetter. Not integrated into gameplay."],
        evidence: ["「绘制 Tibo 和 Lauren 恋爱场景」中用户要求家庭剧情，之后要求换成英文三格版本；未找到对最终成图单独确认的记录。","The user commissioned the family story and then an English comic; separate approval of the final images was not found."],
        images: [
          { label: ["英文三格漫画","English three-panel comic"], path: './art-library/tibo-lauren-story/tibo-lauren-musk-comic-v1.png' },
          { label: ["一家三口早期稿","Earlier family portrait"], path: './art-library/tibo-lauren-story/tibo-lauren-family-v1.png' },
        ],
      },

      {
        id: 'transformation', title: ["羽毛生长 · 变身分镜","Feather growth · Transformation"], status: 'confirmed',
        description: ["贴身长出羽毛、身体换形与反向收退的设计依据。","Reference for feather growth, transformation and reversal."],
        evidence: ["变身实现记录明确保存为已确认分镜 approved-concept.png。","The transformation record explicitly preserves this approved storyboard."],
        images: [
          { label: ["确认分镜","Approved storyboard"], path: './art-library/transformation/approved-concept.png' },
        ],
      },
      {
        id: 'teleport', title: ["传送 · 消散与重组","Teleport · Dissolve and rebuild"], status: 'confirmed',
        description: ["Sam 传送分镜，后续用于通用传送效果。","Sam's teleport storyboard, later used for shared teleport effects."],
        evidence: ["通用传送记录明确为已确认的 Sam 传送分镜。","The shared teleport record identifies the approved Sam storyboard."],
        images: [
          { label: ["确认分镜","Approved storyboard"], path: './art-library/teleport/teleport-concept.png' },
        ],
      },
    ],
  },
  {
    id: 'standards', label: ["比例与规范","Scale and guides"], entries: [
      {
        id: 'solar-grid-and-load', title: ["半格太阳能板 · 占格、踩踏与追光","Half-height solar panel · Grid, load and tracking"], status: 'confirmed',
        description: ["整板宽1、高0.5、深1格，踩踏时左右倾转，离开后渐进恢复朝向太阳。含整砖、半砖支撑与内沿、外延安装候选。","One panel occupies 1 × 0.5 × 1 tiles, tilts under the player and gradually returns toward the sun after they leave. Includes full/half-tile supports and offset placement candidates."],
        evidence: ["用户确认最新Python线框透视图并要求接入资源与透视场景；半格指整件的高度，内沿和外延偏移仍为摆放候选。","The user approved the latest Python wireframe and requested resource and scene integration. Half a tile refers to the entire object's height; depth offsets remain placement candidates."],
        images: [
          { label: ["半格占位、踩踏倾转与追光线框透视","Half-height occupancy, load response and solar tracking wireframe"], path: './concepts/solar-grid-and-load-perspective.png' },
        ],
      },
      {
        id: 'spatial-guides', title: ["格子、门与场景纵深图解","Tiles, doors and scene depth"], status: 'derived',
        description: ["二维玩法平面与三维场景的关系：地块、墙板、门洞、植物和远景透视。用于解释当前空间设定，不是新场景美术定稿。","Diagrams of the 2D gameplay plane and 3D tiles, walls, doors, plants and distant scenery; guides rather than final scene artwork."],
        evidence: ["「列出场景组成与左右形态」中用户要求补绘格子、墙体、门、植物与远景透视（01a12112-3a9b-7761-8328-32e3ecee92f1），复用基础概念页原图。","Requested spatial guides, reused directly from the basic-concepts page."],
        images: [
          { label: ["格子、墙体与门","Tiles, walls and doors"], path: './concepts/tile-wall-door-depth.png' },
          { label: ["植物与远景透视","Plants and distant perspective"], path: './concepts/plants-distant-perspective.png' },
          { label: ["液体定义与水体透视","Liquid definition and water perspective"], path: './concepts/liquid-perspective.png' },
        ],
      },

      {
        id: 'scale', title: ["人物与瓦片 · 统一尺度","Character and tile scale"], status: 'confirmed',
        description: ["原画与世界格子的尺寸说明。3.3 头身为美术参照，3.1 格为角色外观高度，两者含义不同。","Artwork and world-tile scale. The 3.3-head design target and 3.1-tile visual height are different measurements."],
        evidence: ["基础概念页记录将总图与主角原图收录；图像来源保持原文件，非新角色定稿。","The basic-concepts record retains the scale sheet and original references; this is a guide, not a new character design."],
        images: [
          { label: ["统一尺度总图","Scale guide"], path: './concepts/character-tile-scale.png' },
        ],
      },
      {
        id: 'terrain', title: ["地形瓦片与组合说明","Terrain shapes and combinations"], status: 'derived',
        description: ["基础形状、拼接规范和八类地形组合，用于理解关卡尺度。","Base shapes, joining rules and eight terrain compositions for level scale."],
        evidence: ["复用基础概念页的说明图；属于逻辑与制图资料，不标为场景美术定稿。","Reuses the basic-concepts diagrams; these explain logic and scale rather than final scene art."],
        images: [
          { label: ["地形基础","Terrain basics"], path: './concepts/terrain-tile-basics.png' },
          { label: ["八类组合","Eight compositions"], path: './concepts/terrain-combinations.png' },
        ],
      },
    ],
  },
];
