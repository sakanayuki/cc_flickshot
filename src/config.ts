/**
 * 全チューニング定数と共有型。
 *
 * このゲームは「上から下へ降りる」。コインは右上から入り、各段の溝(みぞ)から
 * 横に弾かれて 1 段下の板に着地する。板を外すと穴に落ちてコインは没収される。
 *
 * このファイルは副作用を持たない葉ノードで、すべてのモジュールから参照される。
 * 数値を変更したら必ず `npm run verify` と `npm test` を実行すること。
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

/** 溝(コインが止まる端)がどちら側か。コインはその反対向きに弾き出される */
export type NotchSide = 'left' | 'right';

/** 1 段ぶんの板 */
export interface Row {
  index: number;
  /** 板の左端 x */
  left: number;
  /** 板の右端 x */
  right: number;
  /** 溝の側。'right' なら右端が低く、コインは右端で止まって左へ弾かれる */
  notchSide: NotchSide;
  /** 溝(板の低い側)の y */
  notchY: number;
  /** 板の高い側の y。notchY より PLANK_DROP だけ小さい */
  highY: number;
}

/** 最下段の下にある「あたりの口」。ここに入ればクリア */
export interface WinPocket {
  left: number;
  right: number;
  /** 受け口の高さ。コイン中心がこの y に達したら成功 */
  y: number;
}

export type DifficultyId = 'easy' | 'normal';

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  /**
   * 板の幅。これだけが難易度差。
   * 広いほど着地できる範囲が広く、強すぎ・弱すぎの許容が大きい。
   */
  plankWidth: number;
}

// ---------------------------------------------------------------- 画面

export const LOGICAL_W = 720;
export const LOGICAL_H = 1280;
export const MAX_DPR = 3;

// ---------------------------------------------------------------- コイン

export const COIN_R = 28;

// ---------------------------------------------------------------- 盤面

/** 盤面の壁。コインの中心はここから COIN_R 内側までしか行けない */
export const BOARD_LEFT = 40;
export const BOARD_RIGHT = 680;
export const BOARD_TOP = 40;
/** 盤面の下端。プランジャー帯を画面の 22% に抑えるためここまで広げてある */
export const BOARD_BOTTOM = 994;

export const ROW_COUNT = 5;
/** 溝から溝までの垂直距離。全段共通 */
export const ROW_GAP = 145;
/** 1 段目の溝の y */
export const ROW_TOP_Y = 210;
/** 板の高い側と低い側(溝)の落差。コインが溝まで転がるための傾き */
export const PLANK_DROP = 22;

/**
 * 溝から板の手前側の端までの距離(= 弱すぎたときに落ちる穴の幅)。
 *
 * 0 にしてはならない。0 だと「弱すぎ」で落ちる余地が無くなり、
 * 強すぎでしか失敗しない片側だけのゲームになる。
 */
export const NEAR_GAP = 120;

/** 盤面の中心 x。溝の位置はここを軸に左右対称に決まる */
export const BOARD_CENTER_X = (BOARD_LEFT + BOARD_RIGHT) / 2;

/**
 * 溝の x を板幅から導く。
 *
 * 右の溝から左へ弾いたコインが着地する板の左端が、そのまま次の溝になるように
 * 取ってある。これにより 5 つの遷移がすべて同じ「横に飛ぶ距離」になり、
 * 弾き力の適正範囲が段によってばらつかない。
 */
export function notchOffset(plankWidth: number): number {
  return (NEAR_GAP + plankWidth) / 2;
}

// ---------------------------------------------------------------- 物理

export const GRAVITY = 2200; // px/s^2
/** 板の上を転がるときの減衰 (1/s) */
export const ROLL_DAMPING = 1.6;
export const FIXED_DT = 1 / 60;
/** タブ復帰時のスパイラル防止 */
export const MAX_FRAME_TIME = 0.25;

// ---------------------------------------------------------------- 弾き

export const P_MIN = 200; // px/s
export const P_MAX = 1000; // px/s
/**
 * 弾く角度。水平からの仰角。
 * 少し上向きにすることで放物線が見え、「弾かれた」感じが出る。
 */
export const FLICK_RISE_DEG = 12;
export const FLICK_RISE = (FLICK_RISE_DEG * Math.PI) / 180;
/** 溝からこの距離以内にいるコインだけが弾かれる。広めに取る */
export const FLICK_ZONE_PX = 90;
export const FLICK_COOLDOWN = 0.3; // s
/** レバーのはたきアニメの長さ */
export const LEVER_SWING_TIME = 0.2; // s

// ---------------------------------------------------------------- プランジャー

export const KNOB_REST: Vec2 = { x: 560, y: 1040 };
export const KNOB_R = 46;
/** 指の移動量。画面下端までちょうど届く */
export const STROKE_FINGER = 240;
/** ノブの見た目の移動量。引ききってもノブが画面内に残るよう指より小さい */
export const STROKE_KNOB = 190;
export const PULL_DEADZONE = 0.05;
/** 離してから戻りきるまで (s) */
export const KNOB_RETURN = 0.15;
/** 掴み領域。ノブより大幅に広く取り、3歳児が掴み損ねないようにする */
export const GRAB_ZONE: Rect = { x: 300, y: 996, w: 420, h: 284 };

// ---------------------------------------------------------------- UI

export const GIVEUP_CENTER: Vec2 = { x: 108, y: 108 };
export const GIVEUP_R = 42;
export const GIVEUP_CANCEL_R = 84;
export const GIVEUP_HOLD = 1.0; // s
export const GIVEUP_RING_DELAY = 0.2; // s
export const GUIDE_IDLE_DELAY = 2.0; // s
export const RESULT_INPUT_DELAY = 0.8; // s
/** ボタンの当たり判定を見た目より広げる量 */
export const BUTTON_PADDING = 20;

// ---------------------------------------------------------------- 演出

export const INSERT_ANIM = 1.4; // s
export const FALL_ANIM = 1.0; // s
export const WIN_ANIM = 1.5; // s
export const STAMP_ANIM = 0.6; // s

/** コイン投入口。盤面の右上 */
export const COIN_SLOT_CENTER: Vec2 = { x: 618, y: 96 };
export const COIN_SLOT_SIZE = { w: 118, h: 84 } as const;

// ---------------------------------------------------------------- 難易度

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: { id: 'easy', label: 'やさしい', plankWidth: 330 },
  normal: { id: 'normal', label: 'ふつう', plankWidth: 160 },
};

// ---------------------------------------------------------------- 色

export const COLORS = {
  sky: '#8FD3F4',
  skyTop: '#BDE9FF',
  sun: '#FFE066',
  cloud: '#FFFFFF',
  mountain: '#8CC63F',
  mountainHi: '#B5E061',
  mountainSh: '#5FA32A',
  plankTop: '#D9A05B',
  plankSide: '#A9713A',
  plankEdge: '#6B4423',
  lever: '#E8503A',
  leverDark: '#B23324',
  hole: '#3A2A18',
  holeRim: '#241708',
  coinRim: '#F5C242',
  coinFace: '#FFF3D0',
  pocket: '#F2E9D8',
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
