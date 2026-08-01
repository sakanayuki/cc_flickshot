/**
 * ゲーム画面。
 *
 * 進行の芯:
 *   投入 → 構え → プランジャーを引いて離す → レバーが蹴る → レーンを登る →
 *   手前の穴(弱すぎ)/ 隙間(1 段下へ)/ 奥の穴(強すぎ)
 * を 5 回。最後の隙間があたりの口につながっている。
 */

import {
  ANIMALS,
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  COIN_SLOT_CENTER,
  COIN_SLOT_SIZE,
  COLORS,
  GIVEUP_CANCEL_R,
  GIVEUP_CENTER,
  GIVEUP_HOLD,
  GUIDE_IDLE_DELAY,
  INSERT_ANIM,
  LOGICAL_W,
  LOGICAL_H,
  ROW_COUNT,
  ROW_GAP,
  type AnimalKind,
  type DifficultyConfig,
  type Vec2,
} from '../config.ts';
import {
  buildLanes,
  buildWinPocket,
  ENTRY_U,
  laneP,
  type Lane,
  type WinPocket,
} from '../game/board.ts';
import {
  canFlick,
  createCoin,
  depthOf,
  flickCoin,
  resetToEntry,
  stepCoin,
  type CoinState,
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
  drawBezel,
  drawCoinSlot,
  drawControlDeck,
  drawDepthMarks,
  drawGlass,
  drawRoom,
  drawShell,
} from '../render/cabinet.ts';
import {
  drawGiveUp,
  drawLastShot,
  drawMeterFrame,
  drawPlunger,
  drawPowerMeter,
  drawPullGuide,
  type ShotKind,
  type ShotMark,
} from '../render/hud.ts';
import { Layer } from '../render/layer.ts';
import { ParticleSystem } from '../render/particles.ts';
import {
  drawChute,
  drawCoin,
  drawEntryChute,
  drawField,
  drawGapChevrons,
  drawLever,
  drawLeverKnob,
  drawPitLip,
  drawPits,
  drawRail,
  drawWinPocket,
} from '../render/playfield.ts';
import {
  alpha,
  clamp01,
  dist,
  easeInOut,
  roundRect,
  text,
  withClip,
  type Ctx,
} from '../render/shapes.ts';
import { stampIndexFor } from '../save.ts';
import type { GameParams, Outcome, PointerPhase, Scene, SceneContext } from './scene.ts';

type Phase = 'insert' | 'play' | 'ending';

/** 過去のショットの跡をいくつまで残すか */
const MARK_HISTORY = 8;
/** 穴に沈む演出の長さ。coin.timer(FALL_ANIM)と揃える */
const SINK_TIME = 0.9;
/** 操作部のまん中の列。メーターとプランジャーのあいだ */
const DECK_COL = 300;

export class GameScene implements Scene {
  private difficulty: DifficultyConfig = { id: 'easy', label: '', tag: '', nearHoleSpan: 0 };
  private lanes: Lane[] = [];
  private pocket: WinPocket = { center: { x: 0, y: 0 }, w: 0, h: 0 };
  private coin: CoinState | null = null;
  private levers: LeverState[] = createLevers();
  private plunger: PlungerState = createPlunger();
  private particles = new ParticleSystem();
  /** 動かない絵は 1 枚にまとめて焼く。難易度で盤面が変わるので enter で捨てる */
  private bg = new Layer();

  private time = 0;
  private phase: Phase = 'insert';
  private insertT = 0;
  private animal: AnimalKind = 'usagi';

  private marks: ShotMark[] = [];
  private lastShot: ShotMark | null = null;
  /** 発射してから結果が出るまでのあいだ、その引き量を覚えておく */
  private pendingPull: number | null = null;

  private outcome: Outcome | null = null;

  private giveUpHold = 0;
  private giveUpPointer: number | null = null;

  constructor(private app: SceneContext) {}

  enter(params: unknown): void {
    const p = params as GameParams | undefined;
    if (p?.difficulty) this.difficulty = p.difficulty;
    this.lanes = buildLanes(this.difficulty);
    this.pocket = buildWinPocket(this.lanes);
    this.coin = createCoin(this.lanes, this.pocket);
    resetToEntry(this.coin);
    this.levers = createLevers();
    this.plunger = createPlunger();
    this.particles.clear();
    this.bg.invalidate();
    this.time = 0;
    this.phase = 'insert';
    this.insertT = 0;
    this.marks = [];
    this.lastShot = null;
    this.pendingPull = null;
    this.outcome = null;
    this.giveUpHold = 0;
    this.giveUpPointer = null;
    // 次にもらえるスタンプのどうぶつを、そのままコインの意匠にする
    this.animal = ANIMALS[stampIndexFor(this.app.save.stampCount + 1)]!;
  }

  exit(): void {
    releasePlunger(this.plunger);
    // 焼いた絵は数十 MB になる。使わないシーンで抱えたままにしない
    this.bg.invalidate();
  }

  // ---------------------------------------------------------------- 更新

  update(dt: number): void {
    this.time += dt;
    this.particles.update(dt);
    updatePlunger(this.plunger, dt);
    updateLevers(this.levers, dt, this.plunger.grabbed ? this.plunger.pull : 0);

    if (this.giveUpPointer !== null) {
      this.giveUpHold += dt;
      if (this.giveUpHold >= GIVEUP_HOLD) {
        this.giveUpPointer = null;
        this.finish('giveup');
        return;
      }
    }

    if (this.phase === 'insert') {
      this.insertT += dt;
      if (this.insertT >= INSERT_ANIM) this.phase = 'play';
      return;
    }

    const coin = this.coin;
    if (!coin) return;

    const r = stepCoin(coin, dt);

    if (r.droppedThrough) this.record('good');
    else if (r.lost) this.record(r.lost === 'weak' ? 'weak' : 'strong');
    else if (r.becameReady) this.pendingPull = null;

    if (r.landed) this.particles.emitPuff(coin.pos, 7);
    if (r.lost) this.particles.emitPuff(coin.pos, 5);
    if (r.won) {
      this.particles.emitConfetti(
        { x: this.pocket.center.x, y: this.pocket.center.y - 80 },
        60,
        220,
      );
    }

    if (this.phase === 'play' && (r.lost || r.won)) {
      this.phase = 'ending';
      this.outcome = r.won ? 'win' : 'hole';
    }
    if (this.phase === 'ending' && r.finished) this.finish(this.outcome ?? 'hole');
  }

  private record(kind: ShotKind): void {
    const pull = this.pendingPull;
    this.pendingPull = null;
    if (pull === null) return;
    const mark: ShotMark = { pull, kind };
    this.lastShot = mark;
    this.marks.push(mark);
    if (this.marks.length > MARK_HISTORY) this.marks.shift();
  }

  private finish(outcome: Outcome): void {
    const coin = this.coin;
    let newStampIndex: number | null = null;
    if (outcome === 'win') {
      const count = this.app.save.stampCount + 1;
      newStampIndex = stampIndexFor(count);
      this.app.commitSave({ stampCount: count });
    }
    this.app.goTo('result', {
      outcome,
      reachedDepth: coin ? depthOf(coin) : 1,
      difficulty: this.difficulty,
      newStampIndex,
      lastShot: this.lastShot?.kind ?? null,
      lastPull: this.lastShot?.pull ?? null,
    });
  }

  // ---------------------------------------------------------------- 入力

  onPointer(phase: PointerPhase, p: Vec2, pointerId: number, ev: PointerEvent): void {
    // あきらめるの長押しが最優先。掴んでいるあいだプランジャーには渡さない
    if (phase === 'down' && dist(p, GIVEUP_CENTER) <= GIVEUP_CANCEL_R) {
      this.giveUpPointer = pointerId;
      this.giveUpHold = 0;
      return;
    }
    if (this.giveUpPointer === pointerId) {
      const away = phase === 'move' && dist(p, GIVEUP_CENTER) > GIVEUP_CANCEL_R;
      if (away || phase === 'up' || phase === 'cancel') {
        this.giveUpPointer = null;
        this.giveUpHold = 0;
      }
      return;
    }

    if (this.phase !== 'play') return;

    switch (phase) {
      case 'down':
        if (plungerPointerDown(this.plunger, p, pointerId)) {
          this.app.canvas.setPointerCapture(ev.pointerId);
        }
        break;
      case 'move':
        plungerPointerMove(this.plunger, p);
        break;
      case 'up':
      case 'cancel': {
        const pull = this.plunger.pull;
        const power = plungerPointerUp(this.plunger);
        if (power !== null) this.fire(power, pull);
        break;
      }
    }
  }

  private fire(power: number, pull: number): void {
    const coin = this.coin;
    if (!coin || !canFlick(coin)) return;
    const lane = this.lanes[coin.laneIndex]!;
    flickCoin(coin, power);
    triggerLevers(this.levers);
    this.pendingPull = pull;
    this.particles.emitStars(laneP(lane, COIN_R, COIN_R), 7, COLORS.accent);
  }

  // ---------------------------------------------------------------- 描画

  render(ctx: Ctx): void {
    const coin = this.coin;

    // 動かないものは 1 枚に焼いてある。毎フレームは貼るだけ
    this.bg.draw(ctx, LOGICAL_W, LOGICAL_H, (c) => this.paintStatic(c));

    /*
     * 動くものはまとめてガラス窓の中に閉じる。
     * ベゼルは焼いた 1 枚に入っているので、クリップしないと
     * レバーのケースや紙吹雪がその上にはみ出す。
     */
    withClip(
      ctx,
      () =>
        roundRect(
          ctx,
          BOARD_LEFT,
          BOARD_TOP,
          BOARD_RIGHT - BOARD_LEFT,
          BOARD_BOTTOM - BOARD_TOP,
          12,
        ),
      () => {
        for (const lane of this.lanes) drawGapChevrons(ctx, lane, this.time);
        for (const lane of this.lanes) {
          const lv = this.levers[lane.index]!;
          drawLever(ctx, lane, lv.swing, lv.flash);
        }
        if (coin) this.renderCoin(ctx, coin);
        this.particles.render(ctx);
      },
    );

    drawDepthMarks(ctx, coin ? depthOf(coin) : 0);
    for (const lane of this.lanes) drawLeverKnob(ctx, lane, this.levers[lane.index]!.swing);
    drawGiveUp(ctx, clamp01(this.giveUpHold / GIVEUP_HOLD));
    this.renderHeader(ctx);

    drawPowerMeter(
      ctx,
      this.plunger.grabbed ? this.plunger.pull : this.plunger.visualPull,
      this.marks,
    );
    drawPlunger(ctx, this.plunger.knobY, this.plunger.cooldown);
    this.renderDeck(ctx);

    if (this.phase === 'play' && this.plunger.idleTime > GUIDE_IDLE_DELAY && !this.plunger.grabbed) {
      drawPullGuide(ctx, this.plunger.knobY, this.time);
    }
  }

  /** 焼いておく背景。筐体・化粧板・落とし口・レール・操作部の台 */
  private paintStatic(c: Ctx): void {
    drawRoom(c);
    drawShell(c);
    drawField(c);
    for (const lane of this.lanes) {
      const drop = lane.index < ROW_COUNT - 1 ? ROW_GAP : BOARD_BOTTOM - lane.low.y;
      drawChute(c, lane, drop);
    }
    drawWinPocket(c, this.pocket);
    drawEntryChute(c, this.lanes[0]!, ENTRY_U, COIN_SLOT_CENTER);
    for (const lane of this.lanes) {
      drawPits(c, lane);
      drawRail(c, lane);
    }
    // ガラスとベゼルも同じ 1 枚に含める。全画面の合成は 1 回で済ませたい
    drawGlass(c);
    drawBezel(c);
    drawCoinSlot(c, COIN_SLOT_CENTER, COIN_SLOT_SIZE.w, COIN_SLOT_SIZE.h);
    drawControlDeck(c);
    drawMeterFrame(c);
  }

  private renderHeader(ctx: Ctx): void {
    text(ctx, this.difficulty.label, LOGICAL_W / 2, BOARD_TOP + 30, {
      size: 20,
      color: COLORS.textDim,
      weight: '800',
    });
    text(ctx, this.difficulty.tag, LOGICAL_W / 2, BOARD_TOP + 54, {
      size: 12,
      color: alpha(COLORS.accent, 0.6),
      weight: '700',
      tracking: 4,
    });
  }

  /** 操作部の文字。台の上に載るので drawControlDeck のあとに描く */
  private renderDeck(ctx: Ctx): void {
    const depth = this.coin ? depthOf(this.coin) : 1;
    text(ctx, 'いま', DECK_COL, BOARD_BOTTOM + 52, {
      size: 13,
      color: COLORS.textDim,
      weight: '700',
    });
    text(ctx, `${depth} / ${ROW_COUNT}`, DECK_COL, BOARD_BOTTOM + 88, {
      size: 40,
      color: COLORS.text,
      weight: '900',
    });
    text(ctx, 'だんめ', DECK_COL, BOARD_BOTTOM + 118, {
      size: 13,
      color: COLORS.textDim,
      weight: '700',
    });
    drawLastShot(ctx, this.lastShot, { x: DECK_COL, y: BOARD_BOTTOM + 168 });
  }

  private renderCoin(ctx: Ctx, coin: CoinState): void {
    if (this.phase === 'insert') {
      const t = easeInOut(clamp01(this.insertT / INSERT_ANIM));
      const from = COIN_SLOT_CENTER;
      const to = laneP(this.lanes[0]!, ENTRY_U, COIN_R);
      const pos: Vec2 = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t * t,
      };
      drawCoin(ctx, { pos, spin: t * 9, animal: this.animal, sink: 0, vel: { x: 0, y: 0 } });
      return;
    }

    const sink = coin.phase === 'lost' ? clamp01(1 - coin.timer / SINK_TIME) : 0;
    const at = coin.lostAt;
    const pos: Vec2 =
      at && sink > 0
        ? {
            x: coin.pos.x + (at.x - coin.pos.x) * sink,
            y: coin.pos.y + (at.y - coin.pos.y) * sink + sink * 20,
          }
        : coin.pos;

    drawCoin(ctx, { pos, spin: coin.spin, animal: this.animal, sink, vel: coin.vel });

    // 落ちた穴の手前側の縁をコインの上に重ね、穴に入っていくように見せる
    if (coin.phase === 'lost' && at) drawPitLip(ctx, at, COLORS.holeRim);
  }
}
