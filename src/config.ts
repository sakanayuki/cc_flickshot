/**
 * 全チューニング定数と共有型。
 *
 * このゲームは「上から下へ降りる」。コインは右上から入り、レール(板)を
 * 転がり降りて**画面の端の先端**まで来る。先端には壁から生えたレバーがあり、
 * コインはそこにもたれて止まる。プランジャーを離すとレバーがコインを
 * **盤面の内側へ**弾き出し、放物線を描いて反対側の端にある 1 段下のレールへ
 * 飛び移る。弱すぎれば中央の丸穴、強すぎれば飛び越した先(反対側の壁ぎわ)の
 * 丸穴に落ちてコインは没収される。
 *
 * レールは実機の写真と同じく左端・右端・左端…と交互に置かれ、先端(溝)は
 * つねに壁のすぐそば(TIP_INSET)にある。つまり「弾く点」は画面の左右の端で、
 * レバーもその横の壁に付く。
 *
 * 弾く向きは自分のレールの上を逆走する向きになる。そのため
 * **飛び出したコインが自分のレールを飛び越せること**が設計上の必須条件で、
 * FLICK_RISE / P_MIN / plankWidth / PLANK_DROP はその条件
 * (仰角ぶんの上昇 > レールの傾きぶんの上昇、レール全長にわたって)を
 * 満たす組み合わせに調整してある。`npm run verify` の §7 が
 * 全パワー掃引でこれを機械的に確認する。
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

/**
 * 溝(コインが止まるレール先端)が板のどちらの端にあるか。
 * 先端はつねに壁ぎわで、レバーはその横の壁に付く。
 * コインは**先端から盤面の内側へ**、自分の板を飛び越す向きに弾き出される。
 */
export type GrooveSide = 'left' | 'right';

/** 1 段ぶんのレール(板) */
export interface Row {
  index: number;
  /** 板の左端 x */
  left: number;
  /** 板の右端 x */
  right: number;
  /** 溝(低い側の先端)がどちらの端か */
  grooveSide: GrooveSide;
  /** 溝側の板面の y(板はここへ向かって下る) */
  grooveY: number;
  /** 反対側(高い端)の板面の y。grooveY - PLANK_DROP */
  highY: number;
}

/** 最下段の下にある「あたりの口」。ここに入ればクリア */
export interface WinPocket {
  left: number;
  right: number;
  /** 受け口の高さ。コイン中心がこの y に達したら判定する */
  y: number;
}

export type DifficultyId = 'easy' | 'normal';

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  /**
   * 板(レール)の長さ。これだけが難易度差。
   * 長いほど着地できる範囲が広く、強すぎ・弱すぎの許容が大きい。
   * ただし長すぎると自分のレールを飛び越せなくなるので上限がある(§検算7)。
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

export const BOARD_CENTER_X = (BOARD_LEFT + BOARD_RIGHT) / 2;

export const ROW_COUNT = 5;
/** 溝から溝までの垂直距離。全段共通 */
export const ROW_GAP = 145;
/** 1 段目の溝の y */
export const ROW_TOP_Y = 210;

/**
 * レールの先端(溝=弾く点)と壁の隙間。
 *
 * ここが実機との一番の違いだったところ。先端は左右の壁のすぐ内側にあり、
 * レバーはその横の壁に付く。壁との間に残したこの隙間が
 * 「強すぎ」で落ちる**奥の丸穴**になるので、コイン 1 枚(COIN_R*2)より
 * 広くなければならない(検算 §1)。
 */
export const TIP_INSET = 84;
/** 左端のレールの先端 x(奇数段)。ここに左のレバーが付く */
export const TIP_LEFT_X = BOARD_LEFT + TIP_INSET;
/** 右端のレールの先端 x(偶数段)。ここに右のレバーが付く */
export const TIP_RIGHT_X = BOARD_RIGHT - TIP_INSET;
/** 左右の先端の距離。1 回の飛距離はこの範囲に収まる */
export const TIP_SPAN = TIP_RIGHT_X - TIP_LEFT_X;

/**
 * 板の高い端と溝(低い端)の落差。コインが先端まで転がるための傾き。
 *
 * 弾いたコインは自分のレールの上を逆走して飛び越すので、
 * この落差が大きいほど飛び越すのが難しくなる。ゆるい傾きにしてある。
 */
export const PLANK_DROP = 8;
/** 板の厚み。コインはこの実体と衝突し、決して貫通しない */
export const PLANK_THICK = 20;

/**
 * 空中のコインが「1 段下の板面レベル」をこれだけ下回ったら穴に落ちたとみなす。
 * 板の実体衝突(端で跳ねずに止まる)を先に解決した上での最終判定。
 */
export const CAPTURE_BELOW = 14;

// ---------------------------------------------------------------- 物理

export const GRAVITY = 2200; // px/s^2
/** 板の上を転がるときの減衰 (1/s) */
export const ROLL_DAMPING = 1.4;
export const FIXED_DT = 1 / 60;
/** タブ復帰時のスパイラル防止 */
export const MAX_FRAME_TIME = 0.25;
/**
 * 空中の 1 サブステップあたりの最大移動量 (px)。
 * これを超えないよう 1 フレームを分割して積分し、高速時のすり抜けを防ぐ。
 */
export const MAX_SUBSTEP_MOVE = 6;

// ---------------------------------------------------------------- 弾き

export const P_MIN = 665; // px/s
export const P_MAX = 950; // px/s
/**
 * 弾く角度。水平からの仰角。
 *
 * 上下から挟まれている:
 *   小さすぎる → 自分のレールを飛び越せずにめり込む(検算 §7)
 *   大きすぎる → 頂点が高くなりすぎて 1 段上のレールの裏に当たる(検算 §8)
 */
export const FLICK_RISE_DEG = 35;
export const FLICK_RISE = (FLICK_RISE_DEG * Math.PI) / 180;
/** 溝からこの距離以内にいる onPlank のコインだけが弾かれる。広めに取る */
export const FLICK_ZONE_PX = 90;
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
  easy: { id: 'easy', label: 'やさしい', plankWidth: 140 },
  normal: { id: 'normal', label: 'ふつう', plankWidth: 100 },
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

  // レール(板)
  plankTop: '#F5B04C',
  plankSide: '#C97F23',
  plankEdge: '#6B4423',

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
