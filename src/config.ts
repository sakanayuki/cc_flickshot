/**
 * 全チューニング定数と共有型。副作用のない葉ノード。
 *
 * ── ゲームの芯 ────────────────────────────────────────────────
 * 盤面には**ななめ上向きのレーン**が 5 段。重力は画面の下向き。
 * コインはレーンの低い端(壁ぎわ)のストッパーで止まっている。
 * レバーで弾くとレーンを**登り**、重力で減速する。
 *
 *   弱すぎ  → 手前の穴を渡りきれずに落ちる(アウト)
 *   ちょうど → 手前の穴を渡りきり、勢いを失って**隙間から落ちる** → 1 段下へ
 *   強すぎ  → 隙間を飛び越して奥の穴に落ちる(アウト)
 *
 * ── 物理は Matter.js ──────────────────────────────────────────
 * 判定用の特別なルールは持たない。レーンは実体(静的剛体)、穴と隙間は
 * **単に床が無い区間**。落ちるか渡りきるかは剛体シミュレーションが決める。
 * したがって「穴を渡れる速さ」は穴の幅とコインの半径から自然に決まる。
 *
 *   渡りきれる目安 : v > W / sqrt(2r/g)     (W = 穴の幅, r = コイン半径)
 *
 * この式は当たりをつけるためだけのもの。確定値は `npm run verify` が
 * 実際に Matter.js を回して測る。数値を変えたら必ず verify と test を通すこと。
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

/** レーンに沿った区間 [from, to] (低い端からの距離) */
export interface Span {
  from: number;
  to: number;
}

/** レーンの低い端(ストッパーとレバーのある側)がどちらの壁か */
export type LaneSide = 'left' | 'right';

export type DifficultyId = 'easy' | 'normal';

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  /** サブタイトル(英字)。UI の見た目用 */
  tag: string;
  /**
   * 手前の穴の幅。これだけが難易度差。
   * 広いほど渡りきるのに要る速さが上がり、そのぶん
   * 「渡れる」と「隙間で落ちる」を両立できるパワーの幅が狭くなる。
   */
  nearHoleSpan: number;
}

// ---------------------------------------------------------------- 画面

export const LOGICAL_W = 720;
export const LOGICAL_H = 1280;
/**
 * DPR の上限。3 にすると 1290×2796 = 360 万画素を毎フレーム塗ることになり、
 * 見た目がほとんど変わらないわりにラスタライズが 2.25 倍重くなる。
 */
export const MAX_DPR = 2;

// ---------------------------------------------------------------- コイン

export const COIN_R = 28;
/**
 * Matter 上のコインの辺の数。**偶数**であること。
 * 奇数だと当たり判定が左右非対称になり、低い端が右の段と左の段で
 * 成功域がずれる(検算 §2 が数値で固定している)。
 */
export const COIN_SIDES = 32;

// ---------------------------------------------------------------- 盤面

/** ガラス窓(プレイフィールド)の内側 */
export const BOARD_LEFT = 40;
export const BOARD_RIGHT = 680;
export const BOARD_TOP = 40;
export const BOARD_BOTTOM = 994;

export const BOARD_CENTER_X = (BOARD_LEFT + BOARD_RIGHT) / 2;

/** レーンの本数 = 弾く回数。最後の 1 回であたりの口へ落とす */
export const ROW_COUNT = 5;
/**
 * 段どうしの垂直距離(低い端どうし)。
 * `ROW_GAP - LANE_RISE` が「ある段の低い端」と「1 段下の高い端」の隙間になる。
 * 落ちたコイン(直径 2r)とレールの厚みが通る余裕が要るので、
 *   ROW_GAP - LANE_RISE > 2 * COIN_R + LANE_THICK
 * を満たすこと(検算 §1 が数値で固定している)。
 */
export const ROW_GAP = 146;
/** 1 段目のレーンの低い端の y */
export const ROW_TOP_Y = 248;

/**
 * レーンは**画面の左右の端まで**伸びる。実機の写真と同じで、
 * 低い端は壁そのもの。壁がストッパーを兼ね、その横からレバーが生えている。
 *
 * ここに余白を作ってはいけない。隙間から落ちたコインは勢いを持ったまま
 * 高い端の側へ飛ぶので、レーンの端と壁のあいだに空きがあると
 * **そこへ落ちて詰む**(弾くこともできず結果も出ない)。
 */
export const LANE_LEFT_X = BOARD_LEFT;
export const LANE_RIGHT_X = BOARD_RIGHT;
export const LANE_SPAN_X = LANE_RIGHT_X - LANE_LEFT_X;
/** レーンの高低差。傾き sinθ = LANE_RISE / レーン長 が減速の強さを決める */
export const LANE_RISE = 60;
/** レール(実体)の厚み */
export const LANE_THICK = 16;
/** レールの見た目の幅(溝の見え幅)。当たり判定には使わない */
export const LANE_FACE = 26;

/**
 * レーンに沿った位置(低い端からの距離 u)で見た、床と落とし口の配置。
 * 5 段すべて完全に同じなので、5 回の操作の条件が一致する。
 *
 *   u = 0                     低い端。ストッパーとレバー
 *   [0, SOLID_RUN]            レール(実体)。ここだけが床
 *   [SOLID_RUN, ...]          **ここから先は床が無い**。ひと続きの落とし口
 *      ├ 手前の穴 (nearHoleSpan)   弱すぎるとここへ落ちる
 *      ├ 隙間 (… GAP_END_U)        **ここへ落ちると 1 段下へ進める**
 *      └ 奥の穴 (… レーン長)       強すぎるとここへ落ちる
 *
 * ── なぜ落とし口をひと続きにするか ──────────────────────────
 * 穴と穴のあいだにレールを挟むと、飛び越したコインが必ず**その先の縁に
 * 着地する**。縁は当たりどころで失う速度がまるで違うので、
 * 「もう少し強く弾いたのに手前の穴に落ちた」という飛び地ができる。
 * 実測では 943 px/s のコインが縁に当たって 402 px/s まで落ちていた。
 *
 * レールの端を離れたあと何にも触れないようにすると、落ちる位置は
 *
 *     Δu = v・t − (1/2)・g sinθ・t²   ,  t = sqrt(2・(COIN_R + PIT_DEPTH)/(g cosθ))
 *
 * という単調な式になり、弾く力に対して 弱すぎ → ちょうど → 強すぎ が
 * きれいに並ぶ。見た目は 3 つの落とし口をリブで区切って描き分ける。
 */
export const SOLID_RUN = 300;
/**
 * レールの端から「隙間の終わり」までの距離。
 * これを超えて飛ぶと奥の穴、つまり強すぎ。難易度によらず共通。
 */
export const MAX_REACH = 200;

// ---------------------------------------------------------------- 物理

export const FIXED_DT = 1 / 60;
/** タブ復帰時のスパイラル防止 */
export const MAX_FRAME_TIME = 0.25;
/**
 * 1 フレームを Matter.js に何回に分けて渡すか。
 * 高速のコインがレールの角をすり抜けないよう細かく刻む。
 */
export const PHYS_SUBSTEPS = 5;

/** 重力 (px/s^2)。画面の下向き */
export const GRAVITY = 2200;

/** コインの材質。跳ね返りは 0(§4.2 のとおり跳ねるとルールが崩れる) */
export const COIN_RESTITUTION = 0;
/**
 * 摩擦は 0。plan §4.2 のとおりレールの上では重力の斜面成分だけが効く。
 *
 * Matter の摩擦は物理的なクーロン摩擦ではなく、接線速度が小さいと
 * **その場で速度をまるごと消す**近似が入っている。0.02 でも実測で
 * 2700 px/s^2 という現実にありえない減速になり、登れる距離が
 * 弾く力に対して単調でなくなった。0 にすると減速は g・sinθ ちょうどになる。
 */
export const COIN_FRICTION = 0;
export const COIN_FRICTION_STATIC = 0;
export const COIN_DENSITY = 0.004;
/**
 * コインの回転は物理では持たない(慣性モーメント無限大の「パック」)。
 * 転がりを剛体で解くと、穴の縁に当たったときのスピンと並進の交換が
 * 支配的になり、結果が初速に対して単調でなくなる。
 * 見た目の回転は進んだ距離から描画側で作るので、絵は何も変わらない。
 */
export const COIN_LOCK_SPIN = true;

/** ストッパーに触れていてこの速さを下回ったら「構え」に入る (px/s) */
export const REST_SPEED = 26;

// ---------------------------------------------------------------- 弾き

/**
 * 弾く力 = 斜面に沿った初速 (px/s)。
 * 手で決めず、`npm run verify` の掃引結果から逆算する(§5)。
 */
export const P_MIN = 525;
export const P_MAX = 1096;
export const FLICK_COOLDOWN = 0.3; // s
export const LEVER_SWING_TIME = 0.2; // s

// ---------------------------------------------------------------- プランジャー

export const KNOB_REST: Vec2 = { x: 566, y: 1046 };
export const KNOB_R = 44;
/** 指の移動量 */
export const STROKE_FINGER = 240;
/** ノブの見た目の移動量。引ききってもノブが画面内に残るよう指より小さい */
export const STROKE_KNOB = 178;
export const PULL_DEADZONE = 0.04;
/** 離してから戻りきるまで (s) */
export const KNOB_RETURN = 0.13;
/** 掴み領域。ノブより広く取る */
export const GRAB_ZONE: Rect = { x: 330, y: 1000, w: 390, h: 280 };

/** パワーメーター(プランジャー帯の左側) */
export const METER: Rect = { x: 56, y: 1024, w: 78, h: 224 };

// ---------------------------------------------------------------- UI

export const GIVEUP_CENTER: Vec2 = { x: 96, y: 100 };
export const GIVEUP_R = 28;
export const GIVEUP_CANCEL_R = 76;
export const GIVEUP_HOLD = 0.8; // s
export const GUIDE_IDLE_DELAY = 3.0; // s
export const RESULT_INPUT_DELAY = 0.6; // s
/** ボタンの当たり判定を見た目より広げる量 */
export const BUTTON_PADDING = 18;

// ---------------------------------------------------------------- 演出

export const INSERT_ANIM = 1.2; // s
export const FALL_ANIM = 0.9; // s
export const WIN_ANIM = 1.4; // s
export const STAMP_ANIM = 0.6; // s

/** コイン投入口。盤面の右上 */
export const COIN_SLOT_CENTER: Vec2 = { x: 606, y: 96 };
export const COIN_SLOT_SIZE = { w: 116, h: 78 } as const;

// ---------------------------------------------------------------- 難易度

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: { id: 'easy', label: 'やさしい', tag: 'CASUAL', nearHoleSpan: 120 },
  normal: { id: 'normal', label: 'ほんき', tag: 'EXPERT', nearHoleSpan: 163 },
};

// ---------------------------------------------------------------- 色

/**
 * 大人が長く眺めても疲れない、暗色ベースの「据置アーケード筐体」。
 * 濃紺のプレイフィールドに真鍮のレール、要素の意味は色ではなく
 * 形(丸い穴 / 開いた隙間 / 下向きの矢羽根)でも分かるようにする。
 */
export const COLORS = {
  // 画面の外側(レターボックス)
  room: '#0B0D12',
  roomGlow: '#1A2030',

  // 筐体
  shell: '#1C212C',
  shellHi: '#2A3140',
  shellLo: '#11141B',
  bezel: '#C8A15A',
  bezelHi: '#F0D9A0',
  bezelLo: '#8A6C33',
  screw: '#6B7180',

  // プレイフィールド
  field: '#132030',
  fieldDeep: '#0A1220',
  fieldPrint: '#1E3348',
  fieldGlow: '#2C6B8F',

  // レール(真鍮)
  railHi: '#F3D79A',
  rail: '#C9A059',
  railLo: '#7E6130',
  railEdge: '#4A391C',

  // 進める隙間
  gap: '#3DD8C4',
  gapDim: '#1B7F76',

  // アウトの穴
  hole: '#05080C',
  holeRim: '#E2603A',
  holeRimLo: '#8C3418',

  // コイン
  coinHi: '#FFF0BE',
  coinMid: '#E8B54B',
  coinLo: '#9A6C1E',
  coinEdge: '#5C3E0E',

  // あたりの口
  pocket: '#3DD8C4',
  pocketLo: '#166257',

  lever: '#D8DEE9',
  leverLo: '#79808F',

  // 文字と UI
  text: '#E9EEF7',
  textDim: '#8B95A8',
  ink: '#080A0F',
  good: '#3DD8C4',
  weak: '#E8B54B',
  strong: '#E2603A',
  accent: '#F0D9A0',
} as const;

export const LINE_W = 3;

// ---------------------------------------------------------------- メダルの意匠

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

export const ANIMAL_LABELS: Record<AnimalKind, string> = {
  usagi: 'うさぎ',
  kuma: 'くま',
  panda: 'ぱんだ',
  risu: 'りす',
  neko: 'ねこ',
  inu: 'いぬ',
  zou: 'ぞう',
  kirin: 'きりん',
  pengin: 'ぺんぎん',
  raion: 'らいおん',
};
