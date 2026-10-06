import { teleportPlayer } from '../src/sim/player-teleport.ts';
import { cancelBossSkill } from '../src/entities/boss.ts';
import { startTeleport } from '../src/entities/teleport.ts';
import { BOSS_RULES } from '../src/config/boss-rules.ts';

/** 片场调度复用真实输入与传送；数值只服务演出节奏。 */
export const BOSS_FILMS = {
  tibo: { title: '鹈鹕 VS TIBO', file: '01-鹈鹕击败Tibo.mp4', stages: [
    [0,'登场','intro'], [1,'疾驰 · 火力切入','ride'], [5,'弃车 · 破空','launch'],
    [8,'空中鱼群轰炸','air'], [13,'吞下弹幕 · 反击','swallow'], [19,'瞬移绕后 · 振翅突进','blinkDash'],
    [25,'跃过冲击波','dodge'], [30,'骑行追击','ride'], [34,'传送迎击 · 吞弹反吐','blinkSwallow'],
    [40,'俯冲轰炸','air'], [46,'光子风暴','photon'], [52,'终结 · 光子齐射','finish'], [58,'TIBO 击败','victory'],
  ]},
  sam: { title: '人形 VS SAM', file: '02-人形击败Sam.mp4', stages: [
    [0,'变身 · 人形觉醒','transform'], [3,'骑行突入','ride'], [7,'弃车起飞','launch'],
    [10,'空中 Codex 对射','air'], [16,'瞬移绕后 · Bug 弹群','blinkBug'], [22,'键盘近身连击','melee'],
    [28,'飞越 AGI 冲击','dodge'], [33,'高空追逐','air'], [39,'瞬移贴身 · 服务器超载','blinkOverload'],
    [46,'传送反打 · Codex 连发','blinkCombo'], [52,'终结 · 光子风暴','finish'], [58,'SAM 击败','victory'],
  ]},
};

export function createBossDirector(world, player, boss) {
  const human = boss.boss.kind === 'sam';
  const film = BOSS_FILMS[boss.boss.kind];
  let tick=0, stageIndex=-1, jumpBefore=false, skillAt=-100, wasDash=false;
  let teleportRequested=false, meleeAttack=null;
  const evidence={water:0,fish:0,dash:0,swallowed:0,returned:0,photon:0,codex:0,bug:0,melee:0,overload:0,mount:0,takeoff:0,teleport:0,flightTicks:0,rideTicks:0,humanTicks:0,deathAt:null,samples:[]};
  const push=world.events.push.bind(world.events);
  world.events.push=event=>{
    if(event.type==='projectileFired' && event.ownerId===player.id){
      const key={waterShot:'water',fishShot:'fish',codexShot:'codex',bugShot:'bug'}[event.kind];
      if(key)evidence[key]++;
      if(event.returned)evidence.returned++;
      const projectile=world.entities.find(e=>e.id===event.id).projectile;
      projectile.def={...projectile.def,damage:projectile.def.damage*(tick>=55.5*60?40:1.2)};
    }
    if(event.id===player.id){
      if(event.type==='swallowed')evidence.swallowed++;
      if(event.type==='photonUltimateBurst')evidence.photon++;
      if(event.type==='teleported')evidence.teleport++;
      if(event.type==='mount')evidence.mount++;
      if(event.type==='dismount' && event.cause==='takeoff')evidence.takeoff++;
      if(event.type==='combatAction' && event.phase==='released'){
        if(event.action==='server_overload')evidence.overload++;
      }
    }
    push(event);
  };
  const aim=()=>({x:boss.body.x,y:boss.body.y+boss.body.height*.55});
  const input=()=>({moveX:0,runHeld:true,jumpHeld:false,jumpPressed:false,attackPressed:false,attackSource:'mouse',downHeld:false,shootPressed:false,shootHeld:false,mountPressed:false,transformPressed:false,skillPressed:0,skill1Held:false,aim:aim()});
  const clampX=x=>Math.max(128,Math.min(183,x));
  function enter(mode){
    teleportRequested=false;
    cancelBossSkill(boss);
    boss.health.hitstunTicks=0;
    boss.boss.cooldownTicks=['intro','transform','ride','launch','blinkBug','blinkOverload'].includes(mode)?240:12;
    boss.boss.blinkCooldownTicks=mode==='dodge'?0:90;
    boss.boss.nextSkill=mode==='dodge'?2:0;
    if(boss.body.x>177||boss.body.x<133){
      boss.boss.blink=startTeleport(boss,{x:155,y:75},BOSS_RULES[boss.boss.kind].blinkWindupTicks);
    }
    if(mode==='photon'||mode==='finish')world.photon.cooldownTicks=0;
  }
  return {
    evidence,
    film,
    get seconds(){return tick/60;},
    get stage(){return film.stages[stageIndex<0?0:stageIndex];},
    next(){
      const t=tick++/60;
      const index=film.stages.findLastIndex(s=>t>=s[0]);
      const [at,,mode]=film.stages[index];
      const elapsed=t-at;
      if(index!==stageIndex){stageIndex=index;enter(mode);}
      const p=player.pelican,w=p.weapon,f=input();
      if(p.flightMode==='fly')evidence.flightTicks++;
      if(p.ride.mode==='riding' && Math.abs(player.body.vx)>2)evidence.rideTicks++;
      if(p.form==='human')evidence.humanTicks++;
      if(player.attack?.def.id==='keyboardSmash'&&player.attack.elapsed>=player.attack.def.startup&&player.attack!==meleeAttack){evidence.melee++;meleeAttack=player.attack;}
      if(w.dashTicks>0&&!wasDash)evidence.dash++;
      wasDash=w.dashTicks>0;
      if(boss.health.hp<=0&&evidence.deathAt===null)evidence.deathAt=t;
      if(tick%60===0)evidence.samples.push({t,hp:player.health.hp,bossHp:boss.health.hp,form:p.form,mode,x:player.body.x,y:player.body.y,bossX:boss.body.x,bossY:boss.body.y});
      if(boss.health.hp<=0||mode==='victory')return f;
      const dx=boss.body.x-player.body.x;
      const moveTo=(x,gap=.7)=>{const d=x-player.body.x;f.moveX=Math.abs(d)>gap?Math.sign(d):0;};
      const range=d=>moveTo(clampX(boss.body.x-(boss.body.x>175?1:boss.body.x<135?-1:dx>=0?1:-1)*d));
      const skill=slot=>{if(tick-skillAt>20){f.skillPressed=slot;skillAt=tick;}};
      const fly=y=>{f.jumpHeld=player.body.y<y&&p.flightTicks>0;if(p.jumping&&elapsed>.18&&elapsed<.35)f.jumpHeld=false;};
      const blink=distance=>{
        if(!teleportRequested){
          const target=boss.boss.blink?.target??boss.body;
          const side=player.body.x<target.x?1:-1;
          teleportRequested=teleportPlayer(world,{x:clampX(target.x+side*distance),y:Math.max(75,target.y)})!==null;
        }
      };
      if(mode==='intro') { range(12); }
      else if(mode==='transform'){if(elapsed>.25&&p.form==='pelican'&&p.transformTicks<0)f.transformPressed=true;}
      else if(mode==='ride'){
        if(p.ride.mode==='off'&&player.body.onGround)f.mountPressed=true;
        moveTo(t<10?164:148);
        if(!human&&elapsed>.7)f.shootHeld=true;
      } else if(mode==='launch'){
        f.moveX=player.body.x<166?1:-1;
        f.jumpHeld=elapsed<.15||elapsed>.3;
        if(player.body.y>83)f.jumpHeld=false;
      } else if(mode==='air'){
        if(p.ride.mode==='riding')f.mountPressed=true;
        const desired=clampX(boss.body.x+(Math.sin(elapsed*.75)>0?5:-5));moveTo(desired);
        fly(82+Math.sin(elapsed)*1.5);
        f.skill1Held=true;
      } else if(mode==='swallow'||mode==='blinkSwallow'){
        if(mode==='blinkSwallow')blink(5);
        range(4.5);
        f.downHeld=player.body.y>76;
        if(w.gulpTicks===0&&w.cooldowns[2]===0&&p.shotTicks<0)skill(3);
      } else if(mode==='blinkDash'){
        blink(4);range(2);
        if(w.cooldowns[1]===0&&p.shotTicks<0)skill(2);
        else if(w.dashTicks===0&&w.cooldowns[1]>100)f.shootHeld=true;
      } else if(mode==='dodge'){
        range(6);fly(81);
        if(elapsed>2)f.skill1Held=true;
      } else if(mode==='blinkBug'){
        blink(6);range(6);
        if(p.humanCombat.action===null)skill(2);
      } else if(mode==='melee'){
        blink(1.5);range(1.2);fly(Math.min(84,boss.body.y));
        f.shootHeld=true;
      } else if(mode==='blinkOverload'){
        blink(3.5);range(3.8);
        if(elapsed>.8&&p.humanCombat.action===null)skill(3);
        if(evidence.overload>0&&p.humanCombat.action===null)f.skill1Held=true;
      } else if(mode==='blinkCombo'){
        blink(6);range(6);f.skill1Held=true;
      } else if(mode==='photon'||mode==='finish'){
        if(mode==='finish')blink(4.5);
        range(4.5);
        if(elapsed>.8&&world.photon.cooldownTicks===0)skill(4);
        else f.skill1Held=true;
        if(elapsed>1.5&&elapsed<3)fly(Math.max(78,boss.body.y));
      }
      if(player.body.x<127)f.moveX=1;
      if(player.body.x>184)f.moveX=-1;
      f.jumpPressed=f.jumpHeld&&(!jumpBefore||player.body.onGround||(p.ride.mode==='riding'&&elapsed>.3));
      jumpBefore=f.jumpHeld;
      return f;
    },
  };
}
