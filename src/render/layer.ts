/**
 * 静的な絵をオフスクリーンに焼いて、毎フレームは 1 枚貼るだけにする。
 *
 * このゲームの重さは JavaScript ではなくラスタライズ側にある。
 * 実測で update + render の JS は 2.6ms しか使っていないのに 8fps しか出ず、
 * 原因は毎フレーム焼き直していた全画面グラデーション・影ぼかし・クリップだった。
 * 筐体・化粧板・レール・落とし口はどれも動かないので、1 度だけ描いて使い回す。
 *
 * 論理座標のまま描けるように、貼り付け先の変換行列から実ピクセル倍率を読み、
 * 同じ解像度でキャンバスを用意する。倍率が変わったとき(リサイズ・DPR 変化)は
 * 自動で焼き直す。
 */

import type { Ctx } from './shapes.ts';

export class Layer {
  private canvas: HTMLCanvasElement | null = null;
  private scale = 0;
  private w = 0;
  private h = 0;

  /** 中身が変わったので次のフレームで焼き直す */
  invalidate(): void {
    this.canvas = null;
  }

  /**
   * 論理サイズ w×h の絵を焼いて貼る。
   * `paint` は論理座標で描く(呼ばれるのは焼き直しのときだけ)。
   */
  draw(ctx: Ctx, w: number, h: number, paint: (c: Ctx) => void): void {
    const m = ctx.getTransform();
    const scale = Math.hypot(m.a, m.b);
    if (!Number.isFinite(scale) || scale <= 0) return;

    if (!this.canvas || this.w !== w || this.h !== h || Math.abs(this.scale - scale) > 1e-3) {
      const c = this.canvas ?? document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w * scale));
      c.height = Math.max(1, Math.ceil(h * scale));
      const lctx = c.getContext('2d');
      if (!lctx) return;
      lctx.setTransform(scale, 0, 0, scale, 0, 0);
      lctx.clearRect(0, 0, w, h);
      paint(lctx);
      this.canvas = c;
      this.scale = scale;
      this.w = w;
      this.h = h;
    }

    ctx.drawImage(this.canvas, 0, 0, w, h);
  }
}
