/**
 * タイトル画面。詳細設計書 §8.2。
 */

import {
  BUTTON_PADDING,
  DIFFICULTIES,
  LOGICAL_W,
  type DifficultyId,
  type Rect,
  type Vec2,
} from '../config.ts';
import {
  drawButton,
  drawSky,
  drawStampBook,
  drawSunAndClouds,
  drawTitleLogo,
} from '../render/drawings.ts';
import { rectContains, type Ctx } from '../render/shapes.ts';
import type { PointerPhase, Scene, SceneContext } from './scene.ts';

interface DiffButton {
  id: DifficultyId;
  rect: Rect;
}

const BUTTONS: DiffButton[] = [
  { id: 'easy', rect: { x: 120, y: 470, w: 480, h: 140 } },
  { id: 'normal', rect: { x: 120, y: 650, w: 480, h: 140 } },
];

export class TitleScene implements Scene {
  private time = 0;
  private pressed: DifficultyId | null = null;

  constructor(private ctxApp: SceneContext) {}

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
      this.pressed = hitButton(p);
      return;
    }
    if (phase === 'cancel') {
      this.pressed = null;
      return;
    }
    if (phase === 'up') {
      // 押し始めと同じボタンの上で離したときだけ発火する。
      // 押し間違いに気づいて指をずらせば発火しない(3歳児向けの配慮)
      const hit = hitButton(p);
      const wasPressed = this.pressed;
      this.pressed = null;
      if (hit && hit === wasPressed) {
        this.ctxApp.commitSave({ lastDifficulty: hit });
        this.ctxApp.goTo('game', { difficulty: DIFFICULTIES[hit] });
      }
    }
  }

  render(ctx: Ctx): void {
    drawSky(ctx);
    drawSunAndClouds(ctx, this.time);

    drawTitleLogo(ctx, { x: LOGICAL_W / 2, y: 230 }, this.time);

    const recommended = this.ctxApp.save.lastDifficulty;
    for (const b of BUTTONS) {
      drawButton(
        ctx,
        b.rect,
        DIFFICULTIES[b.id].label,
        b.id === recommended,
        this.pressed === b.id,
      );
    }

    drawStampBook(ctx, this.ctxApp.save.stampCount, { x: 76, y: 900 }, LOGICAL_W - 152);
  }
}

function hitButton(p: Vec2): DifficultyId | null {
  for (const b of BUTTONS) {
    if (rectContains(b.rect, p, BUTTON_PADDING)) return b.id;
  }
  return null;
}
