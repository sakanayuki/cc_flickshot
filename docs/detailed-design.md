# 詳細設計書 —「どうぶつの やまのぼり」

対象リポジトリ: `sakanayuki/cc_flickshot`
上位文書: [`../plan.md`](../plan.md)(要件定義書)

---

## 0. 本書の位置づけと読み方

### 0.1 2つの文書の役割

| 文書 | 役割 | 変更してよい人 |
|---|---|---|
| `plan.md` | **要件定義書**。発注者と合意した「何を作るか」 | 発注者の承認が必要 |
| `docs/detailed-design.md`(本書) | **詳細設計書**。「どう作るか」の確定仕様 | 実装者。ただし §0.4 の裁量範囲内に限る |

**実装者は本書だけを見て実装できる。** 座標・定数・型・関数シグネチャはすべて確定値で書かれており、設計判断を挟む必要はない。plan.md は背景と意図を理解したいときに読む。

### 0.2 数値の優先順位

**具体的な数値が plan.md と本書で食い違う場合、本書を正とする。**
plan.md の数値は要件検討時の目安であり、本書で物理的な検算を行った結果、一部を変更している(§0.3)。

### 0.3 plan.md から変更した点と理由

| # | plan.md の記述 | 本書での確定値 | 変更理由 |
|---|---|---|---|
| 1 | 盤面は画面上部**約70%**(≒896px) | 盤面は **y=40..750**(710px、約55%) | ストローク450pxと両立しないため。§2.3 |
| 2 | プランジャーのストローク**450px** | **指の移動量450px / ノブの見た目の移動量380px** に分離 | 指450pxを維持したままノブを画面内に収めるため。§6.3 |
| 3 | レーンの傾き **約8°** | **5.10°**(レーン長450pxに対し落差40px) | 8°では落差が81pxとなり段間距離105pxを超え、跳躍量が破綻するため。§3.2 |
| 4 | 難易度で**弾き力の適正範囲**を変える | 弾き力の範囲は**両難易度共通**。難易度差は穴・ゴール口・リップの5パラメータのみ | 難易度を切り替えたときに指の感覚が変わると3歳児が混乱するため。§7.1 |
| 5 | 「ひっぱってね」矢印を**初回だけ**表示 | **未操作2秒ごとに毎回**表示 | 発注者の追加指示。3歳児はひらがなを読めないため指アイコンで伝える。§8.5 |
| 6 | 弾きゾーンは**コイン直径の約3倍**(168px) | **135px**(約2.4倍) | 168pxではゾーンがシャフトの外(上の段の真下)に及び、そこから弾いても上の段の裏面に当たるだけで無意味なため。§6.5 |

### 0.3.1 実装して判明した変更(実機で動かした結果)

設計時の計算では見えず、**実際に物理を回して初めて分かった**問題とその対処。
数値はすべて `npm run verify` と `npm test` が守っている。

| # | 問題 | 対処 | 参照 |
|---|---|---|---|
| 1 | **弾き角 20° では成功域がストロークの 2% しかなかった。** シャフトの上は「2段上のレーンの裏面」で塞がれており、角度が浅いとコインが次の段の先端を越える前に天井にぶつかって戻される。放物線の計算だけでは見えない | 弾き角を **26°** に変更。全段で成功域 73% の連続区間になる | §6.5, §12 |
| 2 | **レーンの先端に当たり判定がなく、コインがレーンをすり抜けた。** 先端より外側で高さ判定を通過したコインが、その後レーンの範囲に入っても着地扱いにならなかった | レーン先端に垂直な当たり判定を追加(ゴールのリップと同じ扱い) | §4.3(a0) |
| 3 | **ふつうで、一度も弾く前にコインが穴に落ちた。** 落下閾値を「レーン全長を転がった速度(322)」で決めていたが、穴は 85% 地点にあり、そこではまだ 272 px/s しか出ていなかった | 投入されたコインにシュートを滑り降りた初速 **220 px/s** を与える。あわせて ふつう の落下閾値を 280 に | §4.2, §7.1, §8.4 |
| 4 | **ふつうで、ほどほどの強さで弾くたびに毎回1段下へ転落した。** 転落閾値 520 に対し、弾きに成功した着地後の転がりが 552 に達していた | 転落閾値を **650** に。引きすぎ(pull 0.77 以上)のときだけ転落する | §5.4, §7.1 |
| 5 | **レバー端に静止したコインが筐体の外にはみ出して見えた。** レーンのレバー端を壁の上に置いていたため、コインの中心が壁の位置に来ていた | 壁をコイン半径ぶん外側に置き直した(`BOARD_LEFT = LANE_END_LEFT - COIN_R`)。物理の成功域には影響なし | §2.3, §12 |
| 6 | ゴールのバスケット幅が弾き角の変更で合わなくなった | やさしい 260 / ふつう 300 に再調整 | §3.5, §7.1 |

**教訓: 幾何の計算が正しくても遊べるとは限らない。** 本書 §13.5 の検算スクリプトは、
この経験から「放物線を解く」方式をやめ、**実際の物理を回して測る**方式に変えてある。

### 0.4 発注者の追加確定事項(本書で初めて確定)

| 論点 | 決定 | 実装箇所 |
|---|---|---|
| 下段への転落 | 難易度で分ける。やさしい=転落なし / ふつう=転落あり | §5.4 |
| ゴール判定 | 両難易度とも外れることがある。外れても即失敗にはせず段5に戻る | §5.3 |
| 操作ガイド | 未操作2秒ごとに指アイコンをループ表示、触れたら消える | §8.5 |

### 0.5 実装者の裁量範囲

以下は本書の指針の範囲内で自由に決めてよい。**これ以外の仕様変更は発注者の確認が必要。**

- どうぶつ・山・雲などの具体的な描画形状(§9 のパレットと方針に従うこと)
- 演出のイージング関数、および演出時間の ±50%
- 内部実装の書き方(本書のシグネチャを満たす限り)
- §12 の定数の最終値(§7.4 のチューニング手順に従って調整すること)

---

## 1. 全体アーキテクチャ

### 1.1 依存方向

```
                    main.ts
                      │  (シーンマシン + メインループ)
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
  scenes/title   scenes/game   scenes/result
        │             │             │
        │             ▼             │
        │      game/{board,coin,plunger,levers}
        │             │             │
        └─────────────┼─────────────┘
                      ▼
        render/{layout,drawings,particles}   save.ts   config.ts
```

- **下位は上位を参照しない。** `game/` と `render/` はシーンを知らない。
- `config.ts` はすべてから参照される葉ノード。副作用を持たない純粋な定数のみ。
- `game/` はキャンバスに触れない(描画は `render/` とシーンが行う)。これによりゲームロジックが Vitest でヘッドレスにテストできる。

### 1.2 メインループ

固定タイムステップ + アキュムレータ方式。

```ts
const FIXED_DT = 1 / 60;
const MAX_FRAME = 0.25;      // タブ復帰時のスパイラル防止
let acc = 0, prev = performance.now() / 1000;

function frame(nowMs: number) {
  const now = nowMs / 1000;
  acc += Math.min(now - prev, MAX_FRAME);
  prev = now;
  while (acc >= FIXED_DT) { sceneManager.update(FIXED_DT); acc -= FIXED_DT; }
  sceneManager.render(ctx);
  requestAnimationFrame(frame);
}
```

`update` には常に `FIXED_DT` を渡す。**可変 dt を物理に渡してはならない**(挙動が端末依存になり、3歳児向けの「毎回同じ結果」が壊れる)。演出用の経過時間も同じ `update` 内で加算する。

---

## 2. 座標系とレイアウト

### 2.1 論理座標系

全描画・全当たり判定は **720 × 1280(9:16)の論理座標**で行う。y は下向きが正。

### 2.2 実画面へのフィット

```ts
// render/layout.ts
export const LOGICAL_W = 720;
export const LOGICAL_H = 1280;

export interface Viewport { scale: number; offsetX: number; offsetY: number; }

export function computeViewport(cssW: number, cssH: number): Viewport {
  const scale = Math.min(cssW / LOGICAL_W, cssH / LOGICAL_H);
  return {
    scale,
    offsetX: (cssW - LOGICAL_W * scale) / 2,
    offsetY: (cssH - LOGICAL_H * scale) / 2,
  };
}
```

- リサイズ時・`orientationchange` 時に再計算する。
- Canvas の実ピクセルサイズは `cssW * dpr` × `cssH * dpr`(`dpr = Math.min(devicePixelRatio, 3)`。3で頭打ちにするのは高DPR端末での塗り面積爆発を防ぐため)。
- 描画開始時に `ctx.setTransform(dpr*scale, 0, 0, dpr*scale, dpr*offsetX, dpr*offsetY)` を1回だけ適用する。以降は論理座標のまま描ける。
- レターボックスの余白は `COLORS.sky` で塗る。
- **ポインタ座標の逆変換**(全入力処理で使用):
  ```ts
  export function toLogical(e: PointerEvent, canvas: HTMLCanvasElement, vp: Viewport) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - vp.offsetX) / vp.scale,
             y: (e.clientY - r.top  - vp.offsetY) / vp.scale };
  }
  ```

### 2.3 ゲーム画面の領域割り(720×1280)

| 領域 | 矩形(論理座標) | 備考 |
|---|---|---|
| 盤面(枠の内側) | x ∈ [60, 660], y ∈ [40, 750] | 幅600 × 高さ710 |
| 盤面の枠線 | 上記を太さ10で囲む | 見た目のみ、当たり判定は内側 |
| あきらめるボタン | 中心 (128, 132), 半径 44 | 盤面の空領域に重ねて描く |
| 難易度表示 | 中心 (596, 132) | 「やさしい」/「ふつう」の小さなラベル |
| プランジャー帯 | y ∈ [760, 1280] | |
| ノブ静止位置 | 中心 (560, 830), 半径 70 | 最下位置は中心 (560, 1210) |
| 掴み領域 | x ∈ [390, 720], y ∈ [755, 985] | ノブより広い。3歳児が掴みやすいように |
| コイン投入口 | 中心 (185, 900), 幅 130 × 高さ 90 | |
| 投入チューブ | (185,900) → (150,702) の曲線 | 投入アニメの経路。§8.4 |

**盤面の底(y=750)とノブ上端(y=760)の間が10px** で、余白なくぴったり収まる。この配置は §6.3 のストローク計算と連動しているので、盤面高さを変更する場合はノブ静止位置も同時に見直すこと。

---

## 3. 盤面の幾何

### 3.1 設計の中心にある考え方

盤面の座標は「見た目で決めて後から物理を合わせる」のではなく、**5つの跳躍がすべて同一条件になるように逆算して決めている**。

具体的には、どの段からでもコインが次の段(またはゴール)に到達するために必要な運動が
**「横に150px流れる間に145px上昇する」** で完全に一致する。これにより:

- 弾き力の適正範囲が段によってばらつかない → 3歳児が同じ感覚で全段を登れる
- チューニング定数が `P_MIN`/`P_MAX` の2つで済む → 調整が破綻しない

**この均一性は本ゲームの手触りの根幹である。座標を動かす場合は必ず均一性を保つこと。**

### 3.2 レーン(5段)

- 段数 5、段間 **105px**、レーン長 **450px**、落差 **40px**、傾き **5.10°**
- レバーは段1が右、段2が左、…と交互(ジグザグ)
- **高い側の端は、反対側の壁から150px手前で終わる。** この150pxの隙間が「シャフト」であり、コインが弾き上げられて通る通路になる。これがないと弾かれたコインは上の段の裏面に必ず衝突し、先へ進めない(実機も同じ構造)

| 段 | レバー側 | 高い端 (x, y) | 低い端=レバー (x, y) |
|---|---|---|---|
| 1 | 右 | (210, 702) | (660, 742) |
| 2 | 左 | (510, 597) | (60, 637) |
| 3 | 右 | (210, 492) | (660, 532) |
| 4 | 左 | (510, 387) | (60, 427) |
| 5 | 右 | (210, 282) | (660, 322) |

シャフト: 右シャフト x ∈ [510, 660]、左シャフト x ∈ [60, 210]。

### 3.3 レーン上の位置パラメータ `s`

レーン上の位置は **`s ∈ [0, 1]`(0 = 高い端、1 = レバー端)** で表す。穴の配置もレバーの弾きゾーンもすべて `s` で定義するので、段が左右どちらでも同じ数値が使える。

```ts
// board.ts
export function pointAt(lane: Lane, s: number): Vec2 {
  return { x: lane.hi.x + (lane.lo.x - lane.hi.x) * s,
           y: lane.hi.y + (lane.lo.y - lane.hi.y) * s };
}
```

`s` が増える向き = 下り坂の向き = コインが自然に転がる向き。

### 3.4 穴の配置

**穴は「弾かれたコインが着地する範囲」に置いてはならない**(plan.md §4.6)。検算の結果、着地点は `s ∈ [0.02, 0.55]` に収まるので、穴は `s ≥ 0.60` の領域にのみ置く。

| 難易度 | 段1 | 段2 | 段3 | 段4 | 段5 | 穴の半径 |
|---|---|---|---|---|---|---|
| やさしい | [0.85] | [0.85] | [0.85] | [0.85] | [0.85] | 25 |
| ふつう | [0.85] | [0.85] | [0.65, 0.87] | [0.65, 0.87] | [0.65, 0.87] | 34 |

穴の中心は `pointAt(lane, s)`。判定は §5.1。

### 3.5 ゴール(山頂のバスケット)

段5のレバー (660, 322) から弾かれたコインが、**リップを越えてバスケットの床に落ちる**と成功。

| 要素 | 値 |
|---|---|
| リップ(右壁)の位置 | x = 510、上端 y = 177 |
| バスケットの床 | y = 235(水平。傾きなし) |
| バスケットの左端 | やさしい: x = 260 / ふつう: x = 300 |

- リップ上端 (510, 177) は、段5のレバーから **横150px・上145px** — 他の4つの跳躍と完全に同一条件。
- バスケットの床 (y=235) は段5の表面(x=400 付近で y≒299)より64px高い位置にあり、山頂の台座の上に乗っているように見える。

**ゴールを外す2つのパターン(どちらも失敗ではなく段5に戻るだけ):**

1. **弱すぎる** — リップを越えられずリップの右面に当たる → 跳ね返って段5に落下、レバー側へ転がる
2. **強すぎる**(主にふつう) — バスケットの左端を越えて着地 → 段5の表面に落下、レバー側へ転がる

### 3.6 検算結果(実シミュレーション)

`npm run verify` が **実際の物理を回して**測った値。理論値ではない。

| 区間 | 成功域 | 前進に必要な最小 power | 連続区間 |
|---|---|---|---|
| 段1→段2 〜 段4→段5 | 73% | 915 (pull 0.27) | 915〜1700(途切れなし) |
| 段5→ゴール(やさしい) | 73% | 915 (pull 0.27) | 915〜1700(途切れなし) |
| 段5→ゴール(ふつう) | 47% | 915 (pull 0.27) | 1155〜1495(1箇所途切れ) |

- **どの段からでも `pull ≥ 0.27` で前進できる。** 5段すべてで閾値が一致する(§3.1 の均一性)
- やさしいは「弱すぎ」でしか外れない。ふつうは「強すぎ」でも外れる
- ふつうのゴールには pull 0.43〜0.49 付近に狭い死角がある。天井に当たる軌道と当たらない軌道の境目で着地点が一度だけ戻るために生じるもので、実害は小さいと判断してそのままにしている

穴まわりの速度(これも実測):

| 場面 | 穴を通過するときの速度 | やさしい(閾値230) | ふつう(閾値280) |
|---|---|---|---|
| 投入直後の転がり | 323〜345 | 通過 | 通過 |
| 弱い弾きで戻ってきた | 255 | 通過 | **落ちる** |
| 弾きに成功して着地後 | 515〜518 | 通過 | 通過 |

**「投入直後に落ちない」ことは 1 割以上の余裕をもって成立していなければならない。**
ぎりぎりにすると、少しの調整で「一度も弾く前に落ちる」状態に戻ってしまう(§0.3.1 の 3)。

## 4. 物理モデル

### 4.1 コインの状態機械

```
                    ┌──────────┐
   投入アニメ ────▶ │  onLane  │ ◀────────┐
                    └────┬─────┘          │
              弾かれる   │                │ 着地
                        ▼                │
                    ┌──────────┐          │
                    │ airborne │──────────┘
                    └────┬─────┘
        穴に落ちる  │    │  ゴール床に着地
              ┌─────┘    └─────┐
              ▼                ▼
        ┌──────────┐     ┌──────────┐
        │ falling  │     │   goal   │   (どちらも演出後リザルトへ)
        └──────────┘     └──────────┘
```

```ts
export type CoinState = 'onLane' | 'airborne' | 'falling' | 'goal';

export interface Coin {
  state: CoinState;
  laneIndex: number;   // onLane のとき有効(0..4)
  s: number;           // onLane のとき有効
  vs: number;          // onLane: レーン接線方向の速度(+ = 下り方向)
  pos: Vec2;           // airborne / falling / goal のとき有効
  vel: Vec2;           // airborne のとき有効
  timer: number;       // falling / goal の演出経過秒
}
```

半径 `COIN_R = 28`。**位置はすべてコインの中心**で扱う。レーン上にいるコインの中心は、レーン表面から法線方向に `COIN_R` だけ浮いている。

### 4.2 `onLane` の更新

```
a  = g·sin(θ) − k·vs          θ = 5.10°, k = ROLL_DAMPING = 0.35
vs += a·dt
s  += vs·dt / LANE_LEN        LANE_LEN = 450
```

- `g·sin(θ) = 195.6 px/s²`、終端速度 `= 195.6/0.35 = 559 px/s`
- **減衰係数 `k` は小さめ(0.35)に設定している。** 大きくすると全てのコインが終端速度に収束してしまい、「速く転がっているコインは穴を飛び越える」という §5.1 のゲーム性が成立しなくなる。**k を上げてはならない。**
- `s > 1`(レバー端の壁に到達): `s = 1`, `vs = 0` で停止。ただし ふつう の転落判定あり(§5.4)
- `s < 0`(高い端から飛び出す): レーンの高い端は空中に突き出しているので `airborne` に遷移。速度は接線方向をそのまま直交分解して引き継ぐ

参考値(検算済み):

| 状況 | レバー端に到達したときの速度 |
|---|---|
| 静止から450px転がる | 322 px/s |
| 弱い弾きで戻ってきた場合(225px転がる) | 247 px/s |
| 成功した弾きで着地(480 px/s)し250px転がる | 493 px/s |

この差が難易度パラメータ `FALL_SPEED`(§7.1)の設計根拠になっている。

### 4.3 `airborne` の更新

```
vel.y += g·dt
pos   += vel·dt
```

空気抵抗なし。以下の順に衝突を判定する(**この順序を守ること**)。

#### (a0) レーンの先端 — シャフト側から入ってくる場合

コインがレーンの高い端の x を横切るとき、そのレーン表面からの距離が `COIN_R` 未満なら、
先端に当たったものとして跳ね返す(ゴールのリップと同じ扱い)。

**これがないとコインがレーンをすり抜ける。** 着地判定は「距離が `COIN_R` を上から下へ横切った
瞬間」しか見ないので、その瞬間がレーンの範囲外(シャフトの中)で起きると着地にならず、
そのままレーンの範囲へ入ってきても、もう二度と判定されないため。

#### (a) レーン表面への着地 — 上から交差した場合のみ

各レーンについて、前フレームの中心 `p0` と今フレームの中心 `p1` を、そのレーンの**法線方向の符号付き距離**に変換する。距離が `+COIN_R` 以上から `+COIN_R` 未満に変化し、かつ x が当該レーンの範囲内であれば着地。

```
着地時: laneIndex ← そのレーン, s ← 交点の s,
        vs ← vel を接線方向へ射影した成分,
        法線方向の速度は破棄(バウンドさせない), state ← 'onLane'
```

**バウンドさせないのは意図的である。** 3歳児が結果を予測できるようにするため。跳ね返りを入れてはならない。

#### (b) レーン裏面への衝突 — 下から突き上げた場合

`vel.y < 0`(上昇中)でレーンの下面に当たった場合:

```
vel.y ← 0      (水平速度 vel.x はそのまま維持)
```

**これは本ゲームで最も重要な「優しさ」の仕組みである。** 強く弾きすぎたコインは上の段の裏面に当たって垂直方向の勢いを失い、水平に流れながら落ちて、結局ひとつ上の段に着地する。つまり **強すぎる弾きが失敗にならない**(plan.md §4.6 の要件が、特別な救済処理なしに物理から自然に導かれる)。跳ね返りや減速を加えてはならない。

#### (c) 側壁(x = 60 / 660)

```
vel.x ← −vel.x × WALL_RESTITUTION   (= 0.5)
pos.x ← 壁からCOIN_Rだけ内側に押し戻す
```

#### (d) 天井(y = 40)

```
vel.y ← 0        (vel.x はそのまま)
pos.y ← 40 + COIN_R
```

裏面衝突と同じ扱い。

#### (e) ゴールのリップ(x = 510, y ∈ [177, 235])

垂直な壁として `(c)` と同じ反射。ここで跳ね返ったコインは段5に落ちる = ゴール失敗(弱すぎ)。

#### (f) ゴールの床(y = 235, x ∈ [左端, 510])

上から交差したら `state ← 'goal'`。

### 4.4 `falling` / `goal`

どちらも物理を止め、`timer` を進めるだけの演出状態。

- `falling`: 穴の中心へ向かって縮小しながら吸い込まれる。`FALL_ANIM = 1.0s`
- `goal`: バスケットの中で軽く弾んで静止。`GOAL_ANIM = 1.5s`

演出終了でシーンがリザルトへ遷移する(§8.4)。

---

## 5. 判定ロジック

### 5.1 穴の判定

**`onLane` のコインのみが対象**(空中のコインは穴の上を素通りする)。

```ts
export function checkHole(coin: Coin, lane: Lane, holes: Hole[], fallSpeed: number): Hole | null {
  if (coin.state !== 'onLane') return null;
  for (const h of holes) {
    const dist = Math.abs(coin.s - h.s) * LANE_LEN;   // レーンに沿った距離(px)
    if (dist <= h.radius && Math.abs(coin.vs) < fallSpeed) return h;
  }
  return null;
}
```

判定は「穴の範囲内にいる」かつ「**転がる速度が `FALL_SPEED` 未満**」。速ければ勢いで飛び越える。

この2条件の組み合わせが本ゲームのゲーム性そのものである:

- 適正な力で弾かれたコインは着地後も速い(≒493 px/s)ので穴を飛び越える
- 弱い弾きで届かず戻ってきたコインは遅い(≒247 px/s)ので落ちやすい

### 5.2 段5のレバーとゴールの関係

段5のレバーで弾かれたコインは、**次のレーンが存在しない**ので、必ず次のいずれかになる:

1. リップを越えてバスケットの床に着地 → **ゴール**
2. リップに当たって跳ね返る → 段5に落下(弱すぎ)
3. バスケットの左端を越えて着地 → 段5に落下(強すぎ)

### 5.3 ゴールを外したコインの扱い

**外れても即リザルトにはしない。** コインは段5に落ちてレバー端へ転がり戻り、プレイヤーは何度でも再挑戦できる。ただし段5にも穴があるので、転がり戻る途中で穴に落ちる可能性はある — これがゴール前の緊張感になる。

### 5.4 転落(ふつうのみ)

レバー端の直前にリップ(小さな段差)があり、その先に下の段へ通じる落とし溝がある構造にする。

```ts
// s >= 1 に到達したとき
if (difficulty.lipEscapeSpeed !== null && coin.vs > difficulty.lipEscapeSpeed && laneIndex > 0) {
  // リップを飛び越えて下の段へ落ちる
  coin.state = 'airborne';
  coin.pos = レバー端の少し外側;
  coin.vel = { x: 外向き, y: 0 };       // 下の段に自然落下する
} else {
  coin.s = 1; coin.vs = 0;              // 壁で停止(通常)
}
```

| 難易度 | `lipEscapeSpeed` | 挙動 |
|---|---|---|
| やさしい | `null` | リップが高く、絶対に転落しない |
| ふつう | 520 | リップが低く、速く転がりすぎると1段下へ落ちる |

- **段1では転落しない**(下に段がないため。`laneIndex > 0` の条件)
- 転落先は下の段の**レバー端付近**なので、失うのは1段分だけ。即失敗ではない
- 参考: 静止から450px転がると322 px/s なので、通常の転がりでは転落しない。着地直後の高速状態(493 px/s)から更に加速した場合にのみ発生する

---

## 6. プランジャーとレバー

### 6.1 入力の取り扱い

Pointer Events のみを使う(Touch/Mouse を個別実装しない)。

```
pointerdown  → 掴み領域(§2.3)内なら setPointerCapture、grabY = 論理y、掴み状態へ
pointermove  → pull = clamp((論理y − grabY) / STROKE_FINGER, 0, 1)
pointerup    → 発射(pull >= PULL_DEADZONE のとき)、掴み解除
pointercancel→ pointerup と同じ扱い(発射する)
```

- `setPointerCapture` により、指が掴み領域や Canvas の外に出ても追従できる。**必須。** 3歳児のドラッグは必ずはみ出す
- **`pull` は下方向の変位(dy)のみで決まり、横方向の移動は完全に無視する。** 3歳児のドラッグは大きく蛇行するため、横ブレを無視することが「シビアな操作を減らす」要件の実装手段のひとつである
- 上方向に戻した場合は `pull` も戻る(0でクランプ)
- `pointercancel` でも発射するのは、iOS でシステムジェスチャに割り込まれたときに操作が無かったことになるのを防ぐため

### 6.2 HTML / CSS 側の必須設定

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
```

```css
html, body { margin: 0; height: 100%; overflow: hidden; background: #8FD3F4; }
canvas {
  display: block;
  touch-action: none;          /* ドラッグでスクロール/ズームさせない。必須 */
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none; /* iOS の長押しメニュー抑止 */
}
```

### 6.3 ストローク — 指とノブの分離

| 項目 | 値 |
|---|---|
| `STROKE_FINGER`(`pull` を決める指の移動量) | **450px** |
| `STROKE_KNOB`(ノブの見た目の移動量) | **380px** |

ノブ静止位置 y=830 から指が画面下端 y=1280 まで動くと、ちょうど 450px。ノブは y=830 → 1210 に留まり画面内に収まる。終盤で指がノブよりわずかに先行するが、ゲームUIでは一般的な手法で体感上は気づかれない。

```ts
knobY = KNOB_REST_Y + pull * STROKE_KNOB;
```

**指450pxを削ってはならない。** 発注者の「シビアな操作を減らすため引っ張れる長さを長めに確保」という要件の核である。

### 6.4 `pull` → 弾き力

```ts
export function pullToPower(pull: number): number {
  return P_MIN + (P_MAX - P_MIN) * pull;      // P_MIN = 620, P_MAX = 1700
}
```

- `pull < PULL_DEADZONE`(0.05)のときは**発射せず**、ノブが戻るだけ。誤タップで空撃ちさせないため
- `P_MIN`/`P_MAX` は**両難易度共通**。§0.3 の変更点4を参照

### 6.5 発射とレバー

発射時、**5段すべてのレバーが同時に**はたき上げアニメーションを行う(0.2秒)。実際にコインへ作用するのは、コインが弾きゾーン内にいる段のレバーだけ。

```ts
export interface FlickZone { laneIndex: number; sMin: number; sMax: number; }
// 全段共通: sMin = 0.70, sMax = 1.0  (レバー端から 135px ぶん = コイン直径の約2.4倍)
```

弾きゾーンの条件:

```ts
export function canFlick(coin: Coin, zone: FlickZone): boolean {
  return coin.state === 'onLane'
      && coin.laneIndex === zone.laneIndex
      && coin.s >= zone.sMin && coin.s <= zone.sMax;
}
```

- **`onLane` のコインのみが対象。** 空中のコインは弾かれない(タイミングゲーにしないため)
- 弾きゾーンは `s ∈ [0.70, 1.0]` = レーン上の135px分と広く取ってある。**狭くしてはならない。** これも「シビアな操作を減らす」要件の実装手段である

> **plan.md §4.4 は弾きゾーンを「コイン直径の約3倍(=168px)」としていたが、幾何的に成立しないため135pxに縮めている。**
> `s < 0.667` はシャフト(x ∈ [510,660])の外、つまり**上の段の真下**にあたる。そこから弾いたコインは上の段の裏面に当たるだけで前に進めないため、ゾーンを広げても意味がない。シャフト幅150pxに少し余裕を持たせた135pxが実質的な上限である。
>
> なお、**弾きゾーンの幅はこのゲームではほとんど体感に影響しない。** コインは必ずレバー端の壁(`s = 1.0`)で停止するので、プレイヤーが弾くときコインは常に `s = 1.0` にいる。ゾーン幅が効くのは「転がり込んでくる途中で弾いたとき」だけであり、タイミングを要求される場面はそもそも存在しない。「シビアな操作を減らす」要件は、ゾーン幅よりも**ストローク450px(§6.3)・横ブレの無視(§6.1)・成功域74%(§3.6)**によって実現されている。
>
> 参考: `s = 0.8` の位置(壁から90px手前)から弾く場合、必要初速は `s = 1.0` からより大きくなる(横に流れられる距離が短いのに必要な上昇量はほぼ同じため)。届かなかったコインは上の段の先端付近に当たって同じ段に落ちるだけで、失敗にはならない。

弾き時に与える速度:

```ts
const angle = FLICK_ANGLE_DEG * Math.PI / 180;   // 20°
const inward = (lane.lo.x > lane.hi.x) ? -1 : +1;  // レバーが右端なら内向き = 左
coin.state = 'airborne';
coin.pos   = pointAt(lane, coin.s) + 法線方向に COIN_R;
coin.vel   = { x: inward * power * Math.sin(angle), y: -power * Math.cos(angle) };
```

### 6.6 クールダウン

レバー作動後 `FLICK_COOLDOWN = 0.3s` は再発射不可。この間 `pointerdown` は受け付けるが `pull` は 0 のまま。UIに表示は出さない(3歳児に理解できない情報は出さない)。

---

## 7. 難易度

### 7.1 パラメータ表(確定値)

```ts
export interface DifficultyConfig {
  id: 'easy' | 'normal';
  label: string;
  holeS: number[][];          // [段1..段5] それぞれの穴の s 座標
  holeRadius: number;         // px
  fallSpeed: number;          // px/s。これ未満で穴に落ちる
  goalBasketLeft: number;     // px。バスケットの左端 x
  lipEscapeSpeed: number | null;  // null = 転落なし
}
```

| パラメータ | やさしい | ふつう | 効き方 |
|---|---|---|---|
| `holeS` 段1,2 | `[0.85]` | `[0.85]` | |
| `holeS` 段3,4,5 | `[0.85]` | `[0.65, 0.87]` | 上の段ほど危険になる |
| `holeRadius` | 25 | 34 | 穴の当たり幅 |
| `fallSpeed` | 230 | 280 | 大きいほど落ちやすい |
| `goalBasketLeft` | 260 | 300 | 小さいほどゴールが広い |
| `lipEscapeSpeed` | `null` | 650 | 転落の有無 |

**弾き力(`P_MIN`/`P_MAX`)・ストローク・弾きゾーン・穴以外の盤面形状は両難易度で共通。**

### 7.2 数値の設計根拠

- `fallSpeed`: 弱い弾きで戻ったコインは 255 px/s で穴を通る。やさしい(230)なら通過、ふつう(280)なら落ちる。投入直後(323〜345)と弾きに成功した着地後(515〜518)は、どちらの難易度でも必ず通過する
- `goalBasketLeft`: §3.6 の表のとおり、やさしいは 73%、ふつうは 47% がゴールする
- `lipEscapeSpeed = 650`: 弾きに成功した通常の着地(最大 552 px/s)では起きず、pull 0.77 以上の引きすぎのときだけ1段下へ転落する

### 7.3 期待されるプレイ

| 難易度 | 想定 |
|---|---|
| やさしい | pull を適当に引いても 0.27 以上ならほぼ登れる。失敗は「ほとんど引かなかった」ときだけ。3歳児が5回中4回以上ゴールできる |
| ふつう | 穴が増え・広がり・落ちやすく、転落もあり、ゴールも強すぎると外れる。大人が3回に1回程度ゴールできる |

### 7.4 チューニング手順(実装後に必ず実施)

本書の数値は解析計算に基づく初期値である。実装後、次の手順で調整する。

1. デバッグ表示(`?debug=1` で有効化)に **現在の段・`s`・`vs`・直前の `pull`** を出す
2. **やさしい**: `pull` をランダムに引いて20回プレイし、ゴール率が80%以上か確認。低ければ `fallSpeed` を下げる → それでも足りなければ `holeRadius` を下げる
3. **ふつう**: 大人が狙って20回プレイし、ゴール率が25〜40%に収まるか確認。高すぎれば `fallSpeed` を上げる → `holeRadius` を上げる → `goalBasketLeft` を上げる、の順に効かせる
4. **`P_MIN`/`P_MAX`・レーン座標・`ROLL_DAMPING` は最後の手段。** これらを動かすと §3.1 の均一性と §3.6 の検算が崩れるので、変更した場合は検算(§13.5)を再実行し §3.6 の表を更新すること
5. **必ず実機のスマートフォンで確認する。** デスクトップのマウス操作では `pull` の感覚が全く異なる

---

## 8. 画面仕様

### 8.1 シーン遷移

```
        ┌─────────┐  難易度ボタン  ┌────────┐
        │  Title  │ ─────────────▶ │  Game  │
        └─────────┘                └───┬────┘
             ▲                         │ 穴 / ゴール / あきらめる
             │  「さいしょから」        ▼
             │                    ┌─────────┐
             └────────────────────│ Result  │
                                  └────┬────┘
                                       │ 「もういちど」(同じ難易度)
                                       └──▶ Game
```

```ts
export type SceneId = 'title' | 'game' | 'result';
export interface Scene {
  enter(params: unknown): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D): void;
  onPointer(ev: PointerEvent, p: Vec2): void;
  exit(): void;
}
```

シーン遷移は次フレームの先頭で行う(`update` の途中で差し替えない)。

### 8.2 タイトル画面

| 要素 | 位置・サイズ | 内容 |
|---|---|---|
| タイトルロゴ | 中心 (360, 230) | 「どうぶつの やまのぼり」+ 山と旗の飾り |
| 「やさしい」ボタン | x ∈ [120, 600], y ∈ [470, 610] | 高さ140。デフォルトで強調(縁が太い・少し大きい) |
| 「ふつう」ボタン | x ∈ [120, 600], y ∈ [650, 790] | 高さ140 |
| スタンプ帳 | x ∈ [60, 660], y ∈ [860, 1200] | 「スタンプ ○こ」+ 5列×2行のスタンプ枠 |

- ボタンは `pointerdown` ではなく **`pointerup` で発火**する(押し間違いに気づいて指をずらせば発火しない)。ただし `pointerdown` した位置とほぼ同じボタン上で離した場合のみ
- ボタンのタップ判定領域は見た目より上下左右に20pxずつ広い
- スタンプ枠は10個固定表示。獲得済みは色付き、未獲得は薄いグレーの点線枠。11個目以降は枠の右下に「×2」のようなバッジで周回数を出す
- 前回選んだ難易度を記憶しており(§10)、その側のボタンを強調表示する

### 8.3 ゲーム画面のフェーズ

```ts
export type GamePhase = 'insert' | 'play' | 'ending';
```

| フェーズ | 内容 | 入力 |
|---|---|---|
| `insert` | 投入アニメ(1.5s) | 受け付けない(あきらめるも不可) |
| `play` | 操作可能 | プランジャー + あきらめる |
| `ending` | 終了演出中 | 受け付けない |

### 8.4 フェーズの詳細タイムライン

**`insert`(合計1.5秒)**

| 時刻 | 内容 |
|---|---|
| 0.0 – 0.5s | コインが上から投入口へ落ちて、吸い込まれる |
| 0.5 – 0.8s | 機械の中(見えない) |
| 0.8 – 1.5s | 盤面左上のシュートを滑り降りて段1の高い端へ |
| 1.5s | `onLane` として `s = 0`、`vs = INSERT_ENTRY_SPEED` で配置し `play` へ |

**`vs` を 0 にしてはならない。** シュートを滑り降りた勢いを引き継がせないと、
段1の穴に達する時点で 272 px/s にしかならず、ふつうの落下閾値を下回って
「一度も弾く前に落ちる」状態になる(§0.3.1 の 3)。

**`ending`**

| 結果 | 演出 | 長さ |
|---|---|---|
| 穴落ち | コインが穴へ吸い込まれ縮小(`falling`) | 1.0s |
| ゴール | バスケット内で軽く弾み、旗が揺れる(`goal`) | 1.5s |
| あきらめ | 演出なし | 0.0s |

演出終了で `result` シーンへ遷移し、以下を渡す。

```ts
export interface ResultParams {
  outcome: 'goal' | 'hole' | 'giveup';
  reachedLane: number;   // 1..5。到達した最高の段
  difficulty: DifficultyConfig;
  newStampIndex: number | null;  // ゴール時のみ、獲得したスタンプの種類 index
}
```

`reachedLane` は「そのプレイ中にコインが `onLane` になった `laneIndex` の最大値 + 1」を記録し続けて求める。ゴール時は 5 とする。

### 8.5 操作ガイド(未操作2秒で表示)

```
条件: phase === 'play' かつ コインが onLane で静止(|vs| < 5)
      かつ クールダウン中でない かつ 最後のポインタ操作から2.0秒経過
表示: ノブの上に半透明の手アイコン。1.2秒周期で
      「ノブに触れる → 下へ160px引く → フェードアウト → 戻る」をループ
      あわせてノブから下向きの矢印を薄く表示
消去: pointerdown が来た瞬間に即消す(フェードなし)
```

**毎回表示する**(初回のみではない)。3歳児はひらがなを読めないため、この指アニメーションが唯一の操作説明である。文字は併記しない。

### 8.6 あきらめるボタン(長押し1秒)

```
pointerdown がボタン円(中心 (128,132) 半径44)内 →
    holdTimer = 0、進捗リングの描画開始
pointermove で指がボタン中心から 半径 88 より外に出た → キャンセル(holdTimer リセット)
pointerup → キャンセル
holdTimer >= 1.0s → 発動。ending(演出なし)を経て result へ
```

- 進捗リングはボタンの外周を時計回りに1秒かけて一周する。0.2秒経過するまでは描かない(触れただけでリングが出ると誤操作したと感じるため)
- キャンセル判定を半径88(ボタン半径の2倍)と広く取っているのは、3歳児の指が押している間に動くため
- `phase === 'play'` のときのみ受け付ける

### 8.7 リザルト画面

| 要素 | 位置 | 内容 |
|---|---|---|
| 見出し | 中心 (360, 240) | ゴール:「やったね!」/ 穴:「おしい!」/ あきらめ:「またね!」 |
| 到達段の山 | 中心 (360, 560) | 5段の山の絵。到達した段まで旗が立つ |
| スタンプ獲得 | 中心 (360, 830) | ゴール時のみ。「ぺたん!」と押印するアニメ(0.6s) |
| 「もういちど」 | x ∈ [120, 600], y ∈ [980, 1120] | 大。同じ難易度で `game` へ |
| 「さいしょから」 | x ∈ [230, 490], y ∈ [1150, 1240] | 小。`title` へ |

- **どの結果でも責める演出をしない。** 穴落ちは「どうぶつが穴からひょっこり顔を出して笑う」、あきらめは「手を振る」
- ゴール時は紙吹雪パーティクル(§9.4)を上から降らせ続ける
- ボタンは画面表示から0.8秒間は反応しない(演出中の連打で飛ばされないようにするため)

---

## 9. 描画設計

### 9.1 レイヤー順序

**ゲーム画面**(この順に描く):

1. 空グラデーション(背景)
2. 太陽・雲(ゆっくり流れる装飾)
3. 山のシルエット
4. 盤面の枠
5. レーン(木の板)+ レーン端のリップ
6. 穴(+ モグラの待機アニメ)
7. ゴールのバスケット・旗
8. 応援するどうぶつ
9. レバー(5本)
10. コイン
11. 投入口・投入チューブ
12. プランジャー(バネ + ノブ)
13. あきらめるボタン + 進捗リング
14. 操作ガイド(手アイコン)
15. パーティクル

### 9.2 カラーパレット(確定)

```ts
export const COLORS = {
  sky:        '#8FD3F4',
  skyTop:     '#BDE9FF',
  sun:        '#FFE066',
  cloud:      '#FFFFFF',
  mountain:   '#8CC63F',
  mountainHi: '#B5E061',
  mountainSh: '#5FA32A',
  laneTop:    '#D9A05B',
  laneSide:   '#A9713A',
  laneEdge:   '#6B4423',
  lever:      '#E8503A',
  leverDark:  '#B23324',
  hole:       '#4A3520',
  holeRim:    '#2E1F12',
  coinRim:    '#F5C242',
  coinFace:   '#FFF3D0',
  goalPocket: '#F2E9D8',
  flagRed:    '#E8503A',
  ink:        '#3B2A1A',   // 輪郭線・文字
  panel:      '#FFF8EC',   // ボタン・パネルの下地
  panelEdge:  '#3B2A1A',
  accent:     '#FF8A3D',   // 強調(推奨ボタンなど)
  disabled:   '#C9C2B6',
} as const;
```

- 輪郭線は全て `COLORS.ink`、太さ **4px**(論理座標)で統一する。3歳児の視認性のため細くしない
- **色だけで情報を伝えない**。穴は「濃い色の楕円 + 内側に落ち込む影」で形からも分かるようにする

### 9.3 描画関数

`render/drawings.ts` に、状態を持たない純粋な描画関数として置く。すべて論理座標を受け取る。

```ts
export function drawSky(ctx: Ctx): void;
export function drawMountain(ctx: Ctx, t: number): void;
export function drawBoardFrame(ctx: Ctx): void;
export function drawLane(ctx: Ctx, lane: Lane, hasLip: boolean): void;
export function drawHole(ctx: Ctx, center: Vec2, radius: number, moleT: number): void;
export function drawGoalBasket(ctx: Ctx, leftX: number, flagWave: number): void;
export function drawLever(ctx: Ctx, lane: Lane, swing: number): void;   // swing ∈ [-1, 1]
export function drawCoin(ctx: Ctx, center: Vec2, radius: number, animalIndex: number, spin: number): void;
export function drawPlunger(ctx: Ctx, knobY: number, pull: number): void;
export function drawCoinSlot(ctx: Ctx): void;
export function drawInsertTube(ctx: Ctx, coinT: number | null): void;
export function drawGiveUpButton(ctx: Ctx, holdProgress: number): void;   // 0..1
export function drawHandGuide(ctx: Ctx, phase: number): void;             // 0..1 ループ位相
export function drawAnimal(ctx: Ctx, kind: AnimalKind, center: Vec2, size: number, t: number): void;
export function drawStampBook(ctx: Ctx, count: number, origin: Vec2): void;
export function drawStamp(ctx: Ctx, index: number, center: Vec2, size: number, scale: number): void;
export function drawButton(ctx: Ctx, rect: Rect, label: string, emphasized: boolean): void;
export function drawTitleLogo(ctx: Ctx, center: Vec2, t: number): void;
export function drawResultMountain(ctx: Ctx, center: Vec2, reachedLane: number): void;
```

`t` は経過秒(装飾アニメ用)。

### 9.4 パーティクル(紙吹雪)

```ts
// render/particles.ts
export interface Particle { pos: Vec2; vel: Vec2; rot: number; rotVel: number; color: string; life: number; }
export class ParticleSystem {
  emitConfetti(origin: Vec2, count: number): void;
  update(dt: number): void;
  render(ctx: Ctx): void;
  clear(): void;
}
```

- 紙吹雪は小さな矩形。重力 600 px/s²、横揺れは `sin` で表現
- リザルトのゴール時に 0.4秒ごとに20個ずつ、画面上端から降らせる
- 同時存在数の上限 **300**。超えたら古いものから消す(低スペック端末での fps 低下防止)

### 9.5 どうぶつの描画方針

10種類(うさぎ、くま、ぱんだ、りす、ねこ、いぬ、ぞう、きりん、ぺんぎん、らいおん)を、**円・楕円・角丸矩形の組み合わせ + `COLORS.ink` の輪郭線**だけで描く。

```ts
export type AnimalKind = 'usagi'|'kuma'|'panda'|'risu'|'neko'|'inu'|'zou'|'kirin'|'pengin'|'raion';
export const ANIMALS: readonly AnimalKind[];   // 上記の順。スタンプの付与順と一致させる
```

共通の顔ベース(輪郭円 + 目 + 鼻 + 口)を1つの関数にまとめ、耳・角・くちばしなど種別ごとのパーツだけを分岐する。外部画像は使わない。

---

## 10. データとストレージ

```ts
// save.ts
export interface SaveData {
  stampCount: number;              // 累計ゴール回数
  lastDifficulty: 'easy' | 'normal';
}

export const SAVE_KEY = 'flickshot.save.v1';
export const DEFAULT_SAVE: SaveData = { stampCount: 0, lastDifficulty: 'easy' };

export function loadSave(): SaveData;
export function saveSave(data: SaveData): void;
export function stampIndexFor(nth: number): number;   // nth (1始まり) → ANIMALS の index = (nth-1) % 10
```

- 保存形式は JSON1オブジェクト。獲得したスタンプの種類は `stampCount` から導出できるので、種類の配列は保存しない
- **`localStorage` が使えない環境(プライベートモード、ストレージ無効)でも絶対にクラッシュさせない。** `loadSave` / `saveSave` は全体を `try/catch` で囲み、失敗したらモジュール内の変数だけで動作を継続する
- 読み込んだ JSON が壊れている / 型が違う場合も `DEFAULT_SAVE` にフォールバックする(`stampCount` が数値でない、負の値、などを検査する)
- ゴール時の保存タイミングは **リザルト画面に入った瞬間**。演出の途中でリロードされても記録が残るようにする

---

## 11. モジュールインターフェース

### 11.1 共通型

```ts
// config.ts
export interface Vec2 { x: number; y: number; }
export interface Rect { x: number; y: number; w: number; h: number; }
export interface Lane { index: number; hi: Vec2; lo: Vec2; leverSide: 'left' | 'right'; }
export interface Hole { laneIndex: number; s: number; radius: number; center: Vec2; }
```

### 11.2 `game/board.ts`

```ts
export const LANES: readonly Lane[];                 // 段1..段5(index 0..4)
export function pointAt(lane: Lane, s: number): Vec2;
export function normalAt(lane: Lane): Vec2;          // 上向きの単位法線
export function tangentAt(lane: Lane): Vec2;         // s が増える向きの単位接線
export function signedDistanceToLane(lane: Lane, p: Vec2): number;
export function sAtX(lane: Lane, x: number): number;
export function buildHoles(d: DifficultyConfig): Hole[];
export function goalLip(): { x: number; top: number; bottom: number };
export function goalFloor(d: DifficultyConfig): { y: number; left: number; right: number };
```

### 11.3 `game/coin.ts`

```ts
export interface StepResult {
  landedOnLane: number | null;   // このステップで着地した段(演出用)
  hitHole: Hole | null;
  reachedGoal: boolean;
  fellToLane: number | null;     // 転落した先の段
}
export function createCoin(): Coin;
export function placeOnLaneStart(coin: Coin): void;          // 投入直後の配置
export function stepCoin(coin: Coin, dt: number, d: DifficultyConfig): StepResult;
export function flickCoin(coin: Coin, power: number): boolean;  // 弾けたら true
```

`stepCoin` は Canvas も DOM も参照しない純粋関数にする(Vitest でそのままテストできる)。

### 11.4 `game/plunger.ts`

```ts
export interface PlungerState {
  pull: number;            // 0..1
  knobY: number;
  grabbed: boolean;
  cooldown: number;        // 残り秒
  idleTime: number;        // 最後の操作からの経過秒(操作ガイド用)
}
export function createPlunger(): PlungerState;
export function plungerPointerDown(st: PlungerState, p: Vec2): boolean;  // 掴んだら true
export function plungerPointerMove(st: PlungerState, p: Vec2): void;
export function plungerPointerUp(st: PlungerState): number | null;       // 発射なら power、なければ null
export function updatePlunger(st: PlungerState, dt: number): void;       // ノブの戻り・クールダウン
export function pullToPower(pull: number): number;
```

### 11.5 `game/levers.ts`

```ts
export interface LeverState { swing: number; timer: number; }
export function createLevers(): LeverState[];
export function triggerLevers(levers: LeverState[]): void;    // 全段同時
export function updateLevers(levers: LeverState[], dt: number, pull: number): void;
export function canFlick(coin: Coin, laneIndex: number): boolean;
```

`updateLevers` は、引いている間 `pull` に応じてレバーをわずかに下げ(タメ)、発射後は `timer` で 0.2秒のはたき上げアニメを進める。

---

## 12. `config.ts` の完全な初期値

```ts
// ---- 画面 ----
export const LOGICAL_W = 720;
export const LOGICAL_H = 1280;
export const MAX_DPR   = 3;

// ---- 盤面 ----
// レーンのレバー端。壁はここから COIN_R だけ外側にある
export const LANE_END_LEFT  = 60;
export const LANE_END_RIGHT = 660;
export const BOARD_TOP      = 40;
export const BOARD_BOTTOM   = 750;
export const BOARD_LEFT     = LANE_END_LEFT - COIN_R;    // 32
export const BOARD_RIGHT    = LANE_END_RIGHT + COIN_R;   // 688

export const LANE_COUNT   = 5;
export const LANE_LEN     = 450;   // 高い端 → レバー端の水平距離
export const LANE_DROP    = 40;    // 同区間の落差
export const LANE_GAP     = 105;   // 段間の垂直距離
export const SHAFT_W      = 150;   // 高い端が壁から引っ込む量

// ---- コイン ----
export const COIN_R = 28;

// ---- 物理 ----
export const GRAVITY          = 2200;   // px/s^2
export const ROLL_DAMPING     = 0.35;   // 1/s。上げてはならない(§4.2)
export const WALL_RESTITUTION = 0.5;
export const FIXED_DT         = 1 / 60;

// ---- 弾き ----
export const P_MIN           = 620;     // px/s
export const P_MAX           = 1700;    // px/s
export const FLICK_ANGLE_DEG = 26;      // 鉛直から盤面内側へ。下げてはならない(§0.3.1)
export const FLICK_ZONE_S    = { min: 0.70, max: 1.0 };
export const FLICK_COOLDOWN  = 0.3;     // s

// ---- プランジャー ----
export const KNOB_REST      = { x: 560, y: 830 };
export const KNOB_R         = 70;
export const STROKE_FINGER  = 450;      // 削ってはならない(§6.3)
export const STROKE_KNOB    = 380;
export const PULL_DEADZONE  = 0.05;
export const KNOB_RETURN    = 0.15;     // s。離してから戻りきるまで
export const GRAB_ZONE      = { x: 390, y: 755, w: 330, h: 230 };

// ---- ゴール ----
export const GOAL_LIP_X      = 510;
export const GOAL_LIP_TOP    = 177;
export const GOAL_FLOOR_Y    = 235;

// ---- UI ----
export const GIVEUP_CENTER      = { x: 128, y: 132 };
export const GIVEUP_R           = 44;
export const GIVEUP_CANCEL_R    = 88;
export const GIVEUP_HOLD        = 1.0;   // s
export const GIVEUP_RING_DELAY  = 0.2;   // s
export const GUIDE_IDLE_DELAY   = 2.0;   // s
export const RESULT_INPUT_DELAY = 0.8;   // s

// ---- 演出 ----
export const INSERT_ENTRY_SPEED = 220;  // 投入されたコインがシュートから受け取る初速

export const INSERT_ANIM = 1.5;   // s
export const FALL_ANIM   = 1.0;   // s
export const GOAL_ANIM   = 1.5;   // s
export const STAMP_ANIM  = 0.6;   // s

// ---- 難易度 ----
export const DIFFICULTIES: Record<'easy' | 'normal', DifficultyConfig> = {
  easy: {
    id: 'easy', label: 'やさしい',
    holeS: [[0.85], [0.85], [0.85], [0.85], [0.85]],
    holeRadius: 25, fallSpeed: 230,
    goalBasketLeft: 260, lipEscapeSpeed: null,
  },
  normal: {
    id: 'normal', label: 'ふつう',
    holeS: [[0.85], [0.85], [0.65, 0.87], [0.65, 0.87], [0.65, 0.87]],
    holeRadius: 34, fallSpeed: 280,
    goalBasketLeft: 300, lipEscapeSpeed: 650,
  },
};
```

レーン座標は定数から導出する(手打ちしない。座標を1箇所変えたときの不整合を防ぐため)。

```ts
export const LANES: Lane[] = Array.from({ length: LANE_COUNT }, (_, i) => {
  const leverRight = i % 2 === 0;                       // 段1(i=0)が右
  const loY = BOARD_BOTTOM - LANE_BASE_OFFSET - i * LANE_GAP;   // 段1のレバー端 y = 742
  const hiY = loY - LANE_DROP;
  return leverRight
    ? { index: i, hi: { x: LANE_END_LEFT + SHAFT_W,  y: hiY }, lo: { x: LANE_END_RIGHT, y: loY }, leverSide: 'right' }
    : { index: i, hi: { x: LANE_END_RIGHT - SHAFT_W, y: hiY }, lo: { x: LANE_END_LEFT,  y: loY }, leverSide: 'left'  };
});
```

---

## 13. テスト仕様(Vitest)

描画はテストしない。`game/` と `save.ts` の純粋ロジックのみを対象にする。

### 13.1 `pullToPower`

| 入力 `pull` | 期待値 |
|---|---|
| 0 | 620 |
| 1 | 1700 |
| 0.5 | 1160 |
| 0.263 | ≈904(v_min 以上であること) |

`plungerPointerUp` は `pull = 0.04` で `null`(不発)、`pull = 0.05` で数値を返すこと。

### 13.2 穴の判定 `checkHole`

| ケース | 期待 |
|---|---|
| 穴の中心・`vs = 100`(やさしい `fallSpeed=230`) | 落ちる |
| 穴の中心・`vs = 300` | 落ちない |
| 穴の中心・`vs = 300`(ふつう `fallSpeed=320`) | 落ちる |
| 穴から `radius + 1` px 離れた位置・`vs = 0` | 落ちない |
| `state = 'airborne'` で穴の真上 | 落ちない |
| `vs` が負(逆走中)で穴の中心・`|vs| = 100` | 落ちる(絶対値で判定していること) |

### 13.3 弾きゾーン `canFlick`

| ケース | 期待 |
|---|---|
| 同じ段・`s = 0.9` | `true` |
| 同じ段・`s = 0.69` | `false` |
| 同じ段・`s = 0.70` | `true`(境界を含む) |
| 同じ段・`s = 1.0` | `true`(境界を含む) |
| 別の段・`s = 0.9` | `false` |
| `state = 'airborne'`・`s = 0.9` | `false` |

### 13.4 弾道と着地(結合テスト)

`stepCoin` を `FIXED_DT` で回すシミュレーションで検証する。

| ケース | 期待 |
|---|---|
| 段1のレバー端で `power = 904` | 段2に着地する(`landedOnLane === 1`) |
| 段1のレバー端で `power = 890` | 段2に到達せず段1に戻る |
| 段1のレバー端で `power = 1700` | 段2以上に着地する(裏面衝突で失速しても落ちきる) |
| 段2〜段4でも `power = 904` で次段に着地 | 5段すべてで同一の閾値が成立すること(§3.1 の均一性の回帰テスト) |
| 段5のレバー端で `power = 1000`(やさしい) | `reachedGoal === true` |
| 段5のレバー端で `power = 1600`(ふつう) | `reachedGoal === false` かつ段5に戻る |
| 段5のレバー端で `power = 700` | `reachedGoal === false` かつ段5に戻る |
| どの弾道でも `state` が `'onLane'`/`'airborne'`/`'falling'`/`'goal'` 以外にならない | 常に成立 |
| 10秒シミュレートしてもコインが盤面外(x < 60 - COIN_R など)に出ない | 常に成立 |

**この §13.4 は本ゲームの生命線である。** 座標や物理定数を変更したときに §3.1 の均一性が壊れたことを検知できる唯一の仕組みなので、必ず実装すること。

### 13.5 検算スクリプト

**`scripts/verify-geometry.ts`(`npm run verify`)。CI でも実行している。**

このスクリプトは当初「放物線を解く」方式だったが、それでは §0.3.1 の 1・3・4 の
不具合をどれも検出できなかった。現在は **実際の物理(`src/game/coin.ts`)を回して測る**。

| # | 内容 |
|---|---|
| 1 | §12 の導出式が §3.2 のレーン座標表と一致する |
| 2 | **5つの跳躍がすべて「横152.5px・上145.2px」で均一**(§3.1) |
| 3 | 必要初速の理論値(参考。天井を考慮していないと明記) |
| 4 | **各段の成功域を実シミュレーションで測る。** 40% 以上、かつ pull 0.35 以下で前進できること |
| 5 | **実プレイの安全性。** 投入直後に落ちない(1割以上の余裕)・弾きに成功したら穴を通過する・難易度差が意図どおり・引きすぎたときだけ転落する |
| 6 | 転がり速度の目安(参考) |
| 7 | 弾きゾーンがシャフトの内側に収まっている(§6.5) |
| 8 | 盤面・ノブ・ストロークが 1280px に収まる(§2.3, §6.3) |

同じ内容は `src/game/coin.test.ts` にもテストとして入っており、`npm test` でも検出できる。

**`src/config.ts` の数値を変更したら必ず両方を実行すること。**
`docs/verify-geometry.py` は設計時に使った Python 版で、参考として残してある
(こちらは天井を考慮しない理論計算なので、判断には TypeScript 版を使うこと)。

### 13.6 `save.ts`

| ケース | 期待 |
|---|---|
| 保存 → 読込 | 同じ値が返る |
| `localStorage` が `undefined` | `DEFAULT_SAVE` を返し、例外を投げない |
| `setItem` が例外を投げる(容量超過等) | 例外を投げず、以降もメモリ上で動作する |
| 保存値が不正な JSON | `DEFAULT_SAVE` を返す |
| `stampCount` が文字列 / 負の数 / `NaN` | `DEFAULT_SAVE` を返す |
| `stampIndexFor(1)` / `(10)` / `(11)` | `0` / `9` / `0` |

---

## 14. ビルドとデプロイ

### 14.1 `package.json`

```json
{
  "name": "cc-flickshot",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "verify": "tsx scripts/verify-geometry.ts"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0"
  }
}
```

**`dependencies` は空にする。** ランタイム依存ゼロが要件(plan.md §7.1)。

### 14.2 `vite.config.ts`

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/cc_flickshot/',   // GitHub Pages のサブパス。外すとアセットが404になる
  build: { target: 'es2020', outDir: 'dist' },
});
```

### 14.3 `tsconfig.json`

`strict: true` は必須。`noUncheckedIndexedAccess` も有効にする(レーン配列のインデックスアクセスが多いため)。

### 14.4 `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 14.5 必要な手動設定(1回だけ)

リポジトリの **Settings → Pages → Source** を「**GitHub Actions**」に変更する。

これを行わないとワークフローは成功するのに公開されない。**README にこの手順を書き、実装完了時に発注者へ伝えること。**

公開URL: `https://sakanayuki.github.io/cc_flickshot/`

---

## 15. 実装順序(完了済み)

> 本書に沿った実装は完了している。以下は当初の計画で、記録として残す。



各ステップの完了時に動作確認できる単位で区切ってある。

| # | 内容 | 参照 | 完了条件 |
|---|---|---|---|
| 1 | Vite + TS 雛形、`layout.ts`、シーンマシン、空の3シーン遷移 | §1, §2 | ブラウザで3画面をボタンで行き来できる |
| 2 | `config.ts` 全定数、`board.ts`、盤面の描画 | §3, §12 | 5段のレーン・穴・ゴールが正しい位置に描かれる |
| 3 | `coin.ts` の物理。デバッグ用にクリックで固定 power 発射 | §4, §5.1 | コインが転がり・弾かれ・着地し、穴に落ちる |
| 4 | `scripts/verify-geometry.ts` と §13.4 のテスト | §13.4, §13.5 | 5段すべてで `power = 904` が次段に届く |
| 5 | `plunger.ts` + `levers.ts`。ドラッグ操作、全レバー連動 | §6 | 指450pxで引け、引き量で飛距離が変わる |
| 6 | ゲームフロー(投入アニメ → play → 3種の終了)、あきらめる長押し | §8.3, §8.4, §8.6 | 3つの終了条件すべてでリザルトへ遷移する |
| 7 | 難易度2段階、タイトルでの選択 | §7 | 難易度で穴・ゴール口・転落が変わる |
| 8 | 操作ガイド(指アニメ) | §8.5 | 2秒放置で手アイコンがループ表示され、触れると消える |
| 9 | ビジュアル仕上げ(どうぶつ・山・紙吹雪・モグラ・旗) | §9 | 外部素材への参照がゼロのまま完成する |
| 10 | `save.ts`、スタンプ獲得演出、スタンプ帳 | §10 | リロードしてもスタンプが残る |
| 11 | §7.4 のチューニング(**必ず実機のスマホで**) | §7.4 | やさしいで20回中16回以上ゴールできる |
| 12 | ワークフロー、README、Pages 公開 | §14 | 公開URLで動作する |

---

## 16. 受け入れチェックリスト

実装後に確認済み。カッコ内は確認方法。

- [x] スマホ縦持ちで盤面全体とプランジャーが1画面に収まる(§2.3 / 実機サイズ 414×896 で描画確認)
- [x] 指のドラッグ量450pxで `pull` が 0→1 まで変化し、ノブは画面内に収まっている(§6.3 / `npm run verify` 項目8・プランジャーのテスト)
- [x] 横方向にドラッグが蛇行しても `pull` に影響しない(§6.1 / プランジャーのテスト)
- [x] 発射で5段すべてのレバーが同時に動く(§6.5 / 実画面で確認)
- [x] 5段どこからでも `pull ≥ 0.27` で次の段に到達する(§3.6 / `npm run verify` 項目4)
- [x] 最大まで引いても失敗にならず、上の段に着地する(§4.3(b) / `npm test`)
- [x] メダル投入アニメ → プレイ → (穴 / ゴール / あきらめ) → リザルト がすべて機能する(§8.3 / ブラウザで3経路とも通した)
- [x] あきらめるは1秒長押しでのみ発動し、指がずれるとキャンセルされる(§8.6)
- [x] 2秒放置で指アイコンが毎回表示され、触れると即消える(§8.5)
- [x] ゴールを外してもゲームは終わらず、段5から再挑戦できる(§5.3 / `npm test`)
- [x] **投入直後、一度も弾く前に穴へ落ちない**(§0.3.1 の 3 / `npm run verify` 項目5・`npm test`)
- [x] ゴールでスタンプが増え、リロード後もタイトル画面に残っている(§10)
- [x] プライベートブラウズでもクラッシュせず遊べる(§10 / `save.ts` のテスト)
- [x] 音は一切鳴らない(`AudioContext` を生成するコードが存在しない)
- [x] 外部素材(画像・音・フォント・CDN)への参照が一切ない(§9 / ビルド成果物を検査)
- [x] `npm test`(86件)と `npm run verify`(39項目)が通る
- [ ] **実機のスマートフォンで、3歳児が実際に遊べるか確認する**(§7.4。ここだけは人の手で行うこと)
- [ ] `https://sakanayuki.github.io/cc_flickshot/` で動作する(Settings → Pages → Source を「GitHub Actions」にする手動設定が必要。README 参照)

### 難易度の最終調整について

§7.4 のチューニング手順のうち、**機械的に測れる部分は `npm run verify` 項目4・5 が
自動で確認している**(成功域の広さ、投入直後の安全性、難易度差の向きと大きさ)。

ただし「3歳児が実際に5回中4回ゴールできるか」は、指の動かし方が大人と違うため
**実機で本人に遊んでもらわないと分からない**。うまく登れないようなら、まず
`DIFFICULTIES.easy.fallSpeed` を下げ、次に `holeRadius` を下げること。変更後は
必ず `npm run verify` と `npm test` を実行する(どちらも CI で走る)。

## 17. 実装時に迷ったら

| 迷い | 判断基準 |
|---|---|
| 難しくするか、優しくするか | **優しくする。** 対象は3歳児 |
| 情報を表示するか、しないか | **しない。** 3歳児が理解できない情報は画面に出さない |
| 当たり判定を狭くするか、広くするか | **広くする。** 弾きゾーン・ボタン・掴み領域はすべて見た目より広い |
| 物理をリアルにするか、予測可能にするか | **予測可能にする。** バウンドを増やさない |
| 失敗時に演出を派手にするか | **しない。** 責める演出は禁止 |
| 本書と plan.md の数値が食い違う | **本書を正とする**(§0.2) |
| 本書に書かれていない仕様判断が必要になった | §0.5 の裁量範囲か確認し、範囲外なら**発注者に確認する** |
