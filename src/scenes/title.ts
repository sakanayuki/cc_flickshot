/**
 * タイトル画面。難易度を選ぶとそのままゲームへ入る。
 */

import {
  BUTTON_PADDING,
  COLORS,
  DIFFICULTIES,
  LOGICAL_W,
  type DifficultyId,
  type Rect,
  type Vec2,
} from '../config.ts';
import { drawRoom, drawShell } from '../render/cabinet.ts';
import { drawDifficultyCard, drawLogo, drawMarquee, drawStampShelf } from '../render/panels.ts';
import { rectContains, text, type Ctx } from '../render/shapes.ts';
import type { PointerPhase, Scene, SceneContext } from './scene.ts';

const CARDS: { id: DifficultyId; rect: Rect }[] = [
  { id: 'easy', rect: { x: 96, y: 520, w: 528, h: 168 } },
  { id: 'normal', rect: { x: 96, y: 712, w: 528, h: 168 } },
];

export class TitleScene implements Scene {
  private time = 0;
  private pressed: DifficultyId | null = null;

  constructor(private app: SceneContext) {}

  enter(): void {
    this.time = 0;
    this.pressed = null;
  }

  exit(): void {
    this.pressed = null;
  }

  update(dt: number): void {
    this.time += dt;
  }

  onPointer(phase: PointerPhase, p: Vec2): void {
    if (phase === 'down') {
      this.pressed = hit(p);
      return;
    }
    if (phase === 'cancel') {
      this.pressed = null;
      return;
    }
    if (phase === 'up') {
      // 押し始めと同じカードの上で離したときだけ決定する
      const target = hit(p);
      const was = this.pressed;
      this.pressed = null;
      if (target && target === was) {
        this.app.commitSave({ lastDifficulty: target });
        this.app.goTo('game', { difficulty: DIFFICULTIES[target] });
      }
    }
  }

  render(ctx: Ctx): void {
    drawRoom(ctx);
    drawShell(ctx);
    drawMarquee(ctx, 62, 'ARCADE  COIN  GAME');
    drawLogo(ctx, LOGICAL_W / 2, 250, this.time);

    text(ctx, 'コインを弾いてレーンを登り、', LOGICAL_W / 2, 386, {
      size: 19,
      color: COLORS.textDim,
      weight: '700',
    });
    text(ctx, 'ちょうどいい隙間から落として 5 段おりる。', LOGICAL_W / 2, 416, {
      size: 19,
      color: COLORS.textDim,
      weight: '700',
    });
    text(ctx, '強すぎても弱すぎても、穴に落ちて終わり。', LOGICAL_W / 2, 452, {
      size: 17,
      color: COLORS.strong,
      weight: '700',
    });

    const last = this.app.save.lastDifficulty;
    for (const c of CARDS) {
      drawDifficultyCard(ctx, c.rect, DIFFICULTIES[c.id], c.id === last, this.pressed === c.id);
    }

    drawStampShelf(ctx, this.app.save.stampCount, 76, 986, LOGICAL_W - 152);

    text(ctx, 'パワーメーターには前のショットの跡が残る。', LOGICAL_W / 2, 1094, {
      size: 15,
      color: COLORS.textDim,
      weight: '700',
    });
    text(ctx, 'よわい / ちょうど / つよい を見ながら詰めていける。', LOGICAL_W / 2, 1122, {
      size: 15,
      color: COLORS.textDim,
      weight: '700',
    });

    text(ctx, 'MATTER.JS PHYSICS', LOGICAL_W / 2, 1206, {
      size: 11,
      color: COLORS.textDim,
      weight: '700',
      tracking: 4,
    });
  }
}

function hit(p: Vec2): DifficultyId | null {
  for (const c of CARDS) if (rectContains(c.rect, p, BUTTON_PADDING)) return c.id;
  return null;
}
