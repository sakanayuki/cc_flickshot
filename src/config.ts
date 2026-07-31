/**
 * 全チューニング定数と共有型。
 *
 * このゲームは「上から下へ降りる」。盤面には実機の写真の青い線と同じ
 * **1 本につながったレーン**が引かれている。長い直線を走り、壁で U ターンして
 * 1 段下の直線へ、を繰り返しながら下りていく。
 *
 * **コインは飛ばない。レーンの上を走る。**
 * プランジャーを離すと、壁ぎわの止まり木に止まっていたコインが勢いを得て
 * レーンを走り出し、摩擦で減速しながら next の止まり木を目指す。
 *   弱すぎ → 途中の穴を渡りきれずに落ちる
 *   ちょうど → 穴を渡りきり、次の止まり木に受け止められる
 *   強すぎ → 止まり木を乗り越えてしまい、その先の穴に落ちる
 *
 * 物理はレーンに沿った 1 次元(位置 s と速さ v)だけ。放物線も 2 次元の
 * 当たり判定も無い。レーンの形が変わっても遊びの条件は一切変わらない。
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

/** 走路(レーンの直線部分)がどちら向きに走るか */
export type RunDir = 'left' | 'right';

export type DifficultyId = 'easy' | 'normal';

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  /**
   * 穴のレーンに沿った長さ。これだけが難易度差。
   *
   * 短いほど渡りきるのに要る勢いが小さく、渡ってから止まり木までの
   * 助走距離が長くなる = 減速する余地が増えて成功域が広がる。
   */
  holeSpan: number;
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

/** 止まり木(レバー)の数 = 弾く回数。最後の 1 回であたりの口に入る */
export const ROW_COUNT = 5;
/** 走路の本数。1 本目は投入用で、そこから ROW_COUNT 回弾く */
export const RUN_COUNT = ROW_COUNT + 1;
/** 走路から走路までの垂直距離 */
export const ROW_GAP = 138;
/** 1 本目の走路の y */
export const ROW_TOP_Y = 190;

/**
 * 走路の左端・右端の x。
 *
 * 走路の端は壁ぎわにあり、そこに止まり木(レバー)が立つ。
 * 端から先はレーンが U ターンして 1 段下の走路につながるので、
 * U ターンの半径ぶん外側へ膨らむ。コインの中心が壁に触れないよう
 *   RUN_LEFT_X - Uターン半径 >= BOARD_LEFT + COIN_R
 * を満たすこと(検算 §1)。
 */
export const RUN_LEFT_X = 145;
export const RUN_RIGHT_X = BOARD_RIGHT - (RUN_LEFT_X - BOARD_LEFT);
/** 走路 1 本ぶんの水平距離 */
export const RUN_SPAN = RUN_RIGHT_X - RUN_LEFT_X;
/** 走路の傾き(端から端までの落差)。見た目の傾きで、物理には効かない */
export const RUN_DROP = 22;

/** レーン(溝)の幅。コインはこの中を走る */
export const LANE_W = 64;
/** レーンの縁(枠)の太さ */
export const LANE_RAIL = 7;

// ---------------------------------------------------------------- 物理

export const FIXED_DT = 1 / 60;
/** タブ復帰時のスパイラル防止 */
export const MAX_FRAME_TIME = 0.25;
/**
 * 1 サブステップあたりの最大移動量 (px)。
 * これを超えないよう 1 フレームを分割して積分し、
 * 高速時に穴や止まり木を飛ばして見落とすことを防ぐ。
 */
export const MAX_SUBSTEP_MOVE = 6;

/**
 * レーンに沿った減速 (1/s)。コインはレーンの上を走り、これで勢いを失う。
 * 速さは距離に対してほぼ一直線に落ちる(v ≒ v0 − LANE_DRAG · 走った距離)ので、
 * 「引いた量 = 走る距離」が素直に対応する。
 */
export const LANE_DRAG = 1.6;
/**
 * レーンの傾きぶんの加速 (px/s^2)。
 * 止まりかけたコインをゆっくり前へ送り、必ず次の止まり木か穴まで運ぶ。
 * これがないとコインがレーンの途中で永久に止まって詰む。
 */
export const LANE_ASSIST = 95;
/** 止まりかけの速さ = LANE_ASSIST / LANE_DRAG。穴に必ず捕まる速さであること */
export const LANE_CREEP = LANE_ASSIST / LANE_DRAG;

/**
 * 穴の上をこの速さ未満で通ると落ちる。
 * 勢いがあれば穴の口をかすめて渡れる、というのがこのゲームの「弱すぎ」の判定。
 */
export const HOLE_CATCH_SPEED = 170;
/**
 * 止まり木にこの速さ以下で来ると受け止められる。
 * 超えていると乗り越えてしまい、そのまま次の穴へ落ちる = 「強すぎ」の判定。
 */
export const STOP_HOLD_SPEED = 130;
/** 投入されたコインが 1 本目の走路を走り出す速さ */
export const ENTRY_SPEED = 660;

// ---------------------------------------------------------------- 弾き

/**
 * 弾く力 = レーンに沿った初速 (px/s)。手で決めず §5.3 の手順で逆算する。
 * 弱すぎると穴を渡りきれず、強すぎると止まり木を乗り越える。
 */
export const P_MIN = 430;
export const P_MAX = 1080;
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
  easy: { id: 'easy', label: 'やさしい', holeSpan: 120 },
  normal: { id: 'normal', label: 'ふつう', holeSpan: 190 },
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
