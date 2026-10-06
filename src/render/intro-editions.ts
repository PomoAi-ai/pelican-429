import type { IntroLanguage } from '../config/intro-language.ts';
import type { IntroEdition } from '../config/intro-editions.ts';
import { INTRO_DURATION } from '../config/intro.ts';
import { editionStoryTime, editionPlaybackTime } from '../config/intro-editions.ts';
import { drawStory, type IntroImages } from './intro-story.ts';
import { drawMelody, drawWorld, drawJazz } from './intro-editions-a.ts';
import { drawRelay, drawTides, drawCompiler } from './intro-editions-b.ts';
import { drawCosmos, drawDialogue, drawFugue, drawDream } from './intro-editions-c.ts';
import { drawStoryHud } from './intro-story-hud.ts';
import { drawFinale, drawFinaleScore } from './intro-finale.ts';
import { room, type EditionFrame } from './intro-edition-shared.ts';

const DRAW = { finale: drawFinale, melody: drawMelody, world: drawWorld, jazz: drawJazz, relay: drawRelay, tides: drawTides,
  compiler: drawCompiler, cosmos: drawCosmos, dialogue: drawDialogue, fugue: drawFugue, dream: drawDream };

/** 历史版本缩略图只绘制序奏，不创建堡垒 WebGL 场景。 */
export function drawEditionPrelude(frame: EditionFrame): void {
  const { ctx, width, height, edition } = frame;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = edition.background;
  ctx.fillRect(0, 0, width, height);
  DRAW[edition.id](frame);
  ctx.restore();
}

export function drawEditionIntro(ctx: CanvasRenderingContext2D, seconds: number, images: IntroImages,
  fortress: HTMLCanvasElement, width: number, height: number, edition: IntroEdition, controls = true, language: IntroLanguage = 'zh'): void {
  const stageHeight = Math.max(1, height - (controls ? 96 : 0));
  const frame: EditionFrame = { ctx, seconds: Math.min(seconds, edition.duration), progress: Math.min(1, seconds / edition.duration),
    width, height: stageHeight, edition, images, language };
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = seconds < edition.duration ? edition.background : '#000';
  ctx.fillRect(0,0,width,height);
  ctx.beginPath(); ctx.rect(0,0,width,stageHeight); ctx.clip();
  if (seconds < edition.duration) drawEditionPrelude(frame);
  else {
    // 第一幕的入场淡入叠在刚揭开的房间上，避免转场完成后突然黑一帧。
    if (seconds < edition.duration + 1.2) room(frame, 1);
    drawStory(ctx, editionStoryTime(seconds, edition), images, fortress, width, stageHeight, language);
    if (edition.id === 'finale') {
      drawFinaleScore({ ...frame, seconds: Math.min(seconds, editionPlaybackTime(INTRO_DURATION, edition)) });
      drawStoryHud(ctx, editionStoryTime(seconds, edition), width, stageHeight, language);
    }
  }
  ctx.restore();
}
