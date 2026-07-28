/**
 * ゲーム画面。コインは右上から入り、レールを 5 段降りて、あたりの口を目指す。
 */

import {
  COIN_R,
  COLORS,
  DIFFICULTIES,
  FALL_ANIM,
  GIVEUP_CANCEL_R,
  GIVEUP_CENTER,
  GIVEUP_HOLD,
  GIVEUP_R,
  GIVEUP_RING_DELAY,
  GUIDE_IDLE_DELAY,
  INSERT_ANIM,
  LAND_SQUASH_TIME,
  LEVER_HIT_DELAY,
  ROW_COUNT,
  WIN_ANIM,
  type DifficultyConfig,
  type Row,
  type Vec2,
  type WinPocket,
} from '../config.ts';
import {
  buildHoles,
  buildRows,
  buildWinPocket,
  groovePos,
  onPlank,
  plankSurfaceY,
  type Hole,
} from '../game/board.ts';
import {
  canFlick,
  createCoin,
  flickCoin,
  placeAtStart,
  stepCoin,
  type Coin,
} from '../game/coin.ts';
import { createLevers, triggerLevers, updateLevers, type LeverState } from '../game/levers.ts';
import {
  createPlunger,
  plungerPointerDown,
  plungerPointerMove,
  plungerPointerUp,
  releasePlunger,
  updatePlunger,
  type PlungerState,
} from '../game/plunger.ts';
import {
  drawBoardFace,
  drawBoardFrame,
  drawCabinetBase,
  drawCabinetLower,
  drawCoin,
  drawCoinShadow,
  drawCoinSlot,
  drawEntryChute,
  drawGiveUpButton,
  drawHandGuide,
  drawInsertCoin,
  drawLever,
  drawPlank,
  drawPlunger,
  drawRoundHole,
  drawRoundHoleFront,
  drawSideAnimals,
  drawWinPocket,
} from '../render/drawings.ts';
import { ParticleSystem } from '../render/particles.ts';
import { clamp01, dist, easeOut, lerp, text, type Ctx } from '../render/shapes.ts';
import { stampIndexFor } from '../save.ts';
import type { GameParams, Outcome, PointerPhase, Scene, SceneContext } from './scene.ts';

type GamePhase = 'insert' | 'play' | 'ending';

export class GameScene implements Scene {
  private difficulty: DifficultyConfig = DIFFICULTIES.easy;
  private rows: Row[] = [];
  private pocket: WinPocket = { left: 0, right: 0, y: 0 };
  private holes: Hole[] = [];

  private phase: GamePhase = 'insert';
  private phaseTime = 0;
  private time = 0;

  private coin: Coin = createCoin();
  private plunger: PlungerState = createPlunger();
  private levers: LeverState[] = createLevers();
  private particles = new ParticleSystem();

  /** レバーを振ってからコインに当たるまでのわずかな間 */
  private pendingPower: number | null = null;
  private pendingTimer = 0;

  /** 何段目まで降りたか (1..ROW_COUNT) */
  private depth = 1;
  private outcome: Outcome | null = null;
  private endingTimer = 0;

  /** 着地のつぶれ演出の残り時間 */
  private squashTimer = 0;
  /** 端にぶつかる火花の連発防止 */
  private lastBonk = -1;

  private giveUpHold = 0;
  private giveUpPointerId: number | null = null;
  private flagWave = 0;
  private debug = false;

  constructor(private app: SceneContext) {
    this.debug = new URLSearchParams(location.search).get('debug') === '1';
  }

  enter(params: unknown): void {
    const p = params as GameParams | undefined;
    this.difficulty = p?.difficulty ?? DIFFICULTIES[this.app.save.lastDifficulty];
    this.rows = buildRows(this.difficulty);
    this.pocket = buildWinPocket(this.difficulty);
    this.holes = buildHoles(this.difficulty);

    this.phase = 'insert';
    this.phaseTime = 0;
    this.time = 0;
    this.coin = createCoin();
    this.plunger = createPlunger();
    this.levers = createLevers();
    this.particles.clear();
    this.pendingPower = null;
    this.pendingTimer = 0;
    this.depth = 1;
    this.outcome = null;
    this.endingTimer = 0;
    this.squashTimer = 0;
    this.lastBonk = -1;
    this.giveUpHold = 0;
    this.giveUpPointerId = null;
    this.flagWave = 0;
  }

  exit(): void {
    releasePlunger(this.plunger);
    this.particles.clear();
  }

  // ------------------------------------------------------------ 更新

  update(dt: number): void {
    this.time += dt;
    this.phaseTime += dt;
    this.flagWave += dt;
    updatePlunger(this.plunger, dt);
    this.particles.update(dt);

    switch (this.phase) {
      case 'insert':
        if (this.phaseTime >= INSERT_ANIM) {
          placeAtStart(this.coin, this.rows);
          this.phase = 'play';
          this.phaseTime = 0;
        }
        break;
      case 'play':
        this.updatePlay(dt);
        break;
      case 'ending':
        this.stepCoinWithEffects(dt);
        updateLevers(this.levers, dt, 0);
        this.endingTimer -= dt;
        if (this.endingTimer <= 0) this.finish();
        break;
    }
  }

  private updatePlay(dt: number): void {
    const st = this.plunger;

    if (this.giveUpPointerId !== null) {
      this.giveUpHold += dt;
      if (this.giveUpHold >= GIVEUP_HOLD) {
        this.giveUpPointerId = null;
        this.beginEnding('giveup');
        return;
      }
    }

    updateLevers(this.levers, dt, st.grabbed ? st.pull : st.visualPull);

    // レバーが振り上がった瞬間にコインを弾く
    if (this.pendingPower !== null) {
      this.pendingTimer -= dt;
      if (this.pendingTimer <= 0) {
        const power = this.pendingPower;
        this.pendingPower = null;
        if (flickCoin(this.coin, this.rows, power)) {
          this.particles.emitStars({ x: this.coin.pos.x, y: this.coin.pos.y + COIN_R * 0.6 }, 5);
        }
      }
    }

    this.stepCoinWithEffects(dt);
  }

  private stepCoinWithEffects(dt: number): void {
    if (this.squashTimer > 0) this.squashTimer = Math.max(0, this.squashTimer - dt);

    const r = stepCoin(this.coin, dt, this.rows, this.pocket, this.holes);

    if (this.coin.state === 'onPlank') {
      this.depth = Math.max(this.depth, this.coin.rowIndex + 1);
    }
    if (r.landedOnRow !== null) {
      this.squashTimer = LAND_SQUASH_TIME;
      this.particles.emitPuff({ x: this.coin.pos.x, y: this.coin.pos.y + COIN_R });
    }
    if (r.bonk && this.time - this.lastBonk > 0.25) {
      this.lastBonk = this.time;
      this.particles.emitStars(r.bonk, 4, '#FFD24A');
    }
    if (this.phase !== 'ending') {
      if (r.fellInHole) {
        this.particles.emitPuff({ x: this.coin.pos.x, y: this.coin.pos.y + COIN_R * 0.5 }, 4);
        this.beginEnding('hole');
        return;
      }
      if (r.reachedWin) {
        this.depth = ROW_COUNT;
        this.particles.emitConfetti({ x: this.coin.pos.x, y: this.coin.pos.y - 120 }, 26, 240);
        this.particles.emitStars(this.coin.pos, 8, '#FFF3B0');
        this.beginEnding('win');
      }
    }
  }

  private beginEnding(outcome: Outcome): void {
    this.outcome = outcome;
    this.phase = 'ending';
    this.phaseTime = 0;
    this.pendingPower = null;
    releasePlunger(this.plunger);
    this.endingTimer = outcome === 'hole' ? FALL_ANIM : outcome === 'win' ? WIN_ANIM : 0;
  }

  private finish(): void {
    const outcome = this.outcome ?? 'giveup';
    let newStampIndex: number | null = null;
    if (outcome === 'win') {
      const nth = this.app.save.stampCount + 1;
      newStampIndex = stampIndexFor(nth);
      // リザルトに入る瞬間に保存する。演出中にリロードされても記録が残る
      this.app.commitSave({ stampCount: nth });
    }
    this.app.goTo('result', {
      outcome,
      reachedDepth: this.depth,
      difficulty: this.difficulty,
      newStampIndex,
    });
  }

  // ------------------------------------------------------------ 入力

  onPointer(phase: PointerPhase, p: Vec2, pointerId: number): void {
    if (this.phase !== 'play') return;

    switch (phase) {
      case 'down': {
        if (dist(p, GIVEUP_CENTER) <= GIVEUP_R && this.giveUpPointerId === null) {
          this.giveUpPointerId = pointerId;
          this.giveUpHold = 0;
          this.capture(pointerId);
          return;
        }
        if (this.plunger.cooldown > 0) return;
        if (plungerPointerDown(this.plunger, p, pointerId)) this.capture(pointerId);
        break;
      }
      case 'move': {
        if (pointerId === this.giveUpPointerId) {
          if (dist(p, GIVEUP_CENTER) > GIVEUP_CANCEL_R) {
            this.giveUpPointerId = null;
            this.giveUpHold = 0;
          }
          return;
        }
        if (pointerId === this.plunger.pointerId) plungerPointerMove(this.plunger, p);
        break;
      }
      case 'up':
      case 'cancel': {
        if (pointerId === this.giveUpPointerId) {
          this.giveUpPointerId = null;
          this.giveUpHold = 0;
          return;
        }
        if (pointerId !== this.plunger.pointerId) return;
        // pointercancel でも発射する。iOS でシステムジェスチャに割り込まれたときに
        // 操作が無かったことにならないようにするため
        const power = plungerPointerUp(this.plunger);
        if (power !== null) {
          triggerLevers(this.levers);
          this.pendingPower = power;
          this.pendingTimer = LEVER_HIT_DELAY;
        }
        break;
      }
    }
  }

  private capture(pointerId: number): void {
    try {
      this.app.canvas.setPointerCapture(pointerId);
    } catch {
      /* 一部環境では失敗しうる。捕捉できなくても動作は続く */
    }
  }

  // ------------------------------------------------------------ 描画

  render(ctx: Ctx): void {
    drawCabinetBase(ctx);
    drawBoardFace(ctx, this.rows, this.pocket);

    drawEntryChute(ctx, this.rows);
    for (const h of this.holes) drawRoundHole(ctx, h);
    drawWinPocket(ctx, this.pocket, this.flagWave);
    drawSideAnimals(ctx, this.rows, this.time);
    for (const row of this.rows) drawPlank(ctx, row);
    for (const row of this.rows) drawLever(ctx, row, this.levers[row.index]!);

    this.renderCoin(ctx);
    this.particles.render(ctx);

    drawBoardFrame(ctx);
    drawCabinetLower(ctx);

    drawCoinSlot(ctx);
    if (this.phase === 'insert') {
      drawInsertCoin(ctx, this.rows, clamp01(this.phaseTime / INSERT_ANIM));
    }

    drawPlunger(
      ctx,
      this.plunger.knobY,
      this.plunger.grabbed ? this.plunger.pull : this.plunger.visualPull,
    );
    drawGiveUpButton(ctx, this.giveUpRingProgress());

    if (this.shouldShowGuide()) {
      const phase = (((this.time / 1.2) % 1) + 1) % 1;
      drawHandGuide(ctx, this.plunger.knobY, phase);
    }

    if (this.debug) this.renderDebug(ctx);
  }

  private renderCoin(ctx: Ctx): void {
    if (this.phase === 'insert') return; // 投入中はシュート側で描く
    const c = this.coin;

    if (c.state === 'falling') {
      this.renderFallingCoin(ctx, c);
      return;
    }

    if (c.state === 'win') {
      const t = clamp01(c.timer / 0.5);
      const bounce = Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t) * 16;
      drawCoin(ctx, { x: c.pos.x, y: c.pos.y - bounce }, COIN_R, 0, c.spin);
      return;
    }

    if (c.state === 'airborne') {
      this.renderAirShadow(ctx, c);
    }
    const squash =
      this.squashTimer > 0 ? Math.sin((this.squashTimer / LAND_SQUASH_TIME) * Math.PI) : 0;
    drawCoin(ctx, c.pos, COIN_R, 0, c.spin, squash);
  }

  /** 空中のコインの真下、着地面に落ちる影。どこに落ちるかの手がかり */
  private renderAirShadow(ctx: Ctx, c: Coin): void {
    const target = c.rowIndex + 1;
    let surfaceY: number;
    if (target >= ROW_COUNT) {
      surfaceY = this.pocket.y + 4;
    } else {
      const row = this.rows[target]!;
      surfaceY = onPlank(row, c.pos.x) ? plankSurfaceY(row, c.pos.x) : row.grooveY + 6;
    }
    const height = surfaceY - (c.pos.y + COIN_R);
    if (height > 6) drawCoinShadow(ctx, c.pos.x, surfaceY, height);
  }

  /** 丸穴に「ぽとん」と沈む。穴の手前のリムがコインを隠す */
  private renderFallingCoin(ctx: Ctx, c: Coin): void {
    const t = clamp01(c.timer / FALL_ANIM);
    const hole = c.hole;
    if (!hole) {
      ctx.save();
      ctx.globalAlpha = 1 - t;
      drawCoin(ctx, c.pos, COIN_R * (1 - t * 0.5), 0, c.spin);
      ctx.restore();
      return;
    }

    // 0..0.3: 穴の口まで滑る / 0.3..0.8: 沈む / 0.8..: 消える
    const slide = easeOut(clamp01(t / 0.3));
    const sink = clamp01((t - 0.3) / 0.5);
    const x = lerp(c.fallFrom.x, hole.cx, slide);
    const y = lerp(Math.min(c.fallFrom.y, hole.cy - COIN_R * 0.4), hole.cy + hole.r * 0.55, sink);
    const scale = 1 - sink * 0.45;

    ctx.save();
    if (t > 0.8) ctx.globalAlpha = Math.max(0, 1 - (t - 0.8) / 0.2);
    drawCoin(ctx, { x, y }, COIN_R * scale, 0, c.spin + slide * 2 + sink * 3);
    ctx.restore();
    if (sink > 0) drawRoundHoleFront(ctx, hole);
  }

  private giveUpRingProgress(): number {
    if (this.giveUpPointerId === null) return 0;
    if (this.giveUpHold < GIVEUP_RING_DELAY) return 0;
    return clamp01(this.giveUpHold / GIVEUP_HOLD);
  }

  /**
   * 弾ける状態でしばらく何もしていないときだけガイドを出す。
   * 3歳児はひらがなを読めないため、この指アニメが唯一の操作説明になる。
   */
  private shouldShowGuide(): boolean {
    return (
      this.phase === 'play' &&
      this.plunger.idleTime >= GUIDE_IDLE_DELAY &&
      this.plunger.cooldown <= 0 &&
      this.coin.state === 'onPlank' &&
      Math.abs(this.coin.vx) < 5 &&
      canFlick(this.coin, this.rows)
    );
  }

  private renderDebug(ctx: Ctx): void {
    const c = this.coin;
    const g = c.state === 'onPlank' ? groovePos(this.rows[c.rowIndex]!) : null;
    const lines = [
      `phase=${this.phase} state=${c.state}`,
      `row=${c.rowIndex + 1} x=${c.x.toFixed(0)} vx=${c.vx.toFixed(0)} groove=${g?.x.toFixed(0) ?? '-'}`,
      `pull=${this.plunger.pull.toFixed(3)} depth=${this.depth}`,
      `diff=${this.difficulty.id} plank=${this.difficulty.plankWidth}`,
    ];
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(170, 20, 400, 20 + lines.length * 26);
    ctx.restore();
    lines.forEach((l, i) =>
      text(ctx, l, 182, 44 + i * 26, {
        size: 20,
        color: COLORS.ink,
        align: 'left',
        weight: '600',
      }),
    );
  }
}
