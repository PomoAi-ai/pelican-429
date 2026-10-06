/** 角色技能介绍片：真实游戏逐帧录制，独立片场编排。 */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const { values } = parseArgs({ options: {
  playwright: { type: 'string' }, browser: { type: 'string' }, shots: { type: 'string' },
  ffmpeg: { type: 'string', default: '/opt/homebrew/bin/ffmpeg' },
  output: { type: 'string', default: 'output/videos/2026-10-07/aerial-intro-updated' },
} });
assert(values.playwright && values.browser, '需要 --playwright 与 --browser');
const { chromium } = await import(pathToFileURL(resolve(values.playwright)).href);
const root = resolve(values.output);
await mkdir(root, { recursive: true });
const chapters = {
  human: { name: 'GRASSY', title: '人类形态', color: '#90e8e1', lore: '键盘是武器，推进器让战斗延伸至空中。' },
  pelican: { name: 'PELICAN', title: '鹈鹕形态', color: '#a6e6ff', lore: '展开双翼，倾泻鱼群；吞下敌弹，再还以反击。' },
  tibo: { name: 'TIBO', title: '重置大师 / THE RESET MASTER', color: '#eac987', lore: '黑色帽衫与重置胸章，以锤击和绿金冲击控制战场。' },
  sam: { name: 'SAM', title: '模型路由者 / THE MODEL ROUTER', color: '#adbbff', lore: '法杖与路由核心汇聚蓝金能量，进入飞行阶段后空中施法。' },
};
const shots = [
  ['human','intro',4,'鹈鹕 429','PELICAN 429 / CHARACTER & SKILL FILM','双重形态 · 两大 Boss · 堡垒上空的交锋'],
  ['human','codex',3.5,'Codex 攻击','CODEX VOLLEY','代码弹连续发射，飞行与施法同步进行。'],
  ['human','bug',4,'Bug 攻击','BUG MISSILES','紫绿虫群前冲，弧线追踪空中目标。'],
  ['human','keyboard',3.5,'砸键盘','KEYBOARD STRIKE','挥动键盘左右横击，在空中完成近身连段。'],
  ['human','overload',4.5,'服务器超载','SERVER OVERLOAD','蓄能、过热、爆发，能量柱与冲击波扩散。'],
  ['pelican','transform',3,'双形态切换','DUAL FORM','同一位主角，两种战斗方式。'],
  ['pelican','water',3.5,'吐水','WATER SHOT','飞行中连发水弹，命中后溅射。'],
  ['pelican','fish',3.5,'鱼群轰炸','FISH BARRAGE','鱼群沿多条弧线落下，覆盖前方空间。'],
  ['pelican','dash',3,'振翅突进','WING DASH','展开双翼高速突进，突破敌方防线。'],
  ['pelican','swallow',4.5,'吞弹反击','SWALLOW & RETURN','张嘴吸入来弹，再将敌人的火力反吐回去。'],
  ['pelican','photon',4.5,'光子爆裂','PHOTON BURST','光子伙伴释放 Bug 与光轮，分批追击敌人。'],
  ['tibo','attack',3,'重置锤击','RESET HAMMER','左手重锤蓄力砸落，棘轮随收招倒转。'],
  ['tibo','skill1',3.5,'薯条攻击','FRIES VOLLEY','金橙弹幕连续射出，迎击空中目标。'],
  ['tibo','skill2',4,'额度返场','QUOTA RETURN','按下重置按钮，绿光爆发并恢复生命。'],
  ['tibo','ultimate',7.5,'重置降临','RESET DESCENT','两次重砸、两轮环形薯条，错角弹幕覆盖四周。'],
  ['sam','attack',3,'法杖脉冲','STAFF PULSE','锁定方向，空中发射数据脉冲。'],
  ['sam','skill1',4,'模型路由攻击','MODEL ROUTING','GPT-6 Astra 核心斜射蓝金光线，命中显现降级模型。'],
  ['sam','skill2',4,'算力激涌','COMPUTE SURGE','Token 导弹沿高低弧线连续发射。'],
  ['sam','ultimate',7.5,'AGI 降临','AGI DESCENT','两轮路由光弹环射，再向左右齐射 Token，地面冲击同步爆发。'],
].map(([chapter,action,seconds,label,english,description],id)=>({id,chapter,action,seconds,label,english,description,frames:Math.round(seconds*60)}));
assert(values.shots===undefined||/^\d+(,\d+)*$/.test(values.shots),'--shots 需为逗号分隔的镜头编号');
const selected=values.shots===undefined?shots.map(s=>s.id):values.shots.split(',').map(Number);
assert(selected.length>0&&selected.every(id=>Number.isInteger(id)&&id>=0&&id<shots.length),'--shots 需要有效镜头编号（0–18）');
let totalFrames=0;
for(const s of shots){s.offset=totalFrames;totalFrames+=s.frames;}
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5183','--strictPort'],{stdio:['ignore','pipe','pipe']});
let browser,encoder;
const reports=[],cues=[];
async function run(args){const p=spawn(values.ffmpeg,args,{stdio:'inherit'});assert.equal((await once(p,'exit'))[0],0,'FFmpeg 编码失败');}
try {
  await new Promise((done,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Vite 启动超时')),15000);
    server.stdout.on('data',b=>{if(b.toString().includes('http://127.0.0.1:5183')){clearTimeout(timeout);done();}});
    server.stderr.on('data',b=>process.stderr.write(b));
    server.once('error',reject);server.once('exit',c=>{clearTimeout(timeout);reject(new Error(`Vite 退出 ${c}`));});
  });
  browser=await chromium.launch({headless:true,executablePath:resolve(values.browser)});
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.route('**/@vite/client',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await page.route('**/scripts/pelican-promo-audio.mjs*',async route=>{
    const response=await route.fetch();let body=await response.text();
    const anchor='const rendered = await context.startRendering();';
    assert(body.includes(anchor),'音频渲染接入点变化');
    body=body.replace(anchor,`const { BossScore } = await import('/src/app/boss-audio.ts'); const bosses = new BossScore(context, limiter); for (const cue of window.intro.bossTimeline) bosses.schedule(cue.kind, cue.action, cue.at, cue.speed); ${anchor}`);
    await route.fulfill({response,body});
  });
  let rejectRoute;const failed=new Promise((_,reject)=>{rejectRoute=reject;});
  await page.route('**/src/app/game-app.ts*',async route=>{
    try {
      const response=await route.fetch();let body=await response.text();
      const replace=(from,to)=>{assert(typeof from==='string'?body.includes(from):from.test(body),`录制接入点变化：${from}`);body=body.replace(from,to);};
      replace(/level: startLevel,\s*playerForm: ["']human["']/,"level: { ...startLevel, enemies: [], spawn: { x: 148, y: 84 } }, playerForm: 'human'");
      replace(') beginBlackholeArrival(world);',') world.blackholeArrivalTicks = 0;');
      replace(/loadGrassyAsset\(["']game["']\),/,"loadNpcAsset('sam', 'monster'), loadNpcAsset('tibo', 'monster'), loadGrassyAsset('game'),");
      replace('const tuning = chapter === null ? TUNING : facilityGameTuning();', 'const tuning = chapter === null ? TUNING : facilityGameTuning(); tuning.camera.framingOffsetY = -2; tuning.camera.lookAhead = 0;');
      replace('if (debug) exposeDebug({','exposeDebug({ loop, audio, tuning,');
      assert(body.includes('rafId = requestAnimationFrame(frame);'),'缺少帧调度接入点');
      body=body.replaceAll('rafId = requestAnimationFrame(frame);','');
      await route.fulfill({response,body});
    }catch(e){rejectRoute(e);await route.abort();}
  });
  await Promise.race([failed,(async()=>{
    await page.goto('http://127.0.0.1:5183/?mode=game&level=facility&scene=fortress&quality=high',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__pelicanGame,null,{timeout:120000});
  })()]);
  await page.evaluate(async({chapters,totalFrames,shotsLength})=>{
    const h=window.__pelicanGame;
    const {createPelicanEntity}=await import('/src/entities/entity.ts');
    const {createBossEntity,cancelBossSkill}=await import('/src/entities/boss.ts');
    const {NEUTRAL_INPUT}=await import('/src/entities/pelican-controller.ts');
    const {HUMAN_BODY_HEIGHT}=await import('/src/config/player-form.ts');
    const {GameAudioCues}=await import('/src/app/game-audio-cues.ts');
    const {npcAction}=await import('/src/config/npc.ts');
    const {startAttack}=await import('/src/combat/attacks.ts');
    const {tiboBasicAttack}=await import('/src/combat/npc-basic-attack.ts');
    const {spawnProjectiles}=await import('/src/sim/weapon-system.ts');
    const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
    const ctx=canvas.getContext('2d');
    const r=window.intro={h,tick:0,local:0,shot:null,frames:[],events:[],cues:[],bossCues:[],airFrames:0,flightFrames:0,canvas};
    h.settings.set('wind','calm');h.settings.set('precip','manual');h.settings.set('rain','light');h.settings.set('snow','light');
    // 持续推进配合片场慢速爬升，避免用开关推力维持高度造成动画抖动。
    h.world.tuning={...h.world.tuning,player:{...h.world.tuning.player,flight:{...h.world.tuning.player.flight,riseSpeed:.6}}};
    h.settings.set('rainPower',.2);h.settings.set('snowPower',.2);h.settings.setOpen(false);
    const snap=h.cameraRig.snapTo,render=h.stage.render;
    h.cameraRig.snapTo=()=>{};
    h.cameraRig.update=()=>{
      const {p,b,shot}=r;let x,y,d;
      if(shot.chapter==='tibo'||shot.chapter==='sam'){
        x=b.body.x+2;y=b.body.y+2;d=shot.action==='ultimate'?26:17;
        if(shot.chapter==='sam'&&shot.action!=='ultimate'){x=(b.body.x+p.body.x)/2;y=(b.body.y+p.body.y)/2+1;}
      }else{
        x=p.body.x+3;y=p.body.y+1.5;d=['photon','fish'].includes(shot.action)?24:['overload','dash'].includes(shot.action)?22:18;
      }
      const k=r.local<2?1:.065;
      r.cx+=(x-r.cx)*k;r.cy+=(y-r.cy)*k;r.cd+=(d-r.cd)*k;
      h.tuning.camera.distance=r.cd;snap(r.cx,r.cy,1);
    };
    r.setup=shot=>{
      r.shot=shot;r.local=0;r.events=[];r.samples=[];r.motion=[];r.cues=[];r.bossCues=[];r.airFrames=0;r.flightFrames=0;r.bossStarted=false;
      const bossChapter=['tibo','sam'].includes(shot.chapter);
      const grounded=shot.action==='transform'||shot.chapter==='tibo'||(shot.chapter==='sam'&&shot.action==='ultimate');
      const spacing=shot.chapter==='tibo'?{attack:1.65,skill1:7,skill2:2.5,ultimate:4}[shot.action]:shot.action==='ultimate'?3.5:7;
      const p=createPelicanEntity(h.world.playerId,{x:bossChapter?150+spacing:148,y:shot.chapter==='tibo'&&shot.action==='skill1'?78:grounded?75:84},h.world.tuning);
      const human=shot.chapter==='human'||shot.action==='transform';
      p.pelican.form=p.pelican.transformFrom=human?'human':'pelican';
      if(human)p.body.height=HUMAN_BODY_HEIGHT;
      p.facing=bossChapter?-1:1;
      // 片场补给只延长飞行，正常伤害、无敌帧和硬直交给游戏结算。
      p.pelican.flightTicks=p.pelican.flightMaxTicks=10000;
      const b=createBossEntity(h.world.nextId++,shot.chapter==='tibo'?'tibo':'sam',{x:bossChapter?150:155,y:grounded?75:p.body.y+p.body.height/2+1.2},h.world.tuning);
      b.facing=bossChapter?1:-1;b.health.maxHp=10000;b.health.hp=7000;
      b.boss.flying=b.boss.kind==='sam'&&!grounded;b.boss.cooldownTicks=9999;b.boss.blinkCooldownTicks=9999;
      if(shot.action==='keyboard'){b.body.x=151;b.boss.flying=true;}
      if(!grounded||(shot.chapter==='tibo'&&shot.action==='skill1')){p.body.vy=.6;p.pelican.flightMode='fly';p.pelican.state='fly';}
      h.world.entities.splice(0,h.world.entities.length,p,b);r.p=p;r.b=b;
      Object.assign(h.world.photon,{cooldownTicks:0,chargeTicks:0,activeTicks:0,buffered:false,volleyIndex:0});
      h.world.hitstopTicks=0;h.world.respawnTicks=0;h.world.blackholeArrivalTicks=0;
      r.cx=bossChapter?b.body.x+2:p.body.x+3;r.cy=grounded?78:86;r.cd=20;
      r.sound=new GameAudioCues(h.world);
    };
    const push=h.world.events.push.bind(h.world.events);
    h.world.events.push=e=>{
      if(r.shot){
        r.events.push({...e,at:r.local/60,air:!r.p.body.onGround,flight:r.p.pelican.flightMode});
      }
      push(e);
    };
    h.tracker.consume=()=>{
      const {p,b,shot}=r,t=r.local/60;
      if(r.local%30===0)r.samples.push({t,x:p.body.x,y:p.body.y,ground:p.body.onGround,flight:p.pelican.flightMode,form:p.pelican.form,bossX:b.body.x,bossY:b.body.y,bossAction:b.boss.action});
      const bossChapter=['tibo','sam'].includes(shot.chapter);
      const ground=shot.action==='transform'||shot.chapter==='tibo'||(shot.chapter==='sam'&&shot.action==='ultimate');
      b.health.hitstunTicks=0;b.health.guard.immuneUntilTick=h.world.tick+999;
      b.boss.blinkCooldownTicks=9999;
      if(b.boss.action==='idle'||b.boss.action==='run')b.boss.cooldownTicks=9999;
      const f={...NEUTRAL_INPUT,aim:{x:b.body.x,y:b.body.y+b.body.height*.6},runHeld:false};
      f.jumpHeld=(shot.chapter==='tibo'&&shot.action==='skill1')||!ground;
      if(!bossChapter){
        const action=shot.action;
        if(t>.55&&t<shot.seconds-.5){
          if(action==='water')f.shootHeld=true;
          if(action==='codex'||action==='fish')f.skill1Held=true;
          if(action==='keyboard')f.shootHeld=true;
        }
        if(r.local===42){
          if(['bug','dash'].includes(action))f.skillPressed=2;
          if(['overload','swallow'].includes(action))f.skillPressed=3;
          if(action==='photon')f.skillPressed=4;
          if(action==='transform')f.transformPressed=true;
        }
        if(action==='intro')f.moveX=1;
        if(action==='swallow'&&[65,72,79].includes(r.local)){
          const y=p.body.y+1.35,x=p.body.x+5;
          spawnProjectiles(h.world,[{def:{...h.world.tuning.weapons.shooter.projectile,speed:10,gravity:0,trajectory:'straight'},x,y,dirX:-1,dirY:0,ownerId:b.id,team:'enemy',level:1,returned:false}]);
        }
      }else if(r.local===42){
        cancelBossSkill(b);b.boss.action=shot.action;b.boss.actionTicks=0;b.boss.actionRate=shot.action==='ultimate'?1:1.2;
        b.boss.aim={x:p.body.x,y:p.body.y+p.body.height*.5};b.boss.healing=shot.chapter==='tibo'&&shot.action==='skill2';
        if(shot.action==='attack'&&shot.chapter==='tibo')b.attack=startAttack(tiboBasicAttack(h.world.tuning.sim.step*b.boss.actionRate));
        r.bossStarted=true;r.bossCues.push({kind:shot.chapter,action:shot.action,at:(shot.offset+r.local)/60,speed:b.boss.actionRate});
      }
      if(bossChapter&&r.bossStarted&&b.boss.action===shot.action){
        const release=npcAction(shot.chapter,shot.action).release;
        if(b.boss.actionTicks*b.boss.actionRate/60>=release&&!r.bossReleased){r.bossReleased=true;r.events.push({type:'bossRelease',action:shot.action,air:!b.body.onGround,at:t});}
      }
      return f;
    };
    const collect=list=>{for(const cue of list)r.cues.push({at:(r.shot.offset+r.local)/60,sound:cue.sound,strength:cue.strength??1,pan:Math.max(-.8,Math.min(.8,(cue.x-r.p.body.x)/18)),pitch:cue.pitch??1});};
    // 片场保持连续播放；仅取消命中停帧，扣血、击退与硬直仍由模拟保留。
    h.audio.update=()=>{};h.audio.observe=w=>{collect(r.sound.observe(w));w.hitstopTicks=0;};h.audio.handleEvents=(e,w)=>collect(r.sound.events(e,w));
    h.stage.render=()=>{
      render();ctx.drawImage(h.stage.canvas,0,0);
      const s=r.shot,c=chapters[s.chapter],t=r.local/60;
      const top=ctx.createLinearGradient(0,0,0,230);top.addColorStop(0,'rgba(7,16,27,.88)');top.addColorStop(1,'rgba(7,16,27,0)');
      ctx.fillStyle=top;ctx.fillRect(0,0,1920,230);
      ctx.fillStyle=c.color;ctx.font='600 21px sans-serif';ctx.fillText('PELICAN 429   /   CHARACTER FILES',64,48);
      ctx.fillStyle='#ffffff';ctx.font='700 49px sans-serif';ctx.fillText(c.name,64,110);
      ctx.font='500 24px sans-serif';ctx.fillStyle='#dce6ed';ctx.fillText(c.title,64,153);
      if(['tibo','sam'].includes(s.chapter)){
        const health=r.p.health;
        ctx.textAlign='right';ctx.fillStyle='#edf7ff';ctx.font='600 20px sans-serif';ctx.fillText(`鹈鹕 HP  ${Math.ceil(health.hp)} / ${health.maxHp}`,1856,125);
        ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(1576,140,280,8);ctx.fillStyle=health.flashTicks>0?'#ff987a':'#8ce7d0';ctx.fillRect(1576,140,280*health.hp/health.maxHp,8);ctx.textAlign='left';
      }
      ctx.textAlign='right';ctx.font='600 20px sans-serif';ctx.fillStyle=c.color;ctx.fillText(`${String(s.id+1).padStart(2,'0')} / ${shotsLength}`,1856,48);
      ctx.font='18px sans-serif';ctx.fillStyle='#dce6ed';ctx.fillText(s.action==='transform'?'FORM SHIFT / 双形态切换':['tibo','sam'].includes(s.chapter)&&!(s.chapter==='sam'&&s.action!=='ultimate')?'GROUND SKILL / 地面技能':'AERIAL SHOWCASE / 空中演示',1856,82);ctx.textAlign='left';
      const bottom=ctx.createLinearGradient(0,785,0,1080);bottom.addColorStop(0,'rgba(5,12,22,0)');bottom.addColorStop(.38,'rgba(5,12,22,.82)');bottom.addColorStop(1,'rgba(5,12,22,.97)');
      ctx.fillStyle=bottom;ctx.fillRect(0,785,1920,295);
      ctx.fillStyle=c.color;ctx.fillRect(64,892,5,126);
      ctx.fillStyle='#ffffff';ctx.font='700 45px sans-serif';ctx.fillText(s.label,92,931);
      ctx.fillStyle=c.color;ctx.font='600 19px sans-serif';ctx.fillText(s.english,94,966);
      ctx.fillStyle='#e1e8ed';ctx.font='23px sans-serif';ctx.fillText(s.description,94,1009);
      ctx.textAlign='right';ctx.font='18px sans-serif';ctx.fillStyle='#b8c5d1';ctx.fillText(c.lore,1856,1045);ctx.textAlign='left';
      ctx.fillStyle=c.color;ctx.fillRect(0,1075,1920*(s.offset+r.local+1)/totalFrames,5);
      const fade=Math.min(1,t/.18,(s.seconds-t)/.18);
      if(fade<1){ctx.fillStyle=`rgba(4,10,18,${1-fade})`;ctx.fillRect(0,0,1920,1080);}
      r.frames.push(canvas.toDataURL('image/jpeg',.93).split(',')[1]);
    };
    h.stepper.reset();h.loop.resetClock(0);
  },{chapters,totalFrames,shotsLength:shots.length});
  for(const shot of shots){
    if(!selected.includes(shot.id)){const report=JSON.parse(await readFile(join(root,`shot-${String(shot.id).padStart(2,'0')}.json`),'utf8'));cues.push(...report.cues);reports.push(report);continue;}
    await page.evaluate(s=>{intro.bossReleased=false;intro.setup(s);},shot);
    const path=join(root,`shot-${String(shot.id).padStart(2,'0')}.mp4`);
    encoder=spawn(values.ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','60','-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p',path],{stdio:['pipe','inherit','inherit']});
    const done=once(encoder,'exit');let count=0;
    for(let from=0;from<shot.frames;from+=30){
      const batch=await page.evaluate(n=>{const r=intro;r.frames=[];for(let i=0;i<n;i++){r.h.loop.frame((r.tick+1)*1000/60);if(!r.p.body.onGround)r.airFrames++;if(r.p.pelican.flightMode==='fly')r.flightFrames++;r.motion.push({frame:r.local,y:r.p.body.y,vy:r.p.body.vy,mode:r.p.pelican.flightMode,hp:r.p.health.hp,hitstun:r.p.health.hitstunTicks,cameraY:r.h.stage.camera.position.y});r.tick++;r.local++;}return r.frames;},Math.min(30,shot.frames-from));
      for(const frame of batch){if(!encoder.stdin.write(Buffer.from(frame,'base64')))await once(encoder.stdin,'drain');count++;}
      if(from===60||from===120||from===180)await writeFile(join(root,`shot-${String(shot.id).padStart(2,'0')}-${from}.jpg`),Buffer.from(batch.at(-1),'base64'));
    }
    encoder.stdin.end();assert.equal((await done)[0],0,'镜头编码失败');encoder=null;
    assert.equal(count,shot.frames,`镜头 ${shot.id} 帧数`);
    const report=await page.evaluate(()=>({events:intro.events,samples:intro.samples,motion:intro.motion,playerId:intro.p.id,bossId:intro.b.id,playerMaxHp:intro.p.health.maxHp,cues:intro.cues,bossCues:intro.bossCues,airFrames:intro.airFrames,flightFrames:intro.flightFrames,playerHp:intro.p.health.hp,form:intro.p.pelican.form,bossHp:intro.b.health.hp}));
    await writeFile(join(root,`shot-${String(shot.id).padStart(2,'0')}.json`),JSON.stringify({shot,...report},null,2));
    assert(report.playerHp>0,'主角死亡');
    const expected={codex:'codexShot',bug:'bugShot',water:'waterShot',fish:'fishShot'}[shot.action];
    if(expected)assert(report.events.some(e=>e.type==='projectileFired'&&e.kind===expected&&e.air),`${shot.label} 缺少空中弹体`);
    if(shot.action==='keyboard')assert(report.cues.some(e=>e.sound==='keyboard'),'键盘未释放');
    if(shot.action==='overload')assert(report.events.some(e=>e.type==='combatAction'&&e.action==='server_overload'&&e.phase==='released'&&e.air),'超载未空中释放');
    if(shot.action==='dash')assert(report.cues.some(e=>e.sound==='dash'),'突进未释放');
    if(shot.action==='transform')assert.equal(report.form,'pelican','变身未完成');
    if(shot.action==='photon')assert(report.events.some(e=>e.type==='photonUltimateBurst'&&e.air),'光子未空中释放');
    if(shot.action==='swallow'){assert(report.events.some(e=>e.type==='swallowed'),'未吞弹');assert(report.events.some(e=>e.type==='projectileFired'&&e.returned),'未反吐');}
    if(['tibo','sam'].includes(shot.chapter))assert(report.events.some(e=>e.type==='bossRelease'),`${shot.chapter} ${shot.action} 未释放`);
    if(shot.chapter==='sam'&&shot.action!=='ultimate')assert(report.events.some(e=>e.type==='bossRelease'&&e.air),'Sam 未空中释放');
    if(!['tibo','sam'].includes(shot.chapter)&&shot.action!=='transform')assert(report.airFrames>shot.frames*.8,`${shot.label} 空中镜头不足`);
    if(['human','pelican'].includes(shot.chapter)&&shot.action!=='transform'){
      assert(report.motion.every(m=>Math.abs(m.vy-.6)<1e-7),`${shot.label} 未保持连续慢速爬升`);
      assert.equal(report.flightFrames,shot.frames,`${shot.label} 飞行被反复打断`);
      assert(report.motion.every((m,i)=>i===0||m.y>=report.motion[i-1].y-1e-8),`${shot.label} 飞行高度反向抖动`);
    }
    if(['tibo','sam'].includes(shot.chapter)&&shot.action==='ultimate'){
      const shots=report.events.filter(e=>e.type==='projectileFired'&&e.ownerId===report.bossId);
      assert.equal(shots.length,shot.chapter==='tibo'?32:40,`${shot.chapter} 大招弹幕未完整释放`);
      assert(shots.some(e=>e.dirX<-.5)&&shots.some(e=>e.dirX>.5)&&shots.some(e=>e.dirY>.5),`${shot.chapter} 缺少环形弹幕`);
    }
    if(['tibo','sam'].includes(shot.chapter)){
      assert(report.events.some(e=>e.type==='hit'&&e.attackerId===report.bossId&&e.targetId===report.playerId&&e.damage>0),`${shot.chapter} ${shot.label} 未实际命中主角`);
      assert(report.playerHp<report.playerMaxHp,`${shot.chapter} ${shot.label} 未扣血`);
    }
    cues.push(...report.cues);reports.push({shot,...report});
    console.log(`完成 ${shot.id+1}/${shots.length} ${shot.chapter} ${shot.label}：${count}帧 / 空中${report.airFrames}帧`);
  }
  assert.equal(errors.length,0,errors.join('\n'));
  const wav=await page.evaluate(async({cues,reports,duration})=>{
    window.intro.bossTimeline=reports.flatMap(r=>r.bossCues);
    const {renderPromoAudio}=await import('/scripts/pelican-promo-audio.mjs');
    return renderPromoAudio(cues,duration);
  },{cues,reports,duration:totalFrames/60});
  await writeFile(join(root,'soundtrack.wav'),Buffer.from(wav,'base64'));
  const stats=await page.evaluate(()=>intro.h.stepper.stats);assert.equal(stats.droppedTicks,0,'模拟丢帧');
  await writeFile(join(root,'evidence.json'),JSON.stringify({fps:60,totalFrames,duration:totalFrames/60,currentRun:{shots:selected,stats},reports},null,2));
} finally {
  if(encoder)encoder.kill();if(browser)await browser.close();server.kill();
}
await writeFile(join(root,'shots.txt'),shots.map(s=>`file 'shot-${String(s.id).padStart(2,'0')}.mp4'`).join('\n'));
const stamp=n=>{const ms=Math.round(n*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
await writeFile(join(root,'技能介绍.srt'),shots.map(s=>`${s.id+1}\n${stamp(s.offset/60)} --> ${stamp((s.offset+s.frames)/60)}\n${chapters[s.chapter].name} · ${s.label} / ${s.english}\n${s.description}\n${chapters[s.chapter].lore}\n`).join('\n'));
const output=join(root,'鹈鹕429-角色与技能-空中介绍.mp4');
await run(['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',join(root,'shots.txt'),'-i',join(root,'soundtrack.wav'),'-map','0:v','-map','1:a','-c:v','copy','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar','48000','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',output]);
await run(['-hide_banner','-loglevel','error','-y','-i',output,'-vf','scale=1280:720','-c:v','libx264','-preset','fast','-crf','23','-maxrate','4M','-bufsize','8M','-ar','48000','-c:a','aac','-b:a','128k','-movflags','+faststart',join(root,'鹈鹕429-空中技能介绍-分享版.mp4')]);
console.log(`完成：${output} / ${totalFrames/60} 秒`);
