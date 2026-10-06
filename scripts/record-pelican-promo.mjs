/** 原游戏固定步长逐帧输出；慢机器只增加导出耗时，不丢动作帧。 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const { values } = parseArgs({ options: {
  playwright: { type: 'string' }, browser: { type: 'string' },
  ffmpeg: { type: 'string', default: 'ffmpeg' },
  output: { type: 'string', default: 'output/videos/pelican-promo-smooth' },
} });
assert(values.playwright && values.browser, '需要 --playwright 与 --browser');
const { chromium } = await import(pathToFileURL(resolve(values.playwright)).href);
const root = resolve(values.output);
await mkdir(root, { recursive: true });
// 时间是模拟秒；顺序是最终剪辑顺序，开场先给出鱼群攻击钩子。
const shots = [
  ['tibo',8.2,10.2,14,'鱼群破空'], ['tibo',2.2,4.2,16,'疾驰切入'],
  ['tibo',5,7.1,16,'弃车起飞'], ['tibo',12.9,15.1,12,'吞弹反击'],
  ['tibo',19,21.4,11,'传送突进'], ['tibo',46.7,48.7,15,'光子爆发'],
  ['tibo',55.2,58.2,13,'TIBO 决胜'], ['sam',.25,1.8,11,'人形觉醒'],
  ['sam',4,5.5,15,'骑行突入'], ['sam',7,9,16,'喷射起飞'],
  ['sam',11,13,14,'空中对射'], ['sam',16,18.3,12,'Bug 弹群'],
  ['sam',23,25.5,10,'键盘连击'], ['sam',41.3,43.6,12,'服务器超载'],
  ['sam',52.8,56.8,13,'SAM 决胜'],
].map(([kind,start,end,distance,label],id)=>({id,kind,start:Math.round(start*60),end:Math.round(end*60),distance,label}));
let totalFrames=0;
for(const shot of shots){shot.offset=totalFrames;totalFrames+=shot.end-shot.start;}
const encoders = new Map();
const cues=[];
const reports=[];
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5182','--strictPort'],{stdio:['ignore','pipe','pipe']});
let browser;
async function run(cmd,args){
  const child=spawn(cmd,args,{stdio:'inherit'});
  const [code]=await once(child,'exit');
  assert.equal(code,0,`${cmd} 退出 ${code}`);
}
try {
  await new Promise((done,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Vite 启动超时')),15000);
    server.stdout.on('data',b=>{if(b.toString().includes('http://127.0.0.1:5182')){clearTimeout(timeout);done();}});
    server.stderr.on('data',b=>process.stderr.write(b));
    server.once('error',reject);server.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Vite 退出 ${code}`));});
  });
  browser=await chromium.launch({headless:true,executablePath:resolve(values.browser)});
  for(const kind of ['tibo','sam']){
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/@vite/client',r=>r.fulfill({contentType:'text/javascript',body:''}));
    let rejectRoute;
    const failed=new Promise((_,reject)=>{rejectRoute=reject;});
    await page.route('**/src/app/game-app.ts*',async route=>{
      try{
        const response=await route.fetch();let body=await response.text();
        const replace=(from,to)=>{assert(typeof from==='string'?body.includes(from):from.test(body),`录制接入点变化：${from}`);body=body.replace(from,to);};
        replace(/level: startLevel,\s*playerForm: "human"/,"level: { ...startLevel, enemies: [], spawn: { x: 140, y: 75 } }, playerForm: 'pelican'");
        replace(') beginBlackholeArrival(world);',') world.blackholeArrivalTicks = 0;');
        replace('loadGrassyAsset("game"),','loadNpcAsset("sam", "monster"), loadNpcAsset("tibo", "monster"), loadGrassyAsset("game"),');
        replace('const tuning = chapter === null ? TUNING : facilityGameTuning();','const tuning = chapter === null ? TUNING : facilityGameTuning(); tuning.camera.framingOffsetY = -2; tuning.camera.lookAhead = 0;');
        replace('if (debug) exposeDebug({','exposeDebug({ loop, audio, tuning,');
        assert(body.includes('rafId = requestAnimationFrame(frame);'),'缺少游戏帧调度接入点');
        body=body.replaceAll('rafId = requestAnimationFrame(frame);','');
        await route.fulfill({response,body});
      }catch(error){rejectRoute(error);await route.abort();}
    });
    await Promise.race([failed,(async()=>{
      await page.goto('http://127.0.0.1:5182/?mode=game&level=facility&scene=fortress&quality=high',{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__pelicanGame,null,{timeout:120000});
    })()]);
    await page.evaluate(async({kind,shots})=>{
      const h=window.__pelicanGame;
      const {createBossEntity}=await import('/src/entities/boss.ts');
      const {createBossDirector}=await import('/scripts/pelican-boss-director.mjs');
      const {GameAudioCues}=await import('/src/app/game-audio-cues.ts');
      const p=h.world.entities.find(e=>e.id===h.world.playerId);
      const b=createBossEntity(h.world.nextId++,kind,{x:172,y:75},h.world.tuning);
      p.health.hp=p.health.maxHp=10000;p.armored=true;
      b.health.hp=b.health.maxHp=1000;h.world.entities.push(b);
      const director=createBossDirector(h.world,p,b);
      h.tracker.consume=()=>director.next();
      h.settings.set('wind','calm');h.settings.set('precip','manual');
      h.settings.set('rain','heavy');h.settings.set('snow','heavy');
      h.settings.set('rainPower',.7);h.settings.set('snowPower',.5);
      h.precip.controller.update(8,8,{rain:'heavy',snow:'heavy'},0,h.world.env);
      const state=window.promo={h,p,b,director,tick:0,shot:null,shots,cues:[],frames:[],counts:{},dead:false};
      const sound=new GameAudioCues(h.world);
      const collect=list=>{
        if(!state.shot)return;
        for(const cue of list){
          const dx=cue.x-p.body.x, distance=Math.hypot(dx,cue.y-p.body.y);
          if(distance<32)state.cues.push({at:(state.shot.offset+state.tick-state.shot.start)/60,sound:cue.sound,strength:(cue.strength??1)*(1-distance/32),pan:Math.max(-.85,Math.min(.85,dx/20)),pitch:cue.pitch??1});
        }
      };
      h.audio.update=()=>{};
      h.audio.observe=world=>collect(sound.observe(world));
      h.audio.handleEvents=(events,world)=>collect(sound.events(events,world));
      const snap=h.cameraRig.snapTo;
      let cx=156,cy=78,cd=32;
      h.cameraRig.snapTo=()=>{};
      h.cameraRig.update=()=>{
        const alive=b.health.hp>0;
        const left=alive?Math.min(p.body.x,b.body.x):p.body.x;
        const right=alive?Math.max(p.body.x,b.body.x):p.body.x;
        const bottom=alive?Math.min(p.body.y,b.body.y):p.body.y;
        const top=alive?Math.max(p.body.y+p.body.height,b.body.y+b.body.height):p.body.y+p.body.height;
        const half=Math.tan(h.stage.camera.fov*Math.PI/360);
        const close=state.shot?.distance??14;
        const distance=Math.max(close,(right-left+6)/(2*half*16/9),(top-bottom+4)/(2*half));
        const x=(left+right)/2,y=(bottom+top)/2+.7;
        const cut=state.shot && state.tick===state.shot.start;
        const k=cut?1:1-Math.exp(-5/60);
        cx+=(x-cx)*k;cy+=(y-cy)*k;cd+=(distance-cd)*k;
        h.tuning.camera.distance=cd;snap(cx,cy,1);
      };
      const render=h.stage.render;
      const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
      const ctx=canvas.getContext('2d');
      h.stage.render=()=>{
        if(!state.shot)return;
        render();ctx.drawImage(h.stage.canvas,0,0);
        const gradient=ctx.createLinearGradient(0,0,0,140);
        gradient.addColorStop(0,'rgba(4,14,23,.6)');gradient.addColorStop(1,'rgba(4,14,23,0)');
        ctx.fillStyle=gradient;ctx.fillRect(0,0,1920,140);
        for(const [actor,name,x,color] of [[p,p.pelican.form==='human'?'GRASSY':'PELICAN',55,'#83ecff'],[b,kind.toUpperCase(),1445,'#ffbf84']]){
          ctx.fillStyle='#ffffff';ctx.font='600 20px sans-serif';ctx.fillText(name,x,45);
          ctx.fillStyle='rgba(0,0,0,.4)';ctx.fillRect(x,60,420,5);
          ctx.fillStyle=color;ctx.fillRect(x,60,420*Math.max(0,actor.health.hp)/actor.health.maxHp,5);
        }
        const first=state.shot.id===0||state.shot.id===7;
        if(first){ctx.fillStyle='rgba(4,14,23,.65)';ctx.fillRect(50,900,650,112);ctx.fillStyle='#f2fcff';ctx.font='700 38px sans-serif';ctx.fillText(state.shot.id===0?'鹈鹕 429 · 堡垒决战':'人形觉醒 · 决战 SAM',76,948);ctx.font='20px sans-serif';ctx.fillStyle='#b9dae8';ctx.fillText(state.shot.id===0?'飞行 / 传送 / 全技能战斗':'GRASSY  /  KEYBOARD COMBAT',76,983);}
        if(b.health.hp<=0){ctx.textAlign='center';ctx.font='700 40px sans-serif';ctx.fillStyle='#f0ffe7';ctx.shadowColor='#142c21';ctx.shadowBlur=12;ctx.fillText(`${kind.toUpperCase()}  DEFEATED`,960,170);ctx.shadowBlur=0;ctx.textAlign='left';}
        state.frames.push({id:state.shot.id,data:canvas.toDataURL('image/jpeg',.94).split(',')[1]});
        state.counts[state.shot.id]=(state.counts[state.shot.id]??0)+1;
      };
      h.settings.setOpen(false);h.stepper.reset();h.loop.resetClock(0);
    },{kind,shots:shots.filter(s=>s.kind===kind)});
    for(let from=0;from<3600;from+=60){
      const batch=await page.evaluate(()=>{
        const r=promo;r.frames=[];
        for(let i=0;i<60;i++){
          r.shot=r.shots.find(s=>r.tick>=s.start&&r.tick<s.end)??null;
          r.h.loop.frame((r.tick+1)*1000/60);
          r.dead ||=r.p.health.hp<=0||r.h.world.respawnTicks>0;
          r.tick++;
        }
        return r.frames;
      });
      for(const frame of batch){
        if(!encoders.has(frame.id)){
          const path=join(root,`shot-${String(frame.id).padStart(2,'0')}.mp4`);
          const child=spawn(values.ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate','60','-vcodec','mjpeg','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',path],{stdio:['pipe','inherit','inherit']});
          encoders.set(frame.id,{child,done:once(child,'exit'),count:0});
        }
        const encoder=encoders.get(frame.id);
        if(!encoder.child.stdin.write(Buffer.from(frame.data,'base64')))await once(encoder.child.stdin,'drain');
        encoder.count++;
      }
      if((from+60)%300===0)console.log(`${kind} 模拟 ${(from+60)/60}s，逐帧输出 ${[...encoders.values()].reduce((n,e)=>n+e.count,0)} 帧`);
    }
    const report=await page.evaluate(()=>({evidence:promo.director.evidence,counts:promo.counts,cues:promo.cues,dead:promo.dead,hp:promo.p.health.hp,bossHp:promo.b.health.hp,form:promo.p.pelican.form,stepper:promo.h.stepper.stats}));
    await writeFile(join(root,`${kind}-evidence.json`),JSON.stringify(report,null,2));
    assert.equal(errors.length,0,errors.join('\n'));
    assert(!report.dead&&report.hp>0,'主角死亡');assert.equal(report.bossHp,0,`${kind} 未击败`);
    assert.equal(report.stepper.droppedTicks,0,'模拟丢帧');assert.equal(report.stepper.ticks,3600,'时间轴不完整');
    const skills=kind==='tibo'?['water','fish','dash','swallowed','returned','photon']:['codex','bug','melee','overload','photon'];
    for(const key of [...skills,'mount','takeoff','teleport','flightTicks','rideTicks'])assert(report.evidence[key]>0,`${kind} 缺少 ${key}`);
    const visibleSkills=kind==='tibo'?['water','fish','gulp','swallow','dash','photonBurst']:['codex','bug','keyboard','overloadBurst','photonBurst'];
    for(const sound of visibleSkills)assert(report.cues.some(c=>c.sound===sound),`${kind} 成片缺少技能声音/事件 ${sound}`);
    for(const s of shots.filter(s=>s.kind===kind)){
      const encoder=encoders.get(s.id);encoder.child.stdin.end();
      const [code]=await encoder.done;assert.equal(code,0,`镜头 ${s.id} 编码失败`);
      assert.equal(encoder.count,s.end-s.start,`镜头 ${s.id} 帧数不符`);
    }
    cues.push(...report.cues);delete report.cues;reports.push({kind,...report});
    if(kind==='sam'){
      const wav=await page.evaluate(async({cues,duration})=>{
        const {renderPromoAudio}=await import('/scripts/pelican-promo-audio.mjs');
        return renderPromoAudio(cues,duration);
      },{cues,duration:totalFrames/60});
      await writeFile(join(root,'soundtrack.wav'),Buffer.from(wav,'base64'));
    }
    await page.close();
  }
}finally{
  for(const {child} of encoders.values())if(child.exitCode===null)child.kill();
  if(browser)await browser.close();server.kill();
}
await writeFile(join(root,'shots.txt'),shots.map(s=>`file 'shot-${String(s.id).padStart(2,'0')}.mp4'`).join('\n'));
await writeFile(join(root,'edit.json'),JSON.stringify({fps:60,totalFrames,duration:totalFrames/60,shots,reports},null,2));
const output=join(root,'鹈鹕429-堡垒决战-流畅重制版.mp4');
await run(values.ffmpeg,['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',join(root,'shots.txt'),'-i',join(root,'soundtrack.wav'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','medium','-crf','22','-maxrate','10M','-bufsize','20M','-pix_fmt','yuv420p','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar','48000','-c:a','aac','-b:a','192k','-movflags','+faststart','-shortest',output]);
await run(values.ffmpeg,['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',join(root,'shots.txt'),'-i',join(root,'soundtrack.wav'),'-map','0:v','-map','1:a','-vf','scale=1280:720','-c:v','libx264','-preset','slow','-crf','23','-maxrate','4M','-bufsize','8M','-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar','48000','-c:a','aac','-b:a','128k','-movflags','+faststart','-shortest',join(root,'鹈鹕429-堡垒决战-流畅分享版.mp4')]);
console.log(`完成：${output}，${totalFrames} 帧 / ${totalFrames/60} 秒`);
