/**
 * リザルト画面。詳細設計書 §8.7。
 *
 * どの結果でも責める演出はしない。
 */

import {
  BUTTON_PADDING,
  COLORS,
  LANE_COUNT,
  LOGICAL_W,
  RESULT_INPUT_DELAY,
  STAMP_ANIM,
  type Rect,
  type Vec2,
} from '../config.ts';
import { drawCheerAnimal } from '../render/animals.ts';
import {
  drawButton,
  drawResultMountain,
  drawSky,
  drawStamp,
  drawSunAndClouds,
} from '../render/drawings.ts';
import { ParticleSystem } from '../render/particles.ts';
import { circle, clamp01, easeBack, paint, rectContains, text, type Ctx } from '../render/shapes.ts';
import type { Outcome, PointerPhase, ResultParams, Scene, SceneContext } from './scene.ts';

const AGAIN: Rect = { x: 120, y: 980, w: 480, h: 140 };
const TO_TITLE: Rect = { x: 230, y: 1150, w: 260, h: 90 };

const HEADING: Record<Outcome, string> = {
  goal: 'やったね!',
  hole: 'おしい!',
  giveup: 'またね!',
};

export class ResultScene implements Scene {
  private params: ResultParams | null = null;
  private time = 0;
  private particles = new ParticleSystem();
  private confettiTimer = 0;
  private pressed: 'again' | 'title' | null = null;

  constructor(private app: SceneContext) {}

  enter(params: unknown): void {
    this.params = params as ResultParams;
    this.time = 0;
    this.confettiTimer = 0;
    this.pressed = null;
    this.particles.clear();
    if (this.params.outcome === 'goal') {
      this.particles.emitConfetti({ x: LOGICAL_W / 2, y: -30 }, 40);
    }
  }

  exit(): void {
    this.particles.clear();
    this.pressed = null;
  }

  update(dt: number): void {
    this.time += dt;
    this.particles.update(dt);
    if (this.params?.outcome === 'goal') {
      this.confettiTimer -= dt;
      if (this.confettiTimer <= 0) {
        this.confettiTimer = 0.4;
        this.particles.emitConfetti({ x: LOGICAL_W / 2, y: -30 }, 20);
      }
    }
  }

  onPointer(phase: PointerPhase, p: Vec2): void {
    // 演出中の連打で飛ばされないよう、しばらく反応しない
    if (this.time < RESULT_INPUT_DELAY) return;

    if (phase === 'down') {
      this.pressed = hit(p);
      return;
    }
    if (phase === 'cancel') {
      this.pressed = null;
      return;
    }
    if (phase === 'up') {
      const h = hit(p);
      const was = this.pressed;
      this.pressed = null;
      if (!h || h !== was) return;
      if (h === 'again') {
        this.app.goTo('game', { difficulty: this.params?.difficulty });
      } else {
        this.app.goTo('title');
      }
    }
  }

  render(ctx: Ctx): void {
    const p = this.params;
    drawSky(ctx);
    drawSunAndClouds(ctx, this.time);
    if (!p) return;

    const goal = p.outcome === 'goal';

    text(ctx, HEADING[p.outcome], LOGICAL_W / 2, 240, {
      size: 92,
      color: goal ? COLORS.accent : COLORS.ink,
      outline: 14,
    });

    drawResultMountain(ctx, { x: LOGICAL_W / 2, y: 560 }, p.reachedLane, goal);

    text(
      ctx,
      goal ? `${LANE_COUNT}だんめ ゴール!` : `${p.reachedLane}だんめ まで のぼったよ`,
      LOGICAL_W / 2,
      710,
      { size: 34, color: COLORS.ink, outline: 8 },
    );

    this.renderReaction(ctx, p);
    this.renderStamp(ctx, p);

    drawButton(ctx, AGAIN, 'もういちど', true, this.pressed === 'again');
    drawButton(ctx, TO_TITLE, 'さいしょから', false, this.pressed === 'title');

    if (goal) this.particles.render(ctx);
  }

  /** 結果ごとのどうぶつの反応。失敗でも悲しい表現は使わない */
  private renderReaction(ctx: Ctx, p: ResultParams): void {
    const t = this.time;
    const cx = LOGICAL_W / 2;
    switch (p.outcome) {
      case 'goal':
        drawCheerAnimal(ctx, 'usagi', cx - 150, 830, 92, 0.6 + Math.sin(t * 6) * 0.4);
        drawCheerAnimal(ctx, 'kuma', cx + 150, 830, 92, 0.6 + Math.sin(t * 6 + 1.2) * 0.4);
        break;
      case 'hole': {
        // 穴からひょっこり顔を出して笑う
        const peek = Math.min(1, t * 1.6);
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - 120, 760, 240, 120);
        ctx.clip();
        drawCheerAnimal(ctx, 'risu', cx, 900 - peek * 78, 100, 0.35);
        ctx.restore();
        ctx.beginPath();
        ctx.ellipse(cx, 878, 116, 26, 0, 0, Math.PI * 2);
        paint(ctx, COLORS.hole, COLORS.ink, 5);
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - 120, 700, 240, 178);
        ctx.clip();
        drawCheerAnimal(ctx, 'risu', cx, 900 - peek * 78, 100, 0.35);
        ctx.restore();
        break;
      }
      case 'giveup':
        drawCheerAnimal(ctx, 'neko', cx, 840, 104, 0.5 + Math.sin(t * 5) * 0.45);
        break;
    }
  }

  /** ゴール時のスタンプ「ぺたん!」 */
  private renderStamp(ctx: Ctx, p: ResultParams): void {
    if (p.outcome !== 'goal' || p.newStampIndex === null) return;
    const start = 0.35;
    if (this.time < start) return;
    const t = clamp01((this.time - start) / STAMP_ANIM);
    // 大きく降ってきて、ぺたんと押される
    const scale = t < 1 ? 2.4 - 1.4 * easeBack(t) : 1;
    const center: Vec2 = { x: LOGICAL_W / 2 + 208, y: 452 };

    ctx.save();
    if (t < 1) ctx.globalAlpha = 0.35 + 0.65 * t;
    circle(ctx, center.x, center.y, 62);
    paint(ctx, 'rgba(255,255,255,0.85)', COLORS.accent, 5);
    drawStamp(ctx, p.newStampIndex, center, 104, scale);
    ctx.restore();

    if (t >= 1) {
      text(ctx, 'スタンプ ゲット!', center.x, center.y + 86, {
        size: 26,
        color: COLORS.accent,
        outline: 7,
      });
    }
  }
}

function hit(p: Vec2): 'again' | 'title' | null {
  if (rectContains(AGAIN, p, BUTTON_PADDING)) return 'again';
  if (rectContains(TO_TITLE, p, BUTTON_PADDING)) return 'title';
  return null;
}
