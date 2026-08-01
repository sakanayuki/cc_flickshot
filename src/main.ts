/**
 * 起動、シーンマシン、メインループ。
 */

import { COLORS, FIXED_DT, MAX_FRAME_TIME } from './config.ts';
import { applyTransform, clearFull, resizeCanvas, toLogical, type Viewport } from './render/layout.ts';
import { loadSave, saveSave, type SaveData } from './save.ts';
import { GameScene } from './scenes/game.ts';
import { ResultScene } from './scenes/result.ts';
import type { PointerPhase, Scene, SceneContext, SceneId } from './scenes/scene.ts';
import { TitleScene } from './scenes/title.ts';

/**
 * 起動に失敗したら画面に理由を出す。
 *
 * これがないと、JS が読み込めなかったときに body の背景色だけが見える
 * 「真っ青な画面」になり、端末側では原因がまったく分からない。
 */
function showFatal(message: string): void {
  const el = document.createElement('div');
  el.setAttribute(
    'style',
    'position:fixed;inset:0;padding:24px;background:#0B0D12;color:#E9EEF7;' +
      'font:16px/1.6 system-ui,sans-serif;overflow:auto;white-space:pre-wrap;z-index:9999',
  );
  el.textContent = 'ゲームを開始できませんでした。\n\n' + message;
  document.body.appendChild(el);
}

window.addEventListener('error', (e) => showFatal(String(e.message ?? e.error)));
window.addEventListener('unhandledrejection', (e) => showFatal(String(e.reason)));

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
// 現在のシーンを DOM に出す。自動テストから遷移を観測するためだけのもの
document.body.dataset.scene = 'title';

function applyPendingTransition(): void {
  if (!pending) return;
  const { id, params } = pending;
  pending = null;
  current.exit();
  current = scenes[id];
  current.enter(params);
  document.body.dataset.scene = id;
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
  // 発射扱いにする(iOS のシステムジェスチャに割り込まれても操作を無かったことにしない)
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

let crashed = false;

function frame(nowMs: number): void {
  if (crashed) return;
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

  try {
    clearFull(ctx!, viewport, COLORS.room);
    applyTransform(ctx!, viewport);
    current.render(ctx!);
  } catch (err) {
    // 描画で落ちるとループが止まり、塗りつぶした空色だけが残って
    // 「真っ青な画面」に見える。何が起きたか必ず表示する
    crashed = true;
    showFatal(err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err));
    return;
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
