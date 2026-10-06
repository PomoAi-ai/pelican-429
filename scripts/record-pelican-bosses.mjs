/**
 * 本地两部一分钟单 Boss 演示。运行方法见 record-pelican-bosses.md。
 * 仅在浏览器请求中装配录制场景，不写入正式游戏数值。
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const { values } = parseArgs({ options: {
  playwright: { type: 'string' }, browser: { type: 'string' },
  ffmpeg: { type: 'string', default: 'ffmpeg' },
  output: { type: 'string', default: 'output/videos/pelican-boss-films' },
  boss: { type: 'string' },
} });
assert(values.playwright && values.browser, '请提供 --playwright 模块路径和 --browser Chromium 可执行文件路径');
assert(values.boss === undefined || ['tibo', 'sam'].includes(values.boss), '--boss 只接受 tibo 或 sam');
const films = values.boss ? [values.boss] : ['tibo', 'sam'];
const exports = [];
const { chromium } = await import(pathToFileURL(resolve(values.playwright)).href);
const root = resolve(values.output);
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5182', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((done, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite 启动超时')), 15000);
    server.stdout.on('data', bytes => { if (bytes.toString().includes('http://127.0.0.1:5182')) { clearTimeout(timeout); done(); } });
    server.stderr.on('data', bytes => process.stderr.write(bytes));
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Vite 提前退出：${code}`)); });
  });
  browser = await chromium.launch({ headless: true, executablePath: resolve(values.browser), args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const kind of films) {
    const out = join(root, kind);
    await mkdir(out, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.route('**/@vite/client', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    let rejectRoute;
    const routeFailed = new Promise((_,reject) => { rejectRoute=reject; });
    await page.route('**/src/app/game-app.ts*', async route => {
      try {
        const response = await route.fetch();
        let body = await response.text();
        const replace = (from, to) => { assert(typeof from === 'string' ? body.includes(from) : from.test(body), `录制接入点已变化：${from}`); body = body.replace(from, to); };
        replace(/level: startLevel,\s*playerForm: "human"/, "level: { ...startLevel, enemies: [], spawn: { x: 140, y: 75 } }, playerForm: 'pelican'");
        replace(') beginBlackholeArrival(world);', ') world.blackholeArrivalTicks = 0;');
        replace('loadGrassyAsset("game"),', 'loadNpcAsset("sam", "monster"), loadNpcAsset("tibo", "monster"), loadGrassyAsset("game"),');
        replace('const tuning = chapter === null ? TUNING : facilityGameTuning();', 'const tuning = chapter === null ? TUNING : facilityGameTuning(); tuning.camera.framingOffsetY = -2; tuning.camera.lookAhead = 0;');
        replace('if (debug) exposeDebug({', 'exposeDebug({ audio, tuning,');
        replace(/loading.hidden = true;\s*canvas.focus\(\);/, 'settings.setOpen(true); loading.hidden = true; canvas.focus();');
        await route.fulfill({ response, body });
      } catch(error) { rejectRoute(error); await route.abort(); }
    });
    await Promise.race([routeFailed, (async()=>{
      await page.goto('http://127.0.0.1:5182/?mode=game&level=facility&scene=fortress&quality=high', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__pelicanGame, null, { timeout: 120000 });
    })()]);
    await page.addStyleTag({ content: 'body > *:not(#app){display:none!important} #app{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important} #app > *:not(canvas){display:none!important} canvas{cursor:none!important}' });
    await page.keyboard.press('KeyH');
    await page.evaluate(async kind => {
      const h = window.__pelicanGame;
      const { createBossEntity } = await import('/src/entities/boss.ts');
      const { createBossDirector, BOSS_FILMS } = await import('/scripts/pelican-boss-director.mjs');
      const player = h.world.entities.find(e => e.id === h.world.playerId);
      const film = BOSS_FILMS[kind];
      const boss = createBossEntity(h.world.nextId++, kind, { x: 172, y: 75 }, h.world.tuning);
      // 片场数值为镜头和动作服务，正式游戏资源保持不变。
      player.health.hp = player.health.maxHp = 10000;
      player.armored = true;
      boss.health.hp = boss.health.maxHp = 1000;
      h.world.entities.push(boss);
      h.settings.set('wind', 'calm');
      h.settings.set('precip', 'manual');
      h.settings.set('rain', 'heavy'); h.settings.set('snow', 'heavy');
      h.settings.set('rainPower', 1.1); h.settings.set('snowPower', .8);
      h.settings.set('quality', 'high');
      h.precip.controller.update(8, 8, { rain: 'heavy', snow: 'heavy' }, 0, h.world.env);
      const director = createBossDirector(h.world, player, boss);
      h.tracker.consume = () => director.next();
      const cameraUpdate = h.cameraRig.update;
      h.tuning.camera.distance = 32;
      h.cameraRig.snapTo(156, 78, 1);
      // 传送仍走真实特效与碰撞；镜头继续按双方构图平滑追踪。
      h.cameraRig.snapTo = () => {};
      h.cameraRig.update = (x, y, facing, dt) => {
        const actors = boss.health.hp > 0 ? [player, boss] : [player];
        const left = Math.min(...actors.map(a => a.body.x));
        const right = Math.max(...actors.map(a => a.body.x));
        const bottom = Math.min(...actors.map(a => a.body.y));
        const top = Math.max(...actors.map(a => a.body.y + a.body.height + 1.5));
        const moving = player.pelican.ride.mode !== 'off' || !player.body.onGround;
        const halfFov = Math.tan(h.stage.camera.fov * Math.PI / 360);
        const distance = Math.max(moving ? 24 : 17, (right-left+12)/(2*halfFov*16/9), (top-bottom+8)/(2*halfFov));
        h.tuning.camera.distance += (distance-h.tuning.camera.distance) * (1-Math.exp(-2.8*dt));
        cameraUpdate((left+right)/2, (bottom+top)/2 + .5, 1, dt);
      };
      const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      const render = h.stage.render;
      h.stage.render = () => {
        render();
        ctx.drawImage(h.stage.canvas, 0, 0, 1920, 1080);
        const gradient = ctx.createLinearGradient(0,0,0,155);
        gradient.addColorStop(0,'rgba(5,15,25,.78)'); gradient.addColorStop(1,'rgba(5,15,25,0)');
        ctx.fillStyle=gradient; ctx.fillRect(0,0,1920,155);
        const bars=[
          {entity:player,name:player.pelican.form==='human'?'GRASSY':'PELICAN',color:'#78daec',x:54},
          {entity:boss,name:kind.toUpperCase(),color:kind==='sam'?'#ceafff':'#ffb06a',x:1286},
        ];
        for(const {entity,name,color,x} of bars){
          ctx.fillStyle='#edf7ff';ctx.font='600 23px sans-serif';ctx.fillText(name,x,48);
          ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(x,64,580,7);
          ctx.fillStyle=color;ctx.fillRect(x,64,580*Math.max(0,entity.health.hp)/entity.health.maxHp,7);
        }
        const t=director.seconds;
        if(t<3){
          ctx.textAlign='center';ctx.fillStyle='#f4f9ff';ctx.font='700 40px sans-serif';ctx.fillText(film.title,960,155);
          ctx.fillStyle='#bad8e4';ctx.font='20px sans-serif';ctx.fillText('PELICAN 429  /  堡垒决战',960,190);ctx.textAlign='left';
        }
        const [at,label]=director.stage;
        if(t>=3 && t-at<2 && boss.health.hp>0){
          ctx.textAlign='center';ctx.font='600 29px sans-serif';
          ctx.fillStyle='rgba(5,15,25,.62)';ctx.fillRect(640,980,640,63);
          ctx.fillStyle='#e8f5fc';ctx.fillText(label,960,1022);ctx.textAlign='left';
        }
        if(boss.health.hp<=0){
          ctx.fillStyle='rgba(5,15,25,.7)';ctx.fillRect(680,205,560,110);
          ctx.textAlign='center';ctx.fillStyle='#efffe8';ctx.font='700 44px sans-serif';ctx.fillText(`${kind.toUpperCase()} 击败`,960,260);
          ctx.font='20px sans-serif';ctx.fillStyle='#b7e4ca';ctx.fillText('VICTORY',960,297);ctx.textAlign='left';
        }
      };
      const audio = h.audio.context.createMediaStreamDestination(); h.audio.limiter.connect(audio);
      const stream=canvas.captureStream(30); for(const track of audio.stream.getAudioTracks())stream.addTrack(track);
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:14000000,audioBitsPerSecond:192000});
      const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const stopped=new Promise(done=>recorder.onstop=done);
      window.recording={h,player,boss,director,recorder,chunks,stopped,canvas,dead:false};
    }, kind);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/opening.jpg` });
    await page.evaluate(() => { recording.recorder.start(1000); recording.h.settings.setOpen(false); });
    for (let checkpoint=10;checkpoint<=60;checkpoint+=10) {
      await page.waitForFunction(t => { const r=recording; r.dead ||=r.player.health.hp<=0||r.h.world.respawnTicks>0; return r.director.seconds>=t; },checkpoint,{timeout:30000});
      console.log(await page.evaluate(() => ({seconds:recording.director.seconds,hp:recording.player.health.hp,boss:[recording.boss.boss.kind,recording.boss.health.hp]})));
      await page.screenshot({ path: `${out}/frame-${checkpoint}.jpg` });
    }
    const result=await page.evaluate(async()=>{
      const r=recording;r.h.settings.setOpen(true);r.recorder.stop();await r.stopped;
      const data=await new Promise(done=>{const reader=new FileReader();reader.onload=()=>done(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(r.chunks,{type:'video/webm'}));});
      return {data,file:r.director.film.file,evidence:r.director.evidence,dead:r.dead,hp:r.player.health.hp,form:r.player.pelican.form,boss:{kind:r.boss.boss.kind,hp:r.boss.health.hp,maxHp:r.boss.health.maxHp},weather:r.h.precip.stats()};
    });
    await writeFile(`${out}/battle.webm`,Buffer.from(result.data,'base64'));
    const {data,...report}=result;
    await writeFile(`${out}/battle.json`,JSON.stringify(report,null,2));
    assert.equal(errors.length,0,errors.join('\n'));
    assert(!result.dead && result.hp>0,'主角在录制中死亡');
    const skills=kind==='tibo'?['water','fish','dash','swallowed','returned','photon']:['codex','bug','melee','overload','photon'];
    for(const action of [...skills,'mount','takeoff','teleport','flightTicks','rideTicks']) assert(result.evidence[action]>0,`动作未实际发生：${kind} / ${action}`);
    assert.equal(result.form,kind==='sam'?'human':'pelican','最终角色形态不正确');
    assert.equal(result.boss.hp,0,'Boss 未击败，保留原始录制供排查');
    console.log(`${kind} 战斗验收通过`,JSON.stringify({...result.evidence,samples:undefined}));
    exports.push({out,file:result.file});
    await page.close();
  }
} finally {
  if(browser)await browser.close();
  server.kill();
}
const ffprobe = values.ffmpeg.includes('/') ? join(dirname(values.ffmpeg), 'ffprobe') : 'ffprobe';
for (const {out,file} of exports) {
  const {stdout} = await promisify(execFile)(ffprobe, ['-v','error','-select_streams','v:0','-show_entries','packet=pts_time,duration_time','-of','json',`${out}/battle.webm`]);
  const packets=JSON.parse(stdout).packets;
  const duration=Math.max(...packets.map(p=>Number(p.pts_time))) + 1/30;
  assert(Number.isFinite(duration) && duration>0,'无法读取原始录像时长');
  const speed=duration/60;
  assert(speed>=.5 && speed<=2,`录制性能不足：原片 ${duration} 秒，请降低机器负载重录`);
  await new Promise((done,reject)=>{
    const ffmpeg=spawn(values.ffmpeg,['-hide_banner','-loglevel','error','-y','-i',`${out}/battle.webm`,'-t','60','-vf',`setpts=PTS/${speed},fps=30,format=yuv420p`,'-af',`atempo=${speed}`,'-c:v','libx264','-preset','medium','-crf','21','-maxrate','8M','-bufsize','16M','-c:a','aac','-b:a','192k','-movflags','+faststart',`${out}/${file}`],{stdio:'inherit'});
    ffmpeg.once('error',reject);ffmpeg.once('exit',code=>code===0?done():reject(new Error(`FFmpeg 退出：${code}`)));
  });
  console.log(`视频已保存：${out}/${file}`);
}
