/**
 * 紙吹雪。詳細設計書 §8.4。
 */

import { LOGICAL_H, type Vec2 } from '../config.ts';
import type { Ctx } from './shapes.ts';

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  rot: number;
  rotVel: number;
  w: number;
  h: number;
  color: string;
  life: number;
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

  emitConfetti(origin: Vec2, count: number, spreadX = 360): void {
    for (let i = 0; i < count; i++) {
      this.items.push({
        pos: { x: origin.x + (Math.random() - 0.5) * spreadX, y: origin.y + Math.random() * 40 },
        vel: { x: (Math.random() - 0.5) * 140, y: 60 + Math.random() * 180 },
        rot: Math.random() * Math.PI * 2,
        rotVel: (Math.random() - 0.5) * 9,
        w: 11 + Math.random() * 10,
        h: 16 + Math.random() * 12,
        color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0]!,
        life: 0,
        wobble: Math.random() * Math.PI * 2,
      });
    }
    // 古いものから捨てる
    if (this.items.length > MAX_PARTICLES) {
      this.items.splice(0, this.items.length - MAX_PARTICLES);
    }
  }

  update(dt: number): void {
    for (const p of this.items) {
      p.life += dt;
      p.wobble += dt * 5;
      p.vel.y += GRAVITY * dt;
      p.pos.x += (p.vel.x + Math.sin(p.wobble) * 60) * dt;
      p.pos.y += p.vel.y * dt;
      p.rot += p.rotVel * dt;
    }
    this.items = this.items.filter((p) => p.pos.y < LOGICAL_H + 40);
  }

  render(ctx: Ctx): void {
    for (const p of this.items) {
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      // 回転で厚みが変わって見えるように横幅を揺らす
      const sx = Math.abs(Math.cos(p.wobble * 0.7));
      ctx.fillRect((-p.w * sx) / 2, -p.h / 2, Math.max(2, p.w * sx), p.h);
      ctx.restore();
    }
  }

  clear(): void {
    this.items = [];
  }
}
