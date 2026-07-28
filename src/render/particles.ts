/**
 * パーティクル。紙吹雪(あたり)、土煙(着地)、火花(板の端にぶつかった時)。
 * すべてコード描画で、上限を設けて低スペック端末でも fps が落ちないようにする。
 */

import { LOGICAL_H, type Vec2 } from '../config.ts';
import type { Ctx } from './shapes.ts';

type Kind = 'confetti' | 'puff' | 'star';

export interface Particle {
  kind: Kind;
  pos: Vec2;
  vel: Vec2;
  rot: number;
  rotVel: number;
  w: number;
  h: number;
  color: string;
  life: number;
  /** これを超えたら消える (s)。confetti は画面外に出るまで */
  ttl: number;
  wobble: number;
}

const GRAVITY = 600;
/** 低スペック端末での fps 低下を防ぐための上限 */
const MAX_PARTICLES = 300;

const CONFETTI_COLORS = ['#FF8A3D', '#E8503A', '#F5C242', '#6FCF97', '#56A8F5', '#C77DFF'];

export class ParticleSystem {
  private items: Particle[] = [];

  get count(): number {
    return this.items.length;
  }

  private push(p: Particle): void {
    this.items.push(p);
    if (this.items.length > MAX_PARTICLES) {
      this.items.splice(0, this.items.length - MAX_PARTICLES);
    }
  }

  emitConfetti(origin: Vec2, count: number, spreadX = 360): void {
    for (let i = 0; i < count; i++) {
      this.push({
        kind: 'confetti',
        pos: { x: origin.x + (Math.random() - 0.5) * spreadX, y: origin.y + Math.random() * 40 },
        vel: { x: (Math.random() - 0.5) * 140, y: 60 + Math.random() * 180 },
        rot: Math.random() * Math.PI * 2,
        rotVel: (Math.random() - 0.5) * 9,
        w: 11 + Math.random() * 10,
        h: 16 + Math.random() * 12,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]!,
        life: 0,
        ttl: Infinity,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  /** 着地の土煙。左右にふわっと広がって消える */
  emitPuff(origin: Vec2, count = 6): void {
    for (let i = 0; i < count; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.push({
        kind: 'puff',
        pos: { x: origin.x + dir * (6 + Math.random() * 10), y: origin.y + 4 },
        vel: { x: dir * (40 + Math.random() * 90), y: -(20 + Math.random() * 50) },
        rot: 0,
        rotVel: 0,
        w: 7 + Math.random() * 8,
        h: 0,
        color: 'rgba(214,190,150,0.85)',
        life: 0,
        ttl: 0.35 + Math.random() * 0.2,
        wobble: 0,
      });
    }
  }

  /** ぶつかった・弾いた瞬間の小さな星 */
  emitStars(origin: Vec2, count = 5, color = '#FFE066'): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 180;
      this.push({
        kind: 'star',
        pos: { x: origin.x, y: origin.y },
        vel: { x: Math.cos(a) * sp, y: Math.sin(a) * sp - 60 },
        rot: Math.random() * Math.PI,
        rotVel: (Math.random() - 0.5) * 12,
        w: 6 + Math.random() * 7,
        h: 0,
        color,
        life: 0,
        ttl: 0.3 + Math.random() * 0.15,
        wobble: 0,
      });
    }
  }

  update(dt: number): void {
    for (const p of this.items) {
      p.life += dt;
      p.wobble += dt * 5;
      if (p.kind === 'confetti') {
        p.vel.y += GRAVITY * dt;
        p.pos.x += (p.vel.x + Math.sin(p.wobble) * 60) * dt;
      } else {
        // 土煙・星は軽いので減速しながら漂う
        p.vel.x *= 1 - 3.5 * dt;
        p.vel.y += (p.kind === 'star' ? 500 : -60) * dt;
        p.pos.x += p.vel.x * dt;
      }
      p.pos.y += p.vel.y * dt;
      p.rot += p.rotVel * dt;
    }
    this.items = this.items.filter((p) => p.pos.y < LOGICAL_H + 40 && p.life < p.ttl);
  }

  render(ctx: Ctx): void {
    for (const p of this.items) {
      const k = p.ttl === Infinity ? 0 : p.life / p.ttl;
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      switch (p.kind) {
        case 'confetti': {
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          // 回転で厚みが変わって見えるように横幅を揺らす
          const sx = Math.abs(Math.cos(p.wobble * 0.7));
          ctx.fillRect((-p.w * sx) / 2, -p.h / 2, Math.max(2, p.w * sx), p.h);
          break;
        }
        case 'puff': {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.w * (1 + k * 1.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'star': {
          ctx.globalAlpha = 1 - k;
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          const r = p.w * (1 - k * 0.5);
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const rr = i % 2 === 0 ? r : r * 0.42;
            const a = (i / 8) * Math.PI * 2;
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
          break;
        }
      }
      ctx.restore();
    }
  }

  clear(): void {
    this.items = [];
  }
}
