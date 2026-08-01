/**
 * リザルト画面。結果と、なぜそうなったか(弱すぎ / 強すぎ)を出す。
 * 責める演出はしない。次にどう直せばいいかだけを伝える。
 */

import {
  BUTTON_PADDING,
  COLORS,
  LOGICAL_H,
  LOGICAL_W,
  RESULT_INPUT_DELAY,
  ROW_COUNT,
  STAMP_ANIM,
  type DifficultyConfig,
  type Rect,
  type Vec2,
} from '../config.ts';
import { drawRoom, drawShell } from '../render/cabinet.ts';
import { Layer } from '../render/layer.ts';
import { drawButton } from '../render/hud.ts';
import { ParticleSystem } from '../render/particles.ts';
import { drawDepthLadder, drawMarquee, drawStampPress } from '../render/panels.ts';
import { alpha, clamp01, rectContains, text, type Ctx } from '../render/shapes.ts';
import type { Outcome, PointerPhase, ResultParams, Scene, SceneContext } from './scene.ts';

const AGAIN: Rect = { x: 120, y: 880, w: 480, h: 100 };
const HOME: Rect = { x: 240, y: 1012, w: 240, h: 64 };

const HEADLINE: Record<Outcome, string> = {
  win: 'あたり!',
  hole: 'おしい',
  giveup: 'またね',
};

const HINT: Record<string, string> = {
  weak: 'あと少し強く引くと、隙間まで届く',
  strong: '引きすぎ。もう少し弱く',
};

export class ResultScene implements Scene {
  private params: ResultParams | null = null;
  private time = 0;
  private particles = new ParticleSystem();
  private pressed: 'again' | 'home' | null = null;
  /** 動かない絵。結果ごとに看板が変わるので enter で捨てる */
  private bg = new Layer();

  constructor(private app: SceneContext) {}

  enter(params: unknown): void {
    this.params = (params as ResultParams | undefined) ?? null;
    this.time = 0;
    this.pressed = null;
    this.particles.clear();
    this.bg.invalidate();
    if (this.params?.outcome === 'win') {
      this.particles.emitConfetti({ x: LOGICAL_W / 2, y: -30 }, 90, LOGICAL_W);
    }
  }

  exit(): void {
    this.particles.clear();
    this.pressed = null;
    // 焼いた絵は数十 MB になる。使わないシーンで抱えたままにしない
    this.bg.invalidate();
  }

  update(dt: number): void {
    this.time += dt;
    this.particles.update(dt);
    if (this.params?.outcome === 'win' && this.time < 2.4 && Math.random() < dt * 6) {
      this.particles.emitConfetti({ x: LOGICAL_W / 2, y: -30 }, 8, LOGICAL_W);
    }
  }

  onPointer(phase: PointerPhase, p: Vec2): void {
    if (this.time < RESULT_INPUT_DELAY) return;
    if (phase === 'down') {
      this.pressed = hit(p);
      return;
    }
    if (phase === 'cancel') {
      this.pressed = null;
      return;
    }
    if (phase !== 'up') return;

    const target = hit(p);
    const was = this.pressed;
    this.pressed = null;
    if (!target || target !== was) return;

    if (target === 'again') {
      const d: DifficultyConfig | undefined = this.params?.difficulty;
      this.app.goTo('game', d ? { difficulty: d } : undefined);
    } else {
      this.app.goTo('title');
    }
  }

  render(ctx: Ctx): void {
    const p = this.params;
    this.bg.draw(ctx, LOGICAL_W, LOGICAL_H, (c) => {
      drawRoom(c);
      drawShell(c);
      drawMarquee(c, 62, p?.difficulty.tag ?? 'RESULT');
    });

    const outcome = p?.outcome ?? 'giveup';
    const accent =
      outcome === 'win' ? COLORS.gap : outcome === 'hole' ? COLORS.holeRim : COLORS.textDim;

    text(ctx, HEADLINE[outcome], LOGICAL_W / 2, 200, {
      size: 74,
      color: accent,
      weight: '900',
    });

    const hint = p?.lastShot ? HINT[p.lastShot] : undefined;
    if (outcome === 'hole' && hint) {
      text(ctx, hint, LOGICAL_W / 2, 268, {
        size: 20,
        color: COLORS.textDim,
        weight: '700',
      });
    }
    if (outcome === 'win') {
      text(ctx, `${p?.difficulty.label ?? ''} を 5 段おりきった`, LOGICAL_W / 2, 268, {
        size: 20,
        color: COLORS.textDim,
        weight: '700',
      });
    }

    drawDepthLadder(ctx, LOGICAL_W / 2, 330, p?.reachedDepth ?? 1, outcome === 'win');

    if (outcome === 'win' && p?.newStampIndex !== null && p?.newStampIndex !== undefined) {
      drawStampPress(ctx, LOGICAL_W / 2, 690, p.newStampIndex, this.time / STAMP_ANIM);
      text(ctx, 'メダルを 1 まい ゲット', LOGICAL_W / 2, 764, {
        size: 18,
        color: COLORS.accent,
        weight: '800',
      });
    } else {
      text(ctx, `とうたつ ${p?.reachedDepth ?? 1} / ${ROW_COUNT} だん`, LOGICAL_W / 2, 700, {
        size: 20,
        color: COLORS.textDim,
        weight: '700',
      });
      if (p?.lastPull != null) {
        text(ctx, `さいごに つかった力  ${Math.round(p.lastPull * 100)}%`, LOGICAL_W / 2, 750, {
          size: 18,
          color: alpha(COLORS.accent, 0.75),
          weight: '700',
        });
      }
    }

    this.particles.render(ctx);

    const ready = this.time >= RESULT_INPUT_DELAY;
    ctx.save();
    ctx.globalAlpha = ready ? 1 : clamp01(this.time / RESULT_INPUT_DELAY) * 0.5;
    drawButton(
      ctx,
      AGAIN,
      { fill: COLORS.gap, edge: alpha(COLORS.gap, 0.9), label: 'もういちど', size: 30 },
      this.pressed === 'again',
    );
    drawButton(
      ctx,
      HOME,
      { fill: COLORS.shellHi, edge: alpha(COLORS.textDim, 0.6), label: 'さいしょから', size: 19 },
      this.pressed === 'home',
    );
    ctx.restore();
  }
}

function hit(p: Vec2): 'again' | 'home' | null {
  if (rectContains(AGAIN, p, BUTTON_PADDING)) return 'again';
  if (rectContains(HOME, p, BUTTON_PADDING)) return 'home';
  return null;
}
