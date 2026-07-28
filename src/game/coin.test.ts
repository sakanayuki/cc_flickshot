/**
 * 物理と判定のテスト。詳細設計書 §13.2 〜 §13.4。
 *
 * §13.4 は本ゲームの生命線。座標や物理定数を変更したときに
 * 「5段すべてで同じ閾値が成立する」という均一性(§3.1)が壊れたことを
 * 検知できる唯一の仕組みなので、消してはならない。
 */

import { describe, expect, it } from 'vitest';
import {
  BOARD_BOTTOM,
  BOARD_LEFT,
  BOARD_RIGHT,
  BOARD_TOP,
  COIN_R,
  DIFFICULTIES,
  FIXED_DT,
  LANES,
  LANE_ANGLE,
  P_MAX,
  P_MIN,
  type DifficultyConfig,
} from '../config.ts';
import { buildHoles } from './board.ts';
import {
  canFlick,
  checkHole,
  createCoin,
  flickCoin,
  placeOnLane,
  placeOnLaneStart,
  stepCoin,
  type Coin,
} from './coin.ts';

const EASY = DIFFICULTIES.easy;
const NORMAL = DIFFICULTIES.normal;

/** 穴のない盤面。弾道だけを見たいときに使う */
const NO_HOLES: DifficultyConfig = { ...EASY, holeS: [[], [], [], [], []] };

interface SimResult {
  coin: Coin;
  landedOn: number | null;
  reachedGoal: boolean;
  hitHole: boolean;
  steps: number;
}

/** レバー端に置いたコインを power で弾き、着地するまで進める */
function simulateFlick(
  laneIndex: number,
  power: number,
  d: DifficultyConfig,
  maxSeconds = 10,
): SimResult {
  const coin = createCoin();
  placeOnLane(coin, laneIndex, 1);
  const holes = buildHoles(d);
  expect(flickCoin(coin, power)).toBe(true);

  let landedOn: number | null = null;
  let reachedGoal = false;
  let hitHole = false;
  const maxSteps = Math.round(maxSeconds / FIXED_DT);
  let steps = 0;

  for (; steps < maxSteps; steps++) {
    const r = stepCoin(coin, FIXED_DT, d, holes);
    if (r.reachedGoal) {
      reachedGoal = true;
      break;
    }
    if (r.hitHole) {
      hitHole = true;
      break;
    }
    if (r.landedOnLane !== null && landedOn === null) {
      landedOn = r.landedOnLane;
      break;
    }
  }
  return { coin, landedOn, reachedGoal, hitHole, steps };
}

/** コインが盤面内に留まっているか */
/**
 * レーンが傾いているぶん、レバー端に静止したコインの中心は
 * 法線方向に押し出されて壁より COIN_R*sin(傾き) だけ外へ出る。
 * その分だけ許容する。
 */
const EDGE_TOLERANCE = COIN_R * Math.sin(LANE_ANGLE) + 1;

function insideBoard(coin: Coin): boolean {
  return (
    coin.pos.x >= BOARD_LEFT - EDGE_TOLERANCE &&
    coin.pos.x <= BOARD_RIGHT + EDGE_TOLERANCE &&
    coin.pos.y >= BOARD_TOP - EDGE_TOLERANCE &&
    coin.pos.y <= BOARD_BOTTOM + EDGE_TOLERANCE
  );
}

// ---------------------------------------------------------------- §13.2

describe('穴の判定 (§13.2)', () => {
  const holes = buildHoles(EASY);
  const lane0Hole = holes.find((h) => h.laneIndex === 0)!;

  function coinAt(s: number, vs: number, laneIndex = 0): Coin {
    const c = createCoin();
    c.state = 'onLane';
    c.laneIndex = laneIndex;
    c.s = s;
    c.vs = vs;
    return c;
  }

  it('穴の中心・遅い → 落ちる', () => {
    expect(checkHole(coinAt(lane0Hole.s, 100), holes, EASY.fallSpeed)).not.toBeNull();
  });

  it('穴の中心・速い → 落ちない', () => {
    expect(checkHole(coinAt(lane0Hole.s, EASY.fallSpeed + 20), holes, EASY.fallSpeed)).toBeNull();
  });

  // 難易度差はこの閾値だけで作っている。同じ速度でも ふつう なら落ちる
  it('やさしいなら通過する速度でも、ふつうなら落ちる', () => {
    const between = (EASY.fallSpeed + NORMAL.fallSpeed) / 2;
    expect(checkHole(coinAt(lane0Hole.s, between), holes, EASY.fallSpeed)).toBeNull();
    expect(checkHole(coinAt(lane0Hole.s, between), holes, NORMAL.fallSpeed)).not.toBeNull();
  });

  it('穴の外 → 落ちない', () => {
    const outside = lane0Hole.s + (lane0Hole.radius + 1) / 451.77;
    expect(checkHole(coinAt(outside, 0), holes, EASY.fallSpeed)).toBeNull();
  });

  it('airborne は穴の上でも落ちない', () => {
    const c = coinAt(lane0Hole.s, 0);
    c.state = 'airborne';
    expect(checkHole(c, holes, EASY.fallSpeed)).toBeNull();
  });

  it('逆走中(vs が負)でも絶対値で判定する', () => {
    expect(checkHole(coinAt(lane0Hole.s, -100), holes, EASY.fallSpeed)).not.toBeNull();
  });

  it('別の段の穴には反応しない', () => {
    const only0 = buildHoles({ ...EASY, holeS: [[0.85], [], [], [], []] });
    expect(checkHole(coinAt(0.85, 0, 1), only0, EASY.fallSpeed)).toBeNull();
    expect(checkHole(coinAt(0.85, 0, 0), only0, EASY.fallSpeed)).not.toBeNull();
  });
});

// ---------------------------------------------------------------- §13.3

describe('弾きゾーン (§13.3)', () => {
  function coinAt(s: number, laneIndex = 0): Coin {
    const c = createCoin();
    c.state = 'onLane';
    c.laneIndex = laneIndex;
    c.s = s;
    return c;
  }

  it('s = 0.9 は弾ける', () => expect(canFlick(coinAt(0.9), 0)).toBe(true));
  it('s = 0.70 は弾ける(境界を含む)', () => expect(canFlick(coinAt(0.7), 0)).toBe(true));
  it('s = 1.0 は弾ける(境界を含む)', () => expect(canFlick(coinAt(1.0), 0)).toBe(true));
  it('s = 0.69 は弾けない', () => expect(canFlick(coinAt(0.69), 0)).toBe(false));
  it('別の段は弾けない', () => expect(canFlick(coinAt(0.9, 1), 0)).toBe(false));

  it('airborne は弾けない', () => {
    const c = coinAt(0.9);
    c.state = 'airborne';
    expect(canFlick(c, 0)).toBe(false);
    expect(flickCoin(c, 1200)).toBe(false);
  });

  it('ゾーン外では flickCoin が false を返し状態を変えない', () => {
    const c = coinAt(0.5);
    expect(flickCoin(c, 1200)).toBe(false);
    expect(c.state).toBe('onLane');
  });
});

// ---------------------------------------------------------------- §13.4

describe('弾道と着地 (§13.4)', () => {
  it('段1: 閾値 915 で段2に着地する', () => {
    const r = simulateFlick(0, 915, NO_HOLES);
    expect(r.landedOn).toBe(1);
  });

  it('段1: 900 では段2に届かず段1に戻る', () => {
    const r = simulateFlick(0, 900, NO_HOLES);
    expect(r.landedOn).toBe(0);
  });

  it('段1: 最大パワー 1700 でも失敗せず、段2以上に着地する', () => {
    const r = simulateFlick(0, 1700, NO_HOLES);
    expect(r.landedOn).not.toBeNull();
    expect(r.landedOn!).toBeGreaterThanOrEqual(1);
  });

  // これが §3.1「5つの跳躍の均一性」の回帰テスト
  it.each([0, 1, 2, 3])('段%i: 閾値 915 で必ず次の段に着地する(均一性)', (i) => {
    const r = simulateFlick(i, 915, NO_HOLES);
    expect(r.landedOn).toBe(i + 1);
  });

  it.each([0, 1, 2, 3])('段%i: 900 では次の段に届かない(均一性)', (i) => {
    const r = simulateFlick(i, 900, NO_HOLES);
    expect(r.landedOn).toBe(i);
  });

  it('段5: やさしい・power 1000 でゴールする', () => {
    const r = simulateFlick(4, 1000, { ...NO_HOLES, goalBasketLeft: EASY.goalBasketLeft });
    expect(r.reachedGoal).toBe(true);
  });

  it('段5: やさしい・最大パワーでもゴールする', () => {
    const r = simulateFlick(4, 1700, { ...NO_HOLES, goalBasketLeft: EASY.goalBasketLeft });
    expect(r.reachedGoal).toBe(true);
  });

  it('段5: ふつう・power 1600 はゴールを外して段5に戻る', () => {
    const d: DifficultyConfig = {
      ...NORMAL,
      holeS: [[], [], [], [], []],
      lipEscapeSpeed: null,
    };
    const r = simulateFlick(4, 1600, d);
    expect(r.reachedGoal).toBe(false);
    expect(r.landedOn).toBe(4);
  });

  it('段5: 弱すぎる弾きはゴールを外して段5に戻る(失敗にならない)', () => {
    const r = simulateFlick(4, 700, { ...NO_HOLES, goalBasketLeft: EASY.goalBasketLeft });
    expect(r.reachedGoal).toBe(false);
    expect(r.landedOn).toBe(4);
  });

  it('どのパワーでもコインは盤面の外に出ない', () => {
    for (let power = 620; power <= 1700; power += 20) {
      for (let lane = 0; lane < LANES.length; lane++) {
        const coin = createCoin();
        placeOnLane(coin, lane, 1);
        flickCoin(coin, power);
        for (let i = 0; i < 600; i++) {
          stepCoin(coin, FIXED_DT, NO_HOLES, []);
          if (!insideBoard(coin)) {
            throw new Error(
              `盤面外: lane=${lane} power=${power} step=${i} ` +
                `pos=(${coin.pos.x.toFixed(1)}, ${coin.pos.y.toFixed(1)})`,
            );
          }
        }
      }
    }
  });

  /**
   * これは弾き角(FLICK_ANGLE_DEG)を守るためのテスト。
   *
   * シャフトの上は「2段上のレーンの裏面」で塞がれているため、弾き角が浅いと
   * コインが次の段の先端を越える前に天井にぶつかって戻される。
   * 20 度では成功域がストロークの 2% しかなくなり、事実上プレイ不能になる。
   * 26 度で 73% に回復する。放物線の計算だけでは見えないので、実際に回して測る。
   */
  it.each([0, 1, 2, 3, 4])('段%i: 弾き力の 40%% 以上で前進できる(弾き角の回帰テスト)', (lane) => {
    let ok = 0;
    let total = 0;
    for (let power = P_MIN; power <= P_MAX; power += 10) {
      total++;
      const r = simulateFlick(lane, power, NO_HOLES);
      if (r.reachedGoal || (r.landedOn !== null && r.landedOn > lane)) ok++;
    }
    expect(ok / total).toBeGreaterThanOrEqual(0.4);
  });

  it('5段すべてで前進に必要な最小パワーが一致する(均一性)', () => {
    const thresholds = [0, 1, 2, 3, 4].map((lane) => {
      for (let power = P_MIN; power <= P_MAX; power += 5) {
        const r = simulateFlick(lane, power, NO_HOLES);
        if (r.reachedGoal || (r.landedOn !== null && r.landedOn > lane)) return power;
      }
      return -1;
    });
    expect(thresholds.every((t) => t > 0)).toBe(true);
    expect(Math.max(...thresholds) - Math.min(...thresholds)).toBeLessThanOrEqual(10);
  });

  it('必要な最小パワーは pull 0.35 以下に収まる(3歳児が届く)', () => {
    for (let power = P_MIN; power <= P_MAX; power += 5) {
      const r = simulateFlick(0, power, NO_HOLES);
      if (r.landedOn === 1) {
        expect((power - P_MIN) / (P_MAX - P_MIN)).toBeLessThanOrEqual(0.35);
        return;
      }
    }
    throw new Error('どのパワーでも段2に到達しない');
  });

  it('状態は常に 4 つのいずれかで、pos に NaN が入らない', () => {
    const holes = buildHoles(NORMAL);
    const coin = createCoin();
    placeOnLaneStart(coin);
    flickCoin(coin, 1200);
    const valid = new Set(['onLane', 'airborne', 'falling', 'goal']);
    for (let i = 0; i < 3000; i++) {
      stepCoin(coin, FIXED_DT, NORMAL, holes);
      expect(valid.has(coin.state)).toBe(true);
      expect(Number.isFinite(coin.pos.x)).toBe(true);
      expect(Number.isFinite(coin.pos.y)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- 転がり

describe('レーン上の転がり (§4.2)', () => {
  it('静止したコインは下り方向へ転がり、レバー端の壁で止まる', () => {
    const coin = createCoin();
    placeOnLaneStart(coin);
    for (let i = 0; i < 600; i++) stepCoin(coin, FIXED_DT, NO_HOLES, []);
    expect(coin.state).toBe('onLane');
    expect(coin.s).toBe(1);
    expect(coin.vs).toBe(0);
  });

  it('レバー端で止まったコインは弾ける', () => {
    const coin = createCoin();
    placeOnLaneStart(coin);
    for (let i = 0; i < 600; i++) stepCoin(coin, FIXED_DT, NO_HOLES, []);
    expect(canFlick(coin, 0)).toBe(true);
  });

  it('やさしい: 転落しない', () => {
    const d: DifficultyConfig = { ...EASY, holeS: [[], [], [], [], []] };
    const coin = createCoin();
    placeOnLane(coin, 2, 0);
    for (let i = 0; i < 600; i++) {
      const r = stepCoin(coin, FIXED_DT, d, []);
      expect(r.fellToLane).toBeNull();
    }
    expect(coin.laneIndex).toBe(2);
  });

  it('コインの中心はレーン表面から COIN_R だけ浮いている', () => {
    const coin = createCoin();
    placeOnLaneStart(coin);
    const lane = LANES[0]!;
    for (let i = 0; i < 120; i++) stepCoin(coin, FIXED_DT, NO_HOLES, []);
    // レーンに沿った直線からの距離が COIN_R であること
    const dx = lane.lo.x - lane.hi.x;
    const dy = lane.lo.y - lane.hi.y;
    const len = Math.hypot(dx, dy);
    const dist = Math.abs(
      ((coin.pos.x - lane.hi.x) * dy - (coin.pos.y - lane.hi.y) * dx) / len,
    );
    expect(dist).toBeCloseTo(COIN_R, 5);
  });
});

// ---------------------------------------------------------------- 実プレイの安全性

/**
 * 「盤面の数字は正しいのに遊べない」不具合を防ぐためのテスト。
 *
 * 実際にこの3つの不具合を作り込んでしまったので、そのまま回帰テストにしてある:
 *  - ふつうで、一度も弾く前にコインが段1の穴へ落ちる
 *  - ふつうで、ほどほどの強さで弾くたびに毎回1段下へ転落する
 *  - 弾きに成功したコインが穴に落ちる
 */
describe('実プレイの安全性', () => {
  /** 与えたシナリオで、穴の位置を通過するときの最も遅い速度 */
  function slowestAtHoles(setup: (c: Coin) => void, d: DifficultyConfig): number {
    const flat: DifficultyConfig = { ...d, holeS: [[], [], [], [], []], lipEscapeSpeed: null };
    const c = createCoin();
    setup(c);
    let slowest = Infinity;
    const holeS = d.holeS.flat();
    for (let i = 0; i < 900; i++) {
      stepCoin(c, FIXED_DT, flat, []);
      if (c.state !== 'onLane') continue;
      for (const hs of holeS) {
        if (Math.abs(c.s - hs) < 0.02) slowest = Math.min(slowest, Math.abs(c.vs));
      }
    }
    return slowest;
  }

  function fellALevel(power: number, d: DifficultyConfig): boolean {
    const flat: DifficultyConfig = { ...d, holeS: [[], [], [], [], []] };
    const c = createCoin();
    placeOnLane(c, 1, 1);
    flickCoin(c, power);
    for (let i = 0; i < 900; i++) {
      if (stepCoin(c, FIXED_DT, flat, []).fellToLane !== null) return true;
    }
    return false;
  }

  it.each([DIFFICULTIES.easy, DIFFICULTIES.normal])(
    '$label: 投入直後、一度も弾く前に穴へ落ちない',
    (d) => {
      const holes = buildHoles(d);
      const c = createCoin();
      placeOnLaneStart(c);
      for (let i = 0; i < 900; i++) {
        expect(stepCoin(c, FIXED_DT, d, holes).hitHole).toBeNull();
      }
    },
  );

  it.each([DIFFICULTIES.easy, DIFFICULTIES.normal])(
    '$label: 投入直後の転がりは落下閾値に 1 割以上の余裕がある',
    (d) => {
      expect(slowestAtHoles((c) => placeOnLaneStart(c), d)).toBeGreaterThan(d.fallSpeed * 1.1);
    },
  );

  it.each([DIFFICULTIES.easy, DIFFICULTIES.normal])(
    '$label: 弾きに成功したコインは穴を通過する',
    (d) => {
      const speed = slowestAtHoles((c) => {
        placeOnLane(c, 0, 1);
        flickCoin(c, 1100);
      }, d);
      expect(speed).toBeGreaterThan(d.fallSpeed);
    },
  );

  it('ふつう: 弱い弾きで戻ったコインは穴に落ちる(ここが難易度差)', () => {
    const speed = slowestAtHoles((c) => {
      placeOnLane(c, 0, 1);
      flickCoin(c, 800);
    }, NORMAL);
    expect(speed).toBeLessThan(NORMAL.fallSpeed);
  });

  it('やさしい: 弱い弾きで戻っても穴を通過する', () => {
    const speed = slowestAtHoles((c) => {
      placeOnLane(c, 0, 1);
      flickCoin(c, 800);
    }, EASY);
    expect(speed).toBeGreaterThan(EASY.fallSpeed);
  });

  it('ふつう: ほどほどの弾きでは転落しない', () => {
    expect(fellALevel(1200, NORMAL)).toBe(false);
  });

  it('ふつう: 引きすぎると転落する', () => {
    expect(fellALevel(P_MAX, NORMAL)).toBe(true);
  });

  it('やさしい: 最大パワーでも転落しない', () => {
    expect(fellALevel(P_MAX, EASY)).toBe(false);
  });
});
