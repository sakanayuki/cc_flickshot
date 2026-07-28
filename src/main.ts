/**
 * 起動、シーンマシン、メインループ。詳細設計書 §1.2。
 */

import { COLORS, FIXED_DT, MAX_FRAME_TIME } from './config.ts';
import { applyTransform, clearFull, resizeCanvas, toLogical, type Viewport } from './render/layout.ts';
import { loadSave, saveSave, type SaveData } from './save.ts';
import { GameScene } from './scenes/game.ts';
import { ResultScene } from './scenes/result.ts';
import type { PointerPhase, Scene, SceneContext, SceneId } from './scenes/scene.ts';
import { TitleScene } from './scenes/title.ts';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('canvas#game が見つかりません');
const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) throw new Error('2D コンテキストを取得できません');

let viewport: Viewport = resizeCanvas(canvas);

const save: SaveData = loadSave();

/** 遷移は update の途中では行わず、次フレームの先頭で差し替える */
let pending: { id: SceneId; params: unknown } | null = null;

const app: SceneContext = {
  canvas,
  save,
  commitSave(next) {
    Object.assign(save, next);
    saveSave(save);
  },
  goTo(id, params) {
    pending = { id, params };
  },
};

const scenes: Record<SceneId, Scene> = {
  title: new TitleScene(app),
  game: new GameScene(app),
  result: new ResultScene(app),
};

let current: Scene = scenes.title;
current.enter(undefined);

function applyPendingTransition(): void {
  if (!pending) return;
  const { id, params } = pending;
  pending = null;
  current.exit();
  current = scenes[id];
  current.enter(params);
}

// ---------------------------------------------------------------- 入力

function forward(phase: PointerPhase, ev: PointerEvent): void {
  const p = toLogical(ev.clientX, ev.clientY, canvas!, viewport);
  current.onPointer(phase, p, ev.pointerId, ev);
}

canvas.addEventListener('pointerdown', (ev) => {
  ev.preventDefault();
  forward('down', ev);
});
canvas.addEventListener('pointermove', (ev) => forward('move', ev));
canvas.addEventListener('pointerup', (ev) => {
  forward('up', ev);
  if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
});
canvas.addEventListener('pointercancel', (ev) => {
  // 発射扱いにする。詳細設計書 §6.1
  forward('cancel', ev);
  if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
});
// iOS の長押しメニュー・右クリックメニューを抑止
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

function onResize(): void {
  viewport = resizeCanvas(canvas!);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// ---------------------------------------------------------------- ループ

let acc = 0;
let prev = performance.now() / 1000;

function frame(nowMs: number): void {
  const now = nowMs / 1000;
  // タブ復帰時に一気に進めてスパイラルしないよう頭打ちにする
  acc += Math.min(now - prev, MAX_FRAME_TIME);
  prev = now;

  applyPendingTransition();

  // 物理には常に固定 dt を渡す。可変 dt を渡すと挙動が端末依存になる
  while (acc >= FIXED_DT) {
    current.update(FIXED_DT);
    acc -= FIXED_DT;
    if (pending) {
      applyPendingTransition();
      acc = 0;
      break;
    }
  }

  clearFull(ctx!, viewport, COLORS.sky);
  applyTransform(ctx!, viewport);
  current.render(ctx!);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
