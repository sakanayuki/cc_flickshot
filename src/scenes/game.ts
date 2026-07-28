/**
 * ゲーム画面。詳細設計書 §8.3 〜 §8.6。
 */

import {
  COIN_R,
  DIFFICULTIES,
  FALL_ANIM,
  GIVEUP_CANCEL_R,
  GIVEUP_CENTER,
  GIVEUP_HOLD,
  GIVEUP_R,
  GIVEUP_RING_DELAY,
  GOAL_ANIM,
  GUIDE_IDLE_DELAY,
  INSERT_ANIM,
  LANES,
  COLORS,
  type DifficultyConfig,
  type Hole,
  type Vec2,
} from '../config.ts';
import { buildHoles } from '../game/board.ts';
import {
  canFlick,
  createCoin,
  flickCoin,
  placeOnLaneStart,
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
  drawBoardFrame,
  drawCabinet,
  drawCoin,
  drawPlunger,
  drawCoinSlot,
  drawGiveUpButton,
  drawGoalBasket,
  drawHandGuide,
  drawHole,
  drawEntryChute,
  drawInsertCoin,
  drawLane,
  drawLever,
  drawMountain,
  drawSideAnimals,
  drawSky,
  drawSunAndClouds,
} from '../render/drawings.ts';
import { clamp01, dist, easeOut, lerp, text, type Ctx } from '../render/shapes.ts';
import { stampIndexFor } from '../save.ts';
import type { GameParams, Outcome, PointerPhase, Scene, SceneContext } from './scene.ts';

type GamePhase = 'insert' | 'play' | 'ending';

/** 各穴のモグラの待機アニメ */
interface MoleState {
  timer: number;
  up: number;
  showing: boolean;
}

export class GameScene implements Scene {
  private difficulty: DifficultyConfig = DIFFICULTIES.easy;
  private phase: GamePhase = 'insert';
  private phaseTime = 0;
  private time = 0;

  private coin: Coin = createCoin();
  private holes: Hole[] = [];
  private plunger: PlungerState = createPlunger();
  private levers: LeverState[] = createLevers();
  private moles: MoleState[] = [];

  private reachedLane = 1;
  private outcome: Outcome | null = null;
  private endingTimer = 0;

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
    this.holes = buildHoles(this.difficulty);
    this.moles = this.holes.map(() => ({
      timer: Math.random() * 4 + 1,
      up: 0,
      showing: false,
    }));

    this.phase = 'insert';
    this.phaseTime = 0;
    this.time = 0;
    this.coin = createCoin();
    this.plunger = createPlunger();
    this.levers = createLevers();
    this.reachedLane = 1;
    this.outcome = null;
    this.endingTimer = 0;
    this.giveUpHold = 0;
    this.giveUpPointerId = null;
  }

  exit(): void {
    releasePlunger(this.plunger);
  }

  // ------------------------------------------------------------ 更新

  update(dt: number): void {
    this.time += dt;
    this.phaseTime += dt;
    this.updateMoles(dt);
    updatePlunger(this.plunger, dt);
    if (this.coin.state === 'goal') this.flagWave += dt;

    switch (this.phase) {
      case 'insert':
        if (this.phaseTime >= INSERT_ANIM) {
          placeOnLaneStart(this.coin);
          this.phase = 'play';
          this.phaseTime = 0;
        }
        break;

      case 'play':
        this.updatePlay(dt);
        break;

      case 'ending':
        stepCoin(this.coin, dt, this.difficulty, this.holes);
        this.endingTimer -= dt;
        if (this.endingTimer <= 0) this.finish();
        break;
    }
  }

  private updatePlay(dt: number): void {
    const st = this.plunger;

    // あきらめる長押し
    if (this.giveUpPointerId !== null) {
      this.giveUpHold += dt;
      if (this.giveUpHold >= GIVEUP_HOLD) {
        this.giveUpPointerId = null;
        this.beginEnding('giveup');
        return;
      }
    }

    updateLevers(this.levers, dt, st.grabbed ? st.pull : st.visualPull);

    const r = stepCoin(this.coin, dt, this.difficulty, this.holes);

    if (this.coin.state === 'onLane') {
      this.reachedLane = Math.max(this.reachedLane, this.coin.laneIndex + 1);
    }
    if (r.hitHole) {
      this.beginEnding('hole');
      return;
    }
    if (r.reachedGoal) {
      this.reachedLane = LANES.length;
      this.beginEnding('goal');
      return;
    }
  }

  private updateMoles(dt: number): void {
    for (const m of this.moles) {
      m.timer -= dt;
      if (m.timer <= 0) {
        m.showing = !m.showing;
        m.timer = m.showing ? 0.9 + Math.random() * 0.8 : 2.5 + Math.random() * 4;
      }
      const target = m.showing ? 1 : 0;
      m.up += (target - m.up) * Math.min(1, dt * 7);
    }
  }

  private beginEnding(outcome: Outcome): void {
    this.outcome = outcome;
    this.phase = 'ending';
    this.phaseTime = 0;
    releasePlunger(this.plunger);
    this.endingTimer = outcome === 'hole' ? FALL_ANIM : outcome === 'goal' ? GOAL_ANIM : 0;
  }

  private finish(): void {
    const outcome = this.outcome ?? 'giveup';
    let newStampIndex: number | null = null;

    if (outcome === 'goal') {
      const nth = this.app.save.stampCount + 1;
      newStampIndex = stampIndexFor(nth);
      // リザルトに入る瞬間に保存する。演出中にリロードされても記録が残る
      this.app.commitSave({ stampCount: nth });
    }

    this.app.goTo('result', {
      outcome,
      reachedLane: this.reachedLane,
      difficulty: this.difficulty,
      newStampIndex,
    });
  }

  // ------------------------------------------------------------ 入力

  onPointer(phase: PointerPhase, p: Vec2, pointerId: number, ev: PointerEvent): void {
    if (this.phase !== 'play') return;

    switch (phase) {
      case 'down': {
        if (dist(p, GIVEUP_CENTER) <= GIVEUP_R && this.giveUpPointerId === null) {
          this.giveUpPointerId = pointerId;
          this.giveUpHold = 0;
          try {
            this.app.canvas.setPointerCapture(pointerId);
          } catch {
            /* 一部環境では失敗しうる。捕捉できなくても動作は続く */
          }
          return;
        }
        if (this.plunger.cooldown > 0) return;
        if (plungerPointerDown(this.plunger, p, pointerId)) {
          try {
            this.app.canvas.setPointerCapture(pointerId);
          } catch {
            /* 同上 */
          }
        }
        break;
      }

      case 'move': {
        if (pointerId === this.giveUpPointerId) {
          // 指がボタンから大きく離れたらキャンセル
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
        // 操作が無かったことにならないようにするため(詳細設計書 §6.1)
        const power = plungerPointerUp(this.plunger);
        if (power !== null) {
          triggerLevers(this.levers);
          const lane = this.coin.laneIndex;
          if (canFlick(this.coin, lane)) flickCoin(this.coin, power);
        }
        void ev;
        break;
      }
    }
  }

  // ------------------------------------------------------------ 描画

  render(ctx: Ctx): void {
    drawSky(ctx);
    drawSunAndClouds(ctx, this.time);

    drawMountain(ctx);
    drawSideAnimals(ctx, this.time);

    drawEntryChute(ctx);
    for (const lane of LANES) drawLane(ctx, lane);
    this.holes.forEach((h, i) => drawHole(ctx, h, this.moles[i]?.up ?? 0));
    drawGoalBasket(ctx, this.difficulty, this.flagWave);

    for (const lane of LANES) drawLever(ctx, lane, this.levers[lane.index]?.swing ?? 0);

    drawBoardFrame(ctx);
    drawCabinet(ctx);

    this.renderCoin(ctx);

    drawCoinSlot(ctx);
    const tubeT = this.insertTubeT();
    if (tubeT !== null) drawInsertCoin(ctx, tubeT);

    drawPlunger(ctx, this.plunger.knobY, this.plunger.grabbed ? this.plunger.pull : this.plunger.visualPull);

    drawGiveUpButton(ctx, this.giveUpRingProgress());

    if (this.shouldShowGuide()) {
      const phase = ((this.time * (1 / 1.2)) % 1 + 1) % 1;
      drawHandGuide(ctx, this.plunger.knobY, phase);
    }

    if (this.debug) this.renderDebug(ctx);
  }

  private renderCoin(ctx: Ctx): void {
    if (this.phase === 'insert') return; // 投入中はチューブ側で描く

    const c = this.coin;
    if (c.state === 'falling') {
      const t = clamp01(c.timer / FALL_ANIM);
      const target = c.holeCenter ?? c.pos;
      const pos: Vec2 = {
        x: lerp(c.pos.x, target.x, easeOut(t)),
        y: lerp(c.pos.y, target.y + 10, easeOut(t)),
      };
      const r = COIN_R * (1 - easeOut(t) * 0.85);
      ctx.save();
      ctx.globalAlpha = 1 - t * 0.5;
      drawCoin(ctx, pos, Math.max(1, r), 0, c.spin);
      ctx.restore();
      return;
    }

    if (c.state === 'goal') {
      const t = clamp01(c.timer / 0.5);
      const bounce = Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t) * 16;
      drawCoin(ctx, { x: c.pos.x, y: c.pos.y - bounce }, COIN_R, 0, c.spin);
      return;
    }

    drawCoin(ctx, c.pos, COIN_R, 0, c.spin);
  }

  private insertTubeT(): number | null {
    if (this.phase !== 'insert') return null;
    return clamp01(this.phaseTime / INSERT_ANIM);
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
      this.coin.state === 'onLane' &&
      Math.abs(this.coin.vs) < 5 &&
      canFlick(this.coin, this.coin.laneIndex)
    );
  }

  private renderDebug(ctx: Ctx): void {
    const c = this.coin;
    const lines = [
      `phase=${this.phase} state=${c.state}`,
      `lane=${c.laneIndex + 1} s=${c.s.toFixed(3)} vs=${c.vs.toFixed(0)}`,
      `pull=${this.plunger.pull.toFixed(3)} reached=${this.reachedLane}`,
      `diff=${this.difficulty.id}`,
    ];
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(180, 20, 400, 20 + lines.length * 26);
    ctx.restore();
    lines.forEach((l, i) =>
      text(ctx, l, 192, 44 + i * 26, { size: 20, color: COLORS.ink, align: 'left', weight: '600' }),
    );
  }
}
