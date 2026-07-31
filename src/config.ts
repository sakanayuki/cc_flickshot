/**
 * 全チューニング定数と共有型。
 *
 * このゲームは「上から下へ降りる」。盤面には実機の写真と同じく
 * **ななめ上向きのレーン**が段になって並んでいる。
 *
 *   ・重力は画面の下向きに働く
 *   ・レーンはななめ上を向いていて、コインはその低い端(壁ぎわ)で止まっている
 *   ・レバーを弾くとコインに勢いがつき、レーンを**登って**いく
 *   ・登りながら重力の斜面成分(GRAVITY * sinθ)で減速する
 *   ・レーンには穴と隙間があり、
 *       弱すぎ  → 手前の穴を渡りきれずに落ちる(アウト)
 *       ちょうど → **隙間から落ちて 1 段下のレーンへ進める**
 *       強すぎ  → 隙間を飛び越して奥の穴に落ちる(アウト)
 *
 * 「隙間から落ちたときだけ下の段に進める」がこのゲームの芯。
 * 落ちた先では 1 段下のレーンに乗り、そのまま滑り降りて低い端のレバーで止まる。
 *
 * レーンの上の運動は斜面に沿った 1 次元(位置 u と速さ v)。
 * 隙間から落ちるあいだだけ、画面下向きの重力による自由落下になる。
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

/** レーンの低い端(レバーのある側)がどちらの壁か */
export type LaneSide = 'left' | 'right';

export type DifficultyId = 'easy' | 'normal';

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  /**
   * 手前の穴のレーンに沿った長さ。これだけが難易度差。
   *
   * 短いほど、渡りきるのに要る勢いが小さくて済み、そのぶん
   * 「渡れる」と「隙間で落ちる」を両立できる幅が広がる。
   * 同時に隙間そのものも広くなるので、見た目でも易しさが分かる。
   */
  nearHoleSpan: number;
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

export const BOARD_CENTER_X = (BOARD_LEFT + BOARD_RIGHT) / 2;

/** レーンの本数 = 弾く回数。最後の 1 回であたりの口へ落ちる */
export const ROW_COUNT = 5;
/** レーンからレーンまでの垂直距離(低い端どうし) */
export const ROW_GAP = 136;
/** 1 段目のレーンの低い端の y */
export const ROW_TOP_Y = 248;

/**
 * レーンの端の x。低い端(レバー側)と高い端が壁ぎわで左右に入れ替わる。
 * 段ごとに低い端が右・左・右…と交互になるので、レバーも交互に並ぶ。
 */
export const LANE_INSET = 68;
export const LANE_LEFT_X = BOARD_LEFT + LANE_INSET;
export const LANE_RIGHT_X = BOARD_RIGHT - LANE_INSET;
/** レーン 1 本ぶんの水平距離 */
export const LANE_SPAN_X = LANE_RIGHT_X - LANE_LEFT_X;
/**
 * レーンの高低差。低い端から高い端までにこれだけ登る。
 * 斜面に沿った減速は GRAVITY * sinθ なので、この値が「登りにくさ」を決める。
 *
 * 上限は段どうしが重ならないこと:
 *   ROW_GAP > LANE_RISE + レーンの太さ(LANE_W + LANE_RAIL*2)
 * 実機の写真のレーンもゆるい傾きなので、見た目としてもこのくらいが近い。
 */
export const LANE_RISE = 60;
/** レーンの見た目の幅(溝)。コインはこの中を走る */
export const LANE_W = 62;
/** レーンの縁(枠)の太さ */
export const LANE_RAIL = 6;

/**
 * レーンに沿った位置(低い端からの距離 u)で見た、穴と隙間の配置。
 * どの段もまったく同じ配置なので、5 回の操作の条件が完全に一致する。
 *
 *   u = 0                 低い端。レバーがあり、コインはここで止まる
 *   [0, HOLE_NEAR_U]      実線。1 段上から落ちてきたコインが滑り降りてくる区間
 *   手前の穴 (nearHoleSpan) 勢いが足りないとここに落ちる(弱すぎ)
 *   実線 (GAP_LEAD_U)
 *   隙間 → GAP_END_U      **ここから落ちると 1 段下へ進める**
 *   奥の穴 → 高い端        隙間を飛び越すとここに落ちる(強すぎ)
 *
 * HOLE_NEAR_U は「落ちてきたコインの着地点」より先になければならない。
 * 手前にあると、着地したコインが滑り降りる途中で自分から穴に落ちてしまう(検算 §1)。
 */
export const HOLE_NEAR_U = 230;
/** 手前の穴の終わりから隙間の始まりまでの実線 */
export const GAP_LEAD_U = 20;
/** 隙間の終わり。ここから先が奥の穴 */
export const GAP_END_U = 440;

// ---------------------------------------------------------------- 物理

export const FIXED_DT = 1 / 60;
/** タブ復帰時のスパイラル防止 */
export const MAX_FRAME_TIME = 0.25;
/**
 * 1 サブステップあたりの最大移動量 (px)。
 * これを超えないよう 1 フレームを分割して積分し、
 * 高速時に穴や隙間を飛ばして見落とすことを防ぐ。
 */
export const MAX_SUBSTEP_MOVE = 6;

/** 重力。画面の下向きに働く。斜面の減速も落下もこれ 1 つから決まる */
export const GRAVITY = 2200; // px/s^2

/**
 * 穴や隙間の上をこの速さ未満で通ると落ちる。
 * 勢いがあれば口をかすめて渡れる、というのがこのゲームの判定の芯。
 *   手前の穴を渡りきれない → 弱すぎ
 *   隙間を渡りきってしまう → 強すぎ(奥の穴へ)
 */
export const HOLE_CATCH_SPEED = 200;

// ---------------------------------------------------------------- 弾き

/**
 * 弾く力 = 斜面に沿った初速 (px/s)。手で決めず §5.3 の手順で逆算する。
 * 弱すぎると手前の穴に落ち、強すぎると隙間を飛び越して奥の穴に落ちる。
 */
export const P_MIN = 402;
export const P_MAX = 537;
export const FLICK_COOLDOWN = 0.35; // s
/** レバーのはたきアニメの長さ */
export const LEVER_SWING_TIME = 0.22; // s
/** プランジャーを離してからレバーがコインに当たるまでの間 */
export const LEVER_HIT_DELAY = 0.06; // s

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
/** 着地のつぶれ(スカッシュ)演出の長さ */
export const LAND_SQUASH_TIME = 0.14; // s

/** コイン投入口。盤面の右上 */
export const COIN_SLOT_CENTER: Vec2 = { x: 618, y: 96 };
export const COIN_SLOT_SIZE = { w: 118, h: 84 } as const;

// ---------------------------------------------------------------- 難易度

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: { id: 'easy', label: 'やさしい', nearHoleSpan: 60 },
  normal: { id: 'normal', label: 'ふつう', nearHoleSpan: 130 },
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

  // 筐体(実機の赤いキャビネット)
  cabinet: '#D8452F',
  cabinetDark: '#A93223',
  cabinetTrim: '#F2B33D',
  cabinetTrimDark: '#C98F1E',

  // 盤面の化粧板
  boardFace: '#FFF3CF',
  boardFaceDeep: '#F5DE9E',

  // レーン(コインが走る溝)
  laneRail: '#F5B04C',
  laneFloor: '#C97F23',
  laneShine: '#FFE0A8',
  laneEdge: '#6B4423',

  lever: '#E8503A',
  leverDark: '#B23324',

  // 進める隙間(アウトの穴とはっきり違う色にする)
  gapRing: '#4FBF6A',
  gapRingDark: '#2E9A4A',

  // 丸穴(こげ茶の落とし穴+オレンジのリム)
  hole: '#2A1B0C',
  holePit: '#120B04',
  holeRing: '#FF7A2F',
  holeRingDark: '#D65A17',

  coinRim: '#F5C242',
  coinFace: '#FFF3D0',
  pocket: '#F5C242',
  pocketDark: '#D9A227',
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
