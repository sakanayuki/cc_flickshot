/**
 * 全チューニング定数と共有型。詳細設計書 §12。
 *
 * このファイルは副作用を持たない葉ノードで、すべてのモジュールから参照される。
 * 数値を変更したら必ず `npm run verify` を実行し、詳細設計書 §3.6 の表と
 * 突き合わせること。
 */

// ---------------------------------------------------------------- 共通型

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LeverSide = 'left' | 'right';

export interface Lane {
  index: number;
  /** 高い側の端。コインはここから低い方へ転がる */
  hi: Vec2;
  /** 低い側の端 = レバーがある側。壁に接している */
  lo: Vec2;
  leverSide: LeverSide;
}

export interface Hole {
  laneIndex: number;
  /** レーン上の位置。0 = 高い端、1 = レバー端 */
  s: number;
  radius: number;
  center: Vec2;
}

export type DifficultyId = 'easy' | 'normal';

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  /** [段1..段5] それぞれの穴の s 座標 */
  holeS: readonly (readonly number[])[];
  holeRadius: number;
  /** これ未満の転がり速度で穴に落ちる (px/s) */
  fallSpeed: number;
  /** ゴールのバスケットの左端 x。小さいほどゴールが広い */
  goalBasketLeft: number;
  /** レバー端のリップを飛び越える速度。null = 転落なし */
  lipEscapeSpeed: number | null;
}

// ---------------------------------------------------------------- 画面

export const LOGICAL_W = 720;
export const LOGICAL_H = 1280;
export const MAX_DPR = 3;

// ---------------------------------------------------------------- 盤面

/**
 * レーンのレバー端 x。コインはここで止まる。
 * 盤面の壁はここから COIN_R だけ外側にあり、止まったコインがちょうど壁に接する。
 */
export const LANE_END_LEFT = 60;
export const LANE_END_RIGHT = 660;

export const BOARD_TOP = 40;
export const BOARD_BOTTOM = 750;

export const LANE_COUNT = 5;
/** 高い端 → レバー端の水平距離 */
export const LANE_LEN = 450;
/** 同区間の落差 */
export const LANE_DROP = 40;
/** 段間の垂直距離 */
export const LANE_GAP = 105;
/** 高い端が壁から引っ込む量。この隙間がコインの通るシャフトになる */
export const SHAFT_W = 150;
/** 段1のレバー端を盤面下端からどれだけ上げるか */
export const LANE_BASE_OFFSET = 8;

export const LANE_ANGLE = Math.asin(LANE_DROP / LANE_LEN); // 5.10 deg
/** レーンの実長(斜辺)。s ↔ px の換算に使う */
export const LANE_SPAN = Math.hypot(LANE_LEN, LANE_DROP);

// ---------------------------------------------------------------- コイン

export const COIN_R = 28;

/** 盤面の壁。レバー端に静止したコインが壁にちょうど接する位置 */
export const BOARD_LEFT = LANE_END_LEFT - COIN_R;
export const BOARD_RIGHT = LANE_END_RIGHT + COIN_R;

// ---------------------------------------------------------------- 物理

export const GRAVITY = 2200; // px/s^2
/**
 * 転がりの減衰 (1/s)。上げてはならない(詳細設計書 §4.2)。
 * 大きくすると全てのコインが終端速度に収束してしまい、
 * 「速く転がっているコインは穴を飛び越える」というゲーム性が壊れる。
 */
export const ROLL_DAMPING = 0.35;
export const WALL_RESTITUTION = 0.5;
export const FIXED_DT = 1 / 60;
/** タブ復帰時のスパイラル防止 */
export const MAX_FRAME_TIME = 0.25;

// ---------------------------------------------------------------- 弾き

export const P_MIN = 620; // px/s
export const P_MAX = 1700; // px/s
/**
 * 鉛直から盤面内側へ。
 *
 * この値を下げてはならない。シャフトの上は「2段上のレーンの裏面」で塞がれており、
 * 角度が浅いとコインが次の段の先端を越える前に天井にぶつかって戻されるため、
 * 20 度では成功域がストロークの 2% しかなくなる。26 度で 73% になる。
 * `npm run verify` の項目8がこれを検証している。
 */
export const FLICK_ANGLE_DEG = 26;
export const FLICK_ANGLE = (FLICK_ANGLE_DEG * Math.PI) / 180;
/** 弾きゾーン。狭くしてはならない(詳細設計書 §6.5) */
export const FLICK_ZONE_S = { min: 0.7, max: 1.0 } as const;
export const FLICK_COOLDOWN = 0.3; // s
/** レバーのはたき上げアニメの長さ */
export const LEVER_SWING_TIME = 0.2; // s

// ---------------------------------------------------------------- プランジャー

export const KNOB_REST: Vec2 = { x: 560, y: 830 };
export const KNOB_R = 70;
/** 指の移動量。削ってはならない(詳細設計書 §6.3) */
export const STROKE_FINGER = 450;
/** ノブの見た目の移動量 */
export const STROKE_KNOB = 380;
export const PULL_DEADZONE = 0.05;
/** 離してから戻りきるまで (s) */
export const KNOB_RETURN = 0.15;
export const GRAB_ZONE: Rect = { x: 390, y: 755, w: 330, h: 230 };

// ---------------------------------------------------------------- ゴール

export const GOAL_LIP_X = 510;
export const GOAL_LIP_TOP = 177;
export const GOAL_FLOOR_Y = 235;

// ---------------------------------------------------------------- UI

export const GIVEUP_CENTER: Vec2 = { x: 128, y: 132 };
export const GIVEUP_R = 44;
export const GIVEUP_CANCEL_R = 88;
export const GIVEUP_HOLD = 1.0; // s
export const GIVEUP_RING_DELAY = 0.2; // s
export const GUIDE_IDLE_DELAY = 2.0; // s
export const RESULT_INPUT_DELAY = 0.8; // s
/** ボタンの当たり判定を見た目より広げる量 */
export const BUTTON_PADDING = 20;

// ---------------------------------------------------------------- 演出

export const INSERT_ANIM = 1.5; // s
export const FALL_ANIM = 1.0; // s
export const GOAL_ANIM = 1.5; // s
export const STAMP_ANIM = 0.6; // s

/**
 * 投入されたコインがシュートを滑り降りて段1に乗るときの初速 (px/s)。
 *
 * 0 にしてはならない。静止から転がり始めると段1の穴に達する時点で 272 px/s
 * にしかならず、ふつうの落下閾値を下回って「一度も弾く前に落ちる」ようになる。
 * `npm run verify` の項目8がこれを検証している。
 */
export const INSERT_ENTRY_SPEED = 220;

export const COIN_SLOT_CENTER: Vec2 = { x: 185, y: 900 };
export const COIN_SLOT_SIZE = { w: 130, h: 90 } as const;

// ---------------------------------------------------------------- 難易度

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: {
    id: 'easy',
    label: 'やさしい',
    holeS: [[0.85], [0.85], [0.85], [0.85], [0.85]],
    holeRadius: 25,
    fallSpeed: 230,
    goalBasketLeft: 260,
    lipEscapeSpeed: null,
  },
  normal: {
    id: 'normal',
    label: 'ふつう',
    holeS: [[0.85], [0.85], [0.65, 0.87], [0.65, 0.87], [0.65, 0.87]],
    holeRadius: 34,
    fallSpeed: 280,
    goalBasketLeft: 300,
    lipEscapeSpeed: 650,
  },
};

// ---------------------------------------------------------------- レーン座標

/**
 * レーンは定数から導出する(手打ちしない)。
 * 段1(index 0)のレバーが右、以降左右交互。
 * 詳細設計書 §3.2 の表と一致することを `npm run verify` が検証する。
 */
export const LANES: readonly Lane[] = Array.from({ length: LANE_COUNT }, (_, i): Lane => {
  const leverRight = i % 2 === 0;
  const loY = BOARD_BOTTOM - LANE_BASE_OFFSET - i * LANE_GAP;
  const hiY = loY - LANE_DROP;
  return leverRight
    ? {
        index: i,
        hi: { x: LANE_END_LEFT + SHAFT_W, y: hiY },
        lo: { x: LANE_END_RIGHT, y: loY },
        leverSide: 'right',
      }
    : {
        index: i,
        hi: { x: LANE_END_RIGHT - SHAFT_W, y: hiY },
        lo: { x: LANE_END_LEFT, y: loY },
        leverSide: 'left',
      };
});

// ---------------------------------------------------------------- 色

export const COLORS = {
  sky: '#8FD3F4',
  skyTop: '#BDE9FF',
  sun: '#FFE066',
  cloud: '#FFFFFF',
  mountain: '#8CC63F',
  mountainHi: '#B5E061',
  mountainSh: '#5FA32A',
  laneTop: '#D9A05B',
  laneSide: '#A9713A',
  laneEdge: '#6B4423',
  lever: '#E8503A',
  leverDark: '#B23324',
  hole: '#4A3520',
  holeRim: '#2E1F12',
  coinRim: '#F5C242',
  coinFace: '#FFF3D0',
  goalPocket: '#F2E9D8',
  flagRed: '#E8503A',
  ink: '#3B2A1A',
  panel: '#FFF8EC',
  panelEdge: '#3B2A1A',
  accent: '#FF8A3D',
  disabled: '#C9C2B6',
} as const;

/** 輪郭線の太さ。3歳児の視認性のため細くしない */
export const LINE_W = 4;

// ---------------------------------------------------------------- どうぶつ

export type AnimalKind =
  | 'usagi'
  | 'kuma'
  | 'panda'
  | 'risu'
  | 'neko'
  | 'inu'
  | 'zou'
  | 'kirin'
  | 'pengin'
  | 'raion';

/** スタンプの付与順と一致させる */
export const ANIMALS: readonly AnimalKind[] = [
  'usagi',
  'kuma',
  'panda',
  'risu',
  'neko',
  'inu',
  'zou',
  'kirin',
  'pengin',
  'raion',
];
