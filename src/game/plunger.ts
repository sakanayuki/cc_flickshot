/**
 * プランジャー(唯一の操作)。詳細設計書 §6。
 *
 * Canvas も DOM も参照しない。ポインタ座標は論理座標で受け取る。
 */

import {
  GRAB_ZONE,
  KNOB_RETURN,
  KNOB_REST,
  FLICK_COOLDOWN,
  P_MAX,
  P_MIN,
  PULL_DEADZONE,
  STROKE_FINGER,
  STROKE_KNOB,
  type Vec2,
} from '../config.ts';

export interface PlungerState {
  /** 0..1 */
  pull: number;
  /** 指を離したあとの戻り表示用。掴んでいる間は pull と一致する */
  visualPull: number;
  knobY: number;
  grabbed: boolean;
  /** 掴んだときのポインタ y(論理座標) */
  grabY: number;
  pointerId: number | null;
  /** 残りクールダウン秒 */
  cooldown: number;
  /** 最後の操作からの経過秒。操作ガイドの表示判定に使う */
  idleTime: number;
}

export function createPlunger(): PlungerState {
  return {
    pull: 0,
    visualPull: 0,
    knobY: KNOB_REST.y,
    grabbed: false,
    grabY: 0,
    pointerId: null,
    cooldown: 0,
    idleTime: 0,
  };
}

export function pullToPower(pull: number): number {
  return P_MIN + (P_MAX - P_MIN) * pull;
}

function inGrabZone(p: Vec2): boolean {
  return (
    p.x >= GRAB_ZONE.x &&
    p.x <= GRAB_ZONE.x + GRAB_ZONE.w &&
    p.y >= GRAB_ZONE.y &&
    p.y <= GRAB_ZONE.y + GRAB_ZONE.h
  );
}

/** 掴めたら true。呼び出し側は true のとき setPointerCapture すること。 */
export function plungerPointerDown(st: PlungerState, p: Vec2, pointerId: number): boolean {
  st.idleTime = 0;
  if (st.grabbed || st.cooldown > 0) return false;
  if (!inGrabZone(p)) return false;
  st.grabbed = true;
  st.grabY = p.y;
  st.pointerId = pointerId;
  st.pull = 0;
  return true;
}

/**
 * 下方向の変位だけを見る。横方向の移動は完全に無視する。
 * 3歳児のドラッグは大きく蛇行するため、これが「シビアな操作を減らす」要件の
 * 実装手段のひとつになっている(詳細設計書 §6.1)。
 */
export function plungerPointerMove(st: PlungerState, p: Vec2): void {
  if (!st.grabbed) return;
  st.idleTime = 0;
  const dy = p.y - st.grabY;
  st.pull = Math.max(0, Math.min(1, dy / STROKE_FINGER));
}

/**
 * 指を離した瞬間に発射。pointerup / pointercancel どちらでも呼ぶ。
 * 発射したら power を返す。引き量が極小なら null(誤タップで空撃ちしない)。
 */
export function plungerPointerUp(st: PlungerState): number | null {
  if (!st.grabbed) return null;
  const pull = st.pull;
  st.grabbed = false;
  st.pointerId = null;
  st.pull = 0;
  st.idleTime = 0;
  if (pull < PULL_DEADZONE) return null;
  st.cooldown = FLICK_COOLDOWN;
  return pullToPower(pull);
}

export function updatePlunger(st: PlungerState, dt: number): void {
  if (st.cooldown > 0) st.cooldown = Math.max(0, st.cooldown - dt);
  if (!st.grabbed) st.idleTime += dt;

  if (st.grabbed) {
    st.visualPull = st.pull;
  } else {
    // バネで戻る
    const step = dt / KNOB_RETURN;
    st.visualPull = Math.max(0, st.visualPull - step);
  }
  st.knobY = KNOB_REST.y + st.visualPull * STROKE_KNOB;
}

/** 掴んでいる最中に外部から中断する(シーン遷移など) */
export function releasePlunger(st: PlungerState): void {
  st.grabbed = false;
  st.pointerId = null;
  st.pull = 0;
}
