/**
 * 全チューニング定数と共有型。副作用のない葉ノード。
 *
 * ── ゲームの芯 ────────────────────────────────────────────────
 * 盤面には**ななめ上向きのレーン**が 5 段。重力は画面の下向き。
 * コインはレーンの低い端(壁ぎわ)のストッパーで止まっている。
 * レバーで弾くとレーンを**登り**、重力で減速する。
 *
 * レールはレーンの途中で終わっていて、その先は**ひとつづきの窪み**になっている。
 * 窪みの底からは 2 枚の薄い仕切り(フィン)が立っていて、窪みを 3 つに分ける。
 *
 *   手前のポケット → **落とし穴** → 奥のポケット
 *
 * コインはレールの端から飛び出し、放物線を描いて沈む。
 * どこまで沈まずに飛べたかだけで行き先が決まる。
 *
 * ── 判定は無い ────────────────────────────────────────────────
 * フィンもポケットの底も**本物の実体**で、コインは実際にそこへ落ちて止まる。
 * ゲーム側は「いまコインがどこにいるか」を位置から読むだけで、
 * 落ちる / 落ちないを決めるルールは一切持たない。
 *
 * 飛距離の目安(Δ = レール端からの距離、フィンの頂点の深さ = R):
 *   フィンを越える : v > Δ * sqrt(g cosθ / (2 * R))
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
   * 弾く力の上限。これだけが難易度差。
   *
   * 指のストローク(240px)は変えずに力の幅だけを広げるので、
   * 同じ指の動きでも力が大きく変わる = レバーが敏感になる。
   * 受け皿の並びは難易度によらず同じなので、
   * 「どの段でどのくらい引くか」の感覚はそのまま持ち越せる。
   */
  powerMax: number;
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

export const COIN_R = 26;
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
/**
 * 盤面の下端。トレイが 1 段下のレーンに掛からない段間隔を 5 段ぶん取るため、
 * 操作部を 22% → 16% に削って盤面を 74% → 81% に広げてある。
 */
export const BOARD_BOTTOM = 1074;

export const BOARD_CENTER_X = (BOARD_LEFT + BOARD_RIGHT) / 2;

/** レーンの本数 = 弾く回数。最後の 1 回であたりの口へ落とす */
export const ROW_COUNT = 5;
/**
 * 段どうしの垂直距離(低い端どうし)。
 *
 * 上の段の窪みは `PIT_DEPTH + FLOOR_T` ぶら下がっている。その下を
 * 1 段下のレーンを走るコイン(高さ 2 * COIN_R)が通るので、
 * いちばん狭いところ(レール端の真上)で足りていないといけない。
 * 足りないと、下の段でコインが上の段の窪みに頭をぶつけて挙動が壊れる。
 * 検算 §1 が数値で固定している。
 */
export const ROW_GAP = 176;
/** 1 段目のレーンの低い端の y */
export const ROW_TOP_Y = 180;

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
 * レーンに沿った位置(低い端からの距離 u)で見た構造。
 *
 *   u = 0                低い端。壁がストッパーを兼ね、その横にレバー
 *   [0, RAIL_RUN]        レール(実体)。ここだけが上の床
 *   [RAIL_RUN, レーン長]  **窪み**。深さ PIT_DEPTH の底が一枚続いている
 *
 * 窪みの底からは薄いフィンが 2 枚だけ立っていて、窪みを 3 つに分ける。
 *
 *   [RAIL_RUN, S1]       手前のポケット。届かなかったコイン(弱すぎ)
 *   [S1, S2]             **落とし穴**。底が無い。1 段下へ抜ける
 *   [S2, レーン長]        奥のポケット。飛びすぎたコイン(強すぎ)
 *
 * ── なぜこの形なのか ────────────────────────────────────────
 * ここは 3 度作り直している。壊れ方はどれも同じで、
 * **穴のきわに上を向いた角があると、かすめたコインが上へ弾かれる**。
 * 中心は角より上にあるので跳ね返りは必ず上向きになり、下向きの速さを
 * 失ったコインが滑空して受け皿を 1 つ飛び越す。実測では
 * 仕切りの頂点で 848 → 431 px/s(v⊥ が −380 → +275)、
 * 傾けたトレイの角で 1220 → 42 px/s(v⊥ が −504 → +80)。
 * どちらも「弱く弾いたほうが遠くに入る」飛び地として現れた。
 * 摩擦を足しても(Matter の摩擦は瞬間的な衝突にはほとんど効かない)、
 * 刃の形にしても消えない。**角そのものを飛行経路から下げるしかない。**
 *
 * いまの形では、上を向いた面はフィンの頂点(幅 FIN_T)だけで、
 * それもレール面よりはっきり下にある。しかも
 *
 *   手前のフィンの頂点をかすめる → 前へ押されて穴へ  = 越えたのと同じ
 *   奥のフィンの頂点をかすめる   → 前へ押されて奥へ  = 越えたのと同じ
 *
 * となり、境目のどちら側でも結果が連続する。だから飛距離に対して
 * 弱すぎ → ちょうど → 強すぎ がきれいに 1 回だけ並ぶ。
 *
 * ポケットの底はレーンと平行なので、**傾ける必要がない**。
 * 手前のポケットに落ちたコインは坂を下って背板で止まり、
 * 奥のポケットに落ちたコインは坂を下って奥のフィンの背に当たって止まる。
 * どちらも穴から遠ざかる向きなので、勝手に穴へ入り直すことがない。
 */
export const RAIL_RUN = 290;
/**
 * 窪みの底の深さ(レール面から)。
 *
 * いちばん深いフィンの頂点より、さらにコイン 1 個ぶん以上深いこと。
 * 浅いと、ポケットで止まったコインの中心がフィンの頂点より上に来てしまい、
 * 坂を下る勢いで乗り越えて穴へ入り直す。
 * 必要条件は `PIT_DEPTH > rim(最下段) + 2 * COIN_R`(検算 §1)。
 */
export const PIT_DEPTH = 100;
/** 床の厚み */
export const FLOOR_T = 10;
/** フィンの厚み。上を向いた面はここだけなので、薄いほどよい */
export const FIN_T = 8;

/**
 * フィンの頂点の深さ(レール面から)。**下の段ほど深い。**
 *
 * 深いほどコインは長く落ちてから縁に届くので、同じ飛距離を出すのに
 * 要る初速が下がり、**成功域が速度の幅として狭くなる**。
 * これが「下の段ほど難しい」の主な作り方。
 *
 * ── 2 枚のフィンは必ず同じ深さにすること ──────────────────────
 * 奥のフィンだけ深くすると成功域はもっと狭くなるが、飛び地ができる。
 * コインが手前のフィンの頂点(幅 FIN_T の平らな面)に着地すると、
 * 反発 0 なので**下向きの速度がまるごと消えて**、そこから水平に
 * 撃ち直したのと同じ軌道になる。落ち直す量が足りず、奥のフィンの角を
 * かすめて越えてしまう。実測(奥だけ 10.6 深い段)で、成功域のまん中に
 * 「強すぎ」の島が 23% ぶん空いた。2 枚が同じ深さなら、着地でリセットされた
 * コインは必ず奥のフィンより下に落ちるので島ができない。
 */
export const RIM_BASE = 38;
export const RIM_STEP = 6;

/**
 * 段ごとの落とし穴の位置。**下の段ほど遠くて狭い。**
 *
 * 遠い → 段ごとに要る引き量が変わるので、同じ引き方を 5 回使い回せない
 * 狭い → 下の段ほど精度が要る
 *
 * 手前のポケットの長さ = HOLE_FROM_BASE。ここにコインが収まらないと
 * 背板とフィンのあいだで挟まって詰むので、`2 * COIN_R + FIN_T` より広いこと。
 */
export const HOLE_FROM_BASE = 78;
export const HOLE_FROM_STEP = 13;
export const HOLE_SPAN_BASE = 185;
export const HOLE_SPAN_STEP = 28;
/** 穴の幅の下限。コインが抜けられること(`2 * COIN_R + FIN_T` より広い) */
export const HOLE_SPAN_MIN = 70;

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
 * 摩擦は 0。レールの上では重力の斜面成分だけが効く。
 *
 * Matter の摩擦は物理的なクーロン摩擦ではなく、接線速度が小さいと
 * **その場で速度をまるごと消す**近似が入っている。0.02 でも実測で
 * 2700 px/s^2 という現実にありえない減速になり、飛距離が
 * 弾く力に対して単調でなくなった。
 *
 * 静的ボディの摩擦は Matter が生成時に 1 へ上書きするので、
 * `world.ts` の `setFriction` で入れ直している。
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
 * 手で決めず、`npm run verify` の掃引結果から逆算する。
 * 上限は難易度ごと(`DifficultyConfig.powerMax`)。
 */
export const P_MIN = 400;
export const FLICK_COOLDOWN = 0.3; // s
export const LEVER_SWING_TIME = 0.2; // s

// ---------------------------------------------------------------- プランジャー

export const KNOB_REST: Vec2 = { x: 566, y: 1130 };
export const KNOB_R = 38;
/** 指の移動量 */
export const STROKE_FINGER = 240;
/** ノブの見た目の移動量。引ききってもノブが画面内に残るよう指より小さい */
export const STROKE_KNOB = 96;
export const PULL_DEADZONE = 0.04;
/** 離してから戻りきるまで (s) */
export const KNOB_RETURN = 0.13;
/** 掴み領域。ノブより広く取る */
export const GRAB_ZONE: Rect = { x: 330, y: 1076, w: 390, h: 204 };

/** パワーメーター(プランジャー帯の左側) */
export const METER: Rect = { x: 56, y: 1098, w: 78, h: 168 };

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
export const COIN_SLOT_CENTER: Vec2 = { x: 606, y: 92 };
export const COIN_SLOT_SIZE = { w: 116, h: 78 } as const;

// ---------------------------------------------------------------- 難易度

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: { id: 'easy', label: 'やさしい', tag: 'CASUAL', powerMax: 1550 },
  normal: { id: 'normal', label: 'ほんき', tag: 'EXPERT', powerMax: 2000 },
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
