# 詳細設計書 —「どうぶつの やまくだり」

対象リポジトリ: `sakanayuki/cc_flickshot`
要件定義書: [`../plan.md`](../plan.md)

---

## 0. 本書の位置づけと読み方

### 0.1 2つの文書の役割

| 文書 | 役割 |
|---|---|
| `plan.md` | **要件**(何を作るか、なぜそうするか)。発注者との合意事項 |
| 本書 | **設計**(どう作るか)。座標・物理定数・型・関数シグネチャの確定値 |

数値が食い違う場合は**本書を正とする**。

### 0.2 コードとの関係

本書は実装済みのコードを記述したものである。
**最終的な正は `src/config.ts` と `scripts/verify-geometry.ts`。**
定数を変えたら `npm run verify` と `npm test` が必ず通ることを確認し、本書も更新すること。

### 0.3 ルールの全面見直し(2026-07-28)

当初は「下から上へ登る」ゲームとして実装していたが、発注者の意図した実機は
**「上から下へ降りる」**ゲームだった。以下がすべて反転している。

| | 旧(やまのぼり) | 新(やまくだり) |
|---|---|---|
| 進む向き | 下 → 上 | **上 → 下** |
| 投入位置 | 左下 | **右上** |
| 弾く向き | 斜め上(仰角26°) | **ほぼ横**(仰角12°) |
| 強すぎたとき | 天井に当たって減速、失敗しない | **奥の穴に落ちて没収** |
| 弱すぎたとき | 同じ段に戻る | **手前の穴に落ちて没収** |
| クリア | 山頂のゴールバスケット | **最下段の下のあたりの口** |
| 難易度差 | 穴の数・半径・落下閾値・ゴール幅・リップ高の5つ | **板の幅だけ** |
| 盤面の高さ | 画面の 55% | **画面の 74%** |
| プランジャー帯 | 画面の 41%(指ストローク450px) | **画面の 22%**(指ストローク240px) |

旧ルール固有の仕組み(上向きシャフト、レーン先端・裏面の当たり判定、リップ越えの転落、
転がり速度による穴判定、壁での跳ね返り)は**すべて削除した**。

### 0.4 設計の中心にある考え方

1. **5つの遷移をすべて同一条件にする。**
   段1→2、2→3、3→4、4→5、段5→あたりの口の「横に飛ぶ距離」と「落差」を完全に等しくする。
   こうすればチューニング定数は `P_MIN` / `P_MAX` の2つで済み、
   3歳児は「同じ引き方」を5回繰り返せばよい。
2. **失敗は必ず両側にある。**
   弱すぎ → 手前の穴、強すぎ → 奥の穴。片側しか失敗しない配置は設計が崩れている証拠なので、
   検算スクリプトが自動で落とす。
3. **時間的な制約を作らない。**
   着地したコインは板の傾斜で必ず溝まで転がって止まる。
   3歳児が落ち着いてプランジャーを引ける時間を無制限に確保する。
4. **跳ね返らせない。**
   壁でも板でも跳ね返らせない。跳ね返ると「強すぎたのに壁のおかげで助かる」が起き、
   *強すぎ = 失敗* というルールが崩れる。

---

## 1. 全体アーキテクチャ

### 1.1 依存方向

```
main.ts
 ├─ scenes/{title,game,result}.ts
 │    ├─ game/{board,coin,plunger,levers}.ts   ← Canvas / DOM を一切参照しない
 │    ├─ render/{layout,drawings,shapes,animals,particles}.ts
 │    └─ save.ts
 └─ config.ts                                  ← 副作用のない葉ノード
```

**`src/game/` は Canvas も DOM も参照しない。** Vitest でそのままテストできることが要件。
`scripts/verify-geometry.ts` も同じ理由で `src/game/` を直接 import して実物理を回す。

### 1.2 メインループ

```
frame(nowMs):
  acc += min(now - prev, MAX_FRAME_TIME)   // タブ復帰時のスパイラル防止
  applyPendingTransition()
  while acc >= FIXED_DT:
    current.update(FIXED_DT)               // 物理には常に固定 dt
    acc -= FIXED_DT
    if pending: applyPendingTransition(); acc = 0; break
  try:
    clearFull(); applyTransform(); current.render()
  catch err:
    crashed = true; showFatal(err)         // 真っ青画面の再発防止(§0.5)
  requestAnimationFrame(frame)
```

- シーン遷移は `update` の途中では行わず、次フレームの先頭で差し替える。
- 現在のシーン名を `document.body.dataset.scene` に出す。自動テストから遷移を観測するためだけのもの。

### 1.3 起動失敗を必ず見せる

JSが読み込めなかった/描画で例外が出たときに、body の背景色だけが見える
**「真っ青な画面」**になると端末側からは原因が全く分からない。以下を必ず持つこと。

- `window.onerror` / `unhandledrejection` → `showFatal()` で画面に理由を表示
- 描画ループの try/catch → 同上
- `index.html` に `<noscript>`
- `vite.config.ts` は `base: './'`(相対パス)

---

## 2. 座標系とレイアウト

### 2.1 論理座標系

**720 × 1280(9:16 縦)**。全シーンこの座標系で描画する。

### 2.2 実画面へのフィット

```ts
scale   = min(cssW / 720, cssH / 1280)
offsetX = (cssW - 720 * scale) / 2
offsetY = (cssH - 1280 * scale) / 2
dpr     = min(devicePixelRatio, MAX_DPR = 3)
canvas.width  = round(cssW * dpr)
canvas.height = round(cssH * dpr)
ctx.setTransform(dpr*scale, 0, 0, dpr*scale, dpr*offsetX, dpr*offsetY)
```

- レターボックスの余白は `clearFull()` で空色に塗る。
- ポインタ座標は `toLogical()` で必ず論理座標に変換してからシーンに渡す。
- `resize` / `orientationchange` で再計算する。

### 2.3 ゲーム画面の領域割り(720×1280)

| 領域 | 範囲 | 画面比 |
|---|---|---|
| 盤面 | y 40 .. 994 | **74%** |
| プランジャー帯 | y 994 .. 1280(286px) | **22%** |
| 盤面の壁 | x 40 .. 680 | — |

- ノブ中心 (560, 1040)、半径 46。`KNOB_REST.y - KNOB_R = 994` なので盤面と重ならない。
- 指のストローク 240px。`1280 - 1040 = 240` でちょうど画面下端まで届く。
- ノブの見た目の移動量 190px。`1040 + 190 + 46 = 1276 ≤ 1280` で画面内に残る。
- 掴み領域は帯のほぼ全体 `{x: 300, y: 996, w: 420, h: 284}`。

---

## 3. 盤面の幾何

### 3.1 段(板)

```ts
interface Row {
  index: number;      // 0..4
  left: number;       // 板の左端 x
  right: number;      // 板の右端 x
  notchSide: 'left' | 'right';
  notchY: number;     // 溝(板の低い側)の y
  highY: number;      // 板の高い側の y = notchY - PLANK_DROP
}
```

- 段数 `ROW_COUNT = 5`。溝の y は `ROW_TOP_Y + i * ROW_GAP` = 210, 355, 500, 645, 790。
- 溝の側は **右 → 左 → 右 → 左 → 右** と交互(`i % 2 === 0` が右)。
- 板は溝側に `PLANK_DROP = 22` px だけ下っている。コインはこの傾斜で必ず溝まで転がる。

### 3.2 溝の x — 5つの遷移を同一条件にする逆算

```ts
NEAR_GAP = 120                                  // 手前の穴の幅
BOARD_CENTER_X = (40 + 680) / 2 = 360
notchOffset(w) = (NEAR_GAP + w) / 2
notchRight = BOARD_CENTER_X + notchOffset(w)
notchLeft  = BOARD_CENTER_X - notchOffset(w)
```

右の溝(`notchRight`)から左へ弾いたコインが着地すべき板の左端が、
そのまま次の段の溝(`notchLeft`)になるように取ってある。
結果として**どの遷移でも横に飛ぶ距離が `NEAR_GAP = 120` px、落差が `ROW_GAP = 145` px** になる。

> **`NEAR_GAP` を 0 にしてはならない。** 0 にすると「弱すぎ」で落ちる余地が消え、
> 強すぎでしか失敗しない片側だけのゲームになる。

板の左右端:

```
notchSide === 'right' → [left, right] = [notchRight - w, notchRight]
notchSide === 'left'  → [left, right] = [notchLeft,      notchLeft + w]
```

### 3.3 難易度別の実測値

| | やさしい (w=330) | ふつう (w=160) |
|---|---|---|
| `notchOffset` | 225 | 140 |
| 右の溝 x | 585 | 500 |
| 左の溝 x | 135 | 220 |
| 板(溝が右) | 255 .. 585 | 340 .. 500 |
| 板(溝が左) | 135 .. 465 | 220 .. 380 |
| 手前の穴を越える横距離 | 120 | 120 |
| 落差 | 145 | 145 |

どちらも `BOARD_LEFT = 40` .. `BOARD_RIGHT = 680` に収まっている(検算 §12-1)。

### 3.4 あたりの口

```ts
interface WinPocket { left: number; right: number; y: number }
```

- 段5(溝は右)から左へ弾いて入れる位置に置く。
  `left = BOARD_CENTER_X - notchOffset(w)`、`right = left + w`。
- `y = ROW_TOP_Y + ROW_COUNT * ROW_GAP = 935`。段5の溝(790)から 145px 下。
- 幅は板と同じなので、**難易度差はあたりの口にもそのまま効く**。

### 3.5 穴

```ts
interface Hole {
  rowIndex: number;            // その穴がある段。ROW_COUNT ならあたりの口の高さ
  left: number; right: number; y: number;
  kind: 'near' | 'far';        // 手前(弱すぎ) / 奥(強すぎ)
}
```

穴は「板でないところ」。段2〜段5とあたりの口の高さについて、
板の左右を `BOARD_LEFT` / `BOARD_RIGHT` まで埋めるように生成する。

- **段1には穴を作らない。** 投入されるだけで、着地判定の対象にならないため。
- `near` / `far` の向きは、**1つ上の段の溝がどちら側か**で決まる。
  左へ弾かれてくるなら、着地板の右側が `near`(弱すぎ)、左側が `far`(強すぎ)。
- 幅が 1px 以下の穴は生成しない(板が壁に接している場合)。
  この状態は片側の失敗が消えることを意味するので、検算が別途落とす。

---

## 4. 物理モデル

### 4.1 コインの状態機械

```ts
type CoinState = 'onPlank' | 'airborne' | 'falling' | 'win';
```

```
        投入
          ↓
     ┌ onPlank ┐ ──flickCoin()──→ airborne
     │  (転がって溝で止まる)              │
     └─────────┘ ←──1段下の板に着地───┘
                                        │
                          板を外す ─────┴──→ falling → リザルト
                       あたりの口に入る ────→ win     → リザルト
```

```ts
interface Coin {
  state: CoinState;
  rowIndex: number;   // onPlank: 乗っている段 / airborne: 弾き出された元の段
  x: number;          // onPlank のときの水平位置
  vx: number;         // onPlank のときの水平速度
  pos: Vec2;          // コイン中心。常に有効
  vel: Vec2;          // airborne のときの速度
  timer: number;      // falling / win の演出経過秒
  hole: Hole | null;  // falling のとき、落ちた穴
  spin: number;       // 見た目の回転
}
```

### 4.2 `onPlank` の更新

```ts
slope = PLANK_DROP / (row.right - row.left)     // tanθ
dir   = downhillDirX(row)                       // 溝へ向かう向き
a  = GRAVITY * slope * dir - ROLL_DAMPING * vx
vx += a * dt
x  += vx * dt
spin += vx * dt / COIN_R
```

- 溝(`notchPos(row).x`)に達したら `x` を溝に固定し `vx = 0`。
- 板の高い側にも縁があり、転がり出ることはない(こちらも同様に固定)。
- コイン中心の y は常に `plankCoinY(row, x) = plankSurfaceY(row, x) - COIN_R`。

`GRAVITY = 2200`、`ROLL_DAMPING = 1.6`。
やさしい (w=330) の傾き `tanθ = 22/330 = 0.0667` → 板を端から端まで転がるのに約 1.6 秒。

### 4.3 発射

```ts
canFlick(coin, rows) := coin.state === 'onPlank'
                        && |coin.x - notchPos(row).x| <= FLICK_ZONE_PX (90)

flickCoin(coin, rows, power):
  dir = flickDirX(row)          // 溝が右なら -1(左へ)
  vel = { x: dir * power * cos(FLICK_RISE),
          y: -power * sin(FLICK_RISE) }   // FLICK_RISE = 12°
  state = 'airborne'
```

- コインは必ず溝で停止するため、実際には常にゾーン内にいる。
  `FLICK_ZONE_PX = 90` は `NEAR_GAP = 120` より狭くしてある(検算 §12-6)。
- 仰角 12° は「弾かれた」感が出る最小限。大きくすると滞空時間が伸びて
  横方向の適正範囲が狭まり、3歳児にはシビアになる。

### 4.4 `airborne` の更新

```ts
prevY = pos.y
vel.y += GRAVITY * dt
pos   += vel * dt

// 壁: 跳ね返らせず、横速度を殺して滑り落とす
if (pos.x - COIN_R < BOARD_LEFT)  { pos.x = BOARD_LEFT + COIN_R;  vel.x = 0 }
if (pos.x + COIN_R > BOARD_RIGHT) { pos.x = BOARD_RIGHT - COIN_R; vel.x = 0 }

// 着地面は「1段下の板」だけ。発射した段は飛び越える途中なので判定しない
targetIndex = rowIndex + 1
isPocket    = targetIndex >= ROW_COUNT
planeY = isPocket ? pocket.y - COIN_R : plankCoinY(rows[targetIndex], pos.x)

if (vel.y <= 0 || prevY > planeY || pos.y < planeY) return   // まだ通過していない

success = isPocket ? inWinPocket(pocket, pos.x) : onPlank(rows[targetIndex], pos.x)
if (success && isPocket)  → state = 'win',   reachedWin = true
if (success && !isPocket) → state = 'onPlank', rowIndex = targetIndex,
                             x = pos.x, vx = vel.x (横の勢いだけ引き継ぐ。跳ねない)
if (!success)             → state = 'falling', hole = findHole(targetIndex, pos.x)
```

**壁で跳ね返らせないことが重要。** 跳ね返らせると強く弾いたコインが壁で戻って板に乗り、
「強すぎ = 失敗」というルールが成立しなくなる。

### 4.5 `falling` / `win`

どちらも `timer += dt` するだけの演出状態。物理は止まる。

- `falling`: `FALL_ANIM = 1.0` 秒。穴の中心へ吸い込まれながら縮小・フェード。
- `win`: `WIN_ANIM = 1.5` 秒。あたりの口の中で小さく跳ねる。

---

## 5. 難易度

### 5.1 パラメータ

```ts
DIFFICULTIES = {
  easy:   { id: 'easy',   label: 'やさしい', plankWidth: 330 },
  normal: { id: 'normal', label: 'ふつう',   plankWidth: 160 },
}
```

**難易度差は板の幅だけ。** 弾き力の範囲・ストローク・重力・段間距離はすべて共通。
難易度を切り替えても指の感覚が変わらないので3歳児が混乱しない。

### 5.2 実測された成功域(`npm run verify`)

| 遷移 | やさしい | ふつう |
|---|---|---|
| 段1 → 段2 | 85%(pull 0.17〜0.98) | 43%(pull 0.17〜0.58) |
| 段2 → 段3 | 85% | 43% |
| 段3 → 段4 | 85% | 43% |
| 段4 → 段5 | 85% | 43% |
| 段5 → あたりの口 | 89%(pull 0.14〜0.98) | 47%(pull 0.14〜0.58) |

- すべて**連続した1区間**。飛び地はない。
- すべての遷移で**弱すぎ・強すぎの両方の失敗が存在する**。
- やさしい (85%) > ふつう (43%)。

### 5.3 チューニングの経緯(再発防止のため記録)

| 試した値 | 結果 | 判断 |
|---|---|---|
| `P_MAX = 1400` | やさしい 52%。ストローク上端が丸ごと「強すぎ」 | 却下。1000 に下げた |
| `plankWidth = 340` | やさしい 87% だが**強すぎ失敗が 0 件**になった | 却下。板が壁に接し、強く弾いても壁で止まって板に戻ってしまう |
| `plankWidth = 330` | やさしい 85%、両方の失敗あり | **採用** |
| `plankWidth = 160` | ふつう 43%、両方の失敗あり | **採用** |

`plankWidth = 340` の違反は、検算スクリプトの
「弱すぎでも強すぎでも落ちる」チェックが自動で検出した。

---

## 6. プランジャーとレバー

### 6.1 入力の取り扱い

- Pointer Events のみ(Touch/Mouse を個別実装しない)。
- 掴めたら `canvas.setPointerCapture(pointerId)`。失敗しうる環境があるので try/catch。
- **`pointercancel` でも発射する。** iOS でシステムジェスチャに割り込まれたときに
  操作が無かったことにならないようにするため。
- **横方向の移動は完全に無視する。** 下方向の変位 `dy` だけを見る。
  3歳児のドラッグは大きく蛇行するため、これが「シビアな操作を減らす」要件の実装手段のひとつ。

### 6.2 HTML / CSS 側の必須設定

```html
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover">
```
```css
canvas { touch-action: none; }
html, body { overscroll-behavior: none; user-select: none; -webkit-user-select: none;
             -webkit-tap-highlight-color: transparent; }
```

### 6.3 ストローク — 指とノブの分離

| | 値 |
|---|---|
| 指の移動量 `STROKE_FINGER` | **240px** |
| ノブの見た目の移動量 `STROKE_KNOB` | **190px** |

指 240px は「盤面を74%にする」要件と両立させた上限
(`LOGICAL_H - KNOB_REST.y = 1280 - 1040 = 240`)。
ノブを 190px にとどめることで、引ききってもノブが画面内に残る。

旧仕様の 450px から縮んだぶんの余裕は、**板を広く取ること**で吸収している(§5)。

### 6.4 `pull` → 弾き力

```ts
pull  = clamp(dy / STROKE_FINGER, 0, 1)
power = P_MIN + (P_MAX - P_MIN) * pull      // 200 .. 1000 px/s
if (pull < PULL_DEADZONE = 0.05) → 発射しない(誤タップで空撃ちしない)
```

### 6.5 レバー

```ts
interface LeverState { swing: number; timer: number }   // swing: -1 タメ / 0 静止 / +1 はたいた頂点
```

- 引いている間: `swing = -pull * 0.4`(全段が連動して引き戻る。タメの視覚フィードバック)
- 発射時 `triggerLevers()`: 全段の `timer = LEVER_SWING_TIME (0.2s)`、
  `swing = sin(t * π)` ではたきアニメ。
- レバーは**見た目だけ**。当たり判定は `canFlick` / `flickCoin` が持つ。

### 6.6 クールダウン

発射後 `FLICK_COOLDOWN = 0.3` 秒は再度掴めない。表示はしない。

---

## 7. 画面仕様

### 7.1 シーン遷移

```
title ──難易度タップ──→ game ──穴/あたり/あきらめ──→ result
  ↑                                                    │
  └────────────「さいしょから」─────────────────────────┘
                「もういちど」→ game(同じ難易度)
```

```ts
type Outcome = 'win' | 'hole' | 'giveup';

interface GameParams   { difficulty: DifficultyConfig }
interface ResultParams {
  outcome: Outcome;
  reachedDepth: number;          // 1..ROW_COUNT
  difficulty: DifficultyConfig;
  newStampIndex: number | null;  // あたり時のみ
}
```

### 7.2 タイトル画面

- ロゴ「どうぶつの / やまくだり」+ 下へ降りる段々とコインのアニメ。
- 難易度ボタン2つ: やさしい `{x:120, y:470, w:480, h:140}` / ふつう `{x:120, y:650, ...}`。
  前回選んだ難易度を強調表示する。
- **押し始めと同じボタンの上で離したときだけ発火する**(押し間違いに気づいて指をずらせば発火しない)。
- 当たり判定は見た目より `BUTTON_PADDING = 20` px 広い。
- 下部にスタンプ帳 `{x:76, y:900, w:568}`。

### 7.3 ゲーム画面のフェーズ

```ts
type GamePhase = 'insert' | 'play' | 'ending';
```

| フェーズ | 内容 |
|---|---|
| `insert` | `INSERT_ANIM = 1.4` 秒。操作不能。終わったら `placeAtStart()` して `play` へ |
| `play` | プランジャー操作可。`stepCoin()` の結果で `ending` へ |
| `ending` | 演出待ち。`hole` は 1.0 秒、`win` は 1.5 秒、`giveup` は即時 |

投入アニメ (`drawInsertCoin`) のタイムライン:

| t | 内容 |
|---|---|
| 0.00 – 0.35 | コインが右上の投入口へ落ちる(最後にフェードアウト) |
| 0.35 – 0.55 | 機械の中(見えない) |
| 0.55 – 1.00 | シュートを滑って段1の板へ |

`placeAtStart()` は段1の溝から `70px` 高い側に置く。そこから傾斜で溝まで転がって止まる。

### 7.4 操作ガイド(未操作2秒で表示)

以下がすべて成り立つときだけ、指アイコンがノブを下へ引くアニメをループ表示する。

```
phase === 'play'
  && plunger.idleTime >= GUIDE_IDLE_DELAY (2.0s)
  && plunger.cooldown <= 0
  && coin.state === 'onPlank'
  && |coin.vx| < 5
  && canFlick(coin, rows)
```

3歳児はひらがなを読めないため、**これが唯一の操作説明**になる。毎回出す。

### 7.5 あきらめるボタン(長押し1秒)

- 中心 (108, 108)、半径 42。押下から `GIVEUP_HOLD = 1.0` 秒で発動。
- `GIVEUP_RING_DELAY = 0.2` 秒経ってから進捗リングを描き始める(一瞬触れただけでリングを出さない)。
- 中心から `GIVEUP_CANCEL_R = 84` px より外へ指が出たらキャンセル。

### 7.6 リザルト画面

| 結果 | 見出し | 演出 |
|---|---|---|
| `win` | やったね! | 紙吹雪(0.4秒ごとに追加)、うさぎ・くまがバンザイ、スタンプ「ぺたん!」 |
| `hole` | おしい! | りすが穴からひょっこり顔を出して笑う |
| `giveup` | またね! | ねこが手を振る |

- 到達段数を `drawResultSteps(ctx, {x:360, y:520}, reachedDepth, won)` で表示。
  降りた段だけ木の色で塗る。あたりの口は `won` のときだけオレンジ。
- 本文 `${ROW_COUNT}だん おりて あたり!` / `${reachedDepth}だんめ まで おりたよ` を y=710 に。
- ボタン: もういちど `{x:120, y:980, w:480, h:140}` / さいしょから `{x:230, y:1150, w:260, h:90}`。
- **`RESULT_INPUT_DELAY = 0.8` 秒は入力を受け付けない**(演出中の連打で飛ばされないため)。
- スタンプは `{x: 575, y: 430}` に押す。ステップの絵と重ならない位置。

---

## 8. 描画設計

### 8.1 レイヤー順序(ゲーム画面)

```
1  drawSky
2  drawSunAndClouds
3  drawBoardBackground        盤面の地と斜めのハイライト
4  drawSideAnimals            板より先に描くので腰から下が隠れる
5  drawHole × n
6  drawEntryChute             投入口から段1へのシュート
7  drawPlank × 5
8  drawWinPocket
9  drawLever × 5
10 drawBoardFrame
11 drawCabinet                盤面より下の赤い筐体+あたりの受け皿
12 コイン(状態別)
13 drawCoinSlot               右上の投入口
14 drawInsertCoin             insert フェーズのみ
15 drawPlunger
16 drawGiveUpButton
17 drawHandGuide              条件を満たすときのみ
```

### 8.2 カラーパレット

```ts
sky '#8FD3F4'  skyTop '#BDE9FF'  sun '#FFE066'  cloud '#FFFFFF'
mountain '#8CC63F'  mountainHi '#B5E061'  mountainSh '#5FA32A'
plankTop '#D9A05B'  plankSide '#A9713A'  plankEdge '#6B4423'
lever '#E8503A'  leverDark '#B23324'
hole '#3A2A18'  holeRim '#241708'
coinRim '#F5C242'  coinFace '#FFF3D0'
pocket '#F2E9D8'  flagRed '#E8503A'
ink '#3B2A1A'  panel '#FFF8EC'  panelEdge '#3B2A1A'
accent '#FF8A3D'  disabled '#C9C2B6'
筐体 '#D64B3A'(赤) / '#C9A227'(金の縁)
```

`LINE_W = 4`。3歳児の視認性のため輪郭線を細くしない。

### 8.3 描画関数一覧(`render/drawings.ts`)

```
背景    drawSky, drawSunAndClouds, drawBoardBackground
盤面    drawCabinet, drawBoardFrame, drawHole, drawPlank, drawLever, drawWinPocket
コイン  drawCoin, drawCoinSlot, entryChute, drawEntryChute, drawInsertCoin
操作    drawPlunger, drawHandGuide, drawGiveUpButton, drawButton
収集    drawStamp, drawStampBook
画面    drawTitleLogo, drawResultSteps
装飾    drawSideAnimals
```

- どうぶつの顔は `render/animals.ts`(`drawAnimalFace`, `drawCheerAnimal`)。
- 図形・文字の下請けは `render/shapes.ts`(`roundRect`, `circle`, `ellipse`, `polygon`,
  `paint`, `line`, `text`, `clamp01`, `lerp`, `easeOut`, `easeBack`, `dist`, `rectContains`)。
- **外部素材は一切使わない。** 画像・音声・フォント・CDN への参照ゼロ。
  ビルド後のバンドルを grep して確認すること。

### 8.4 パーティクル(紙吹雪)

`render/particles.ts`。あたりのリザルトでのみ使用。画面上端から降らせ、
0.4 秒ごとに 20 個ずつ追加する。重力と回転を持つだけの単純なもの。

---

## 9. データとストレージ

```ts
interface SaveData { stampCount: number; lastDifficulty: DifficultyId }
SAVE_KEY = 'flickshot.save.v1'
DEFAULT  = { stampCount: 0, lastDifficulty: 'easy' }
```

- **localStorage が使えなくても絶対にクラッシュさせない。**
  Safari のプライベートモードは `getItem` は通るのに `setItem` で例外を投げるため、
  `storage()` は毎回プローブ書き込みで可用性を判定する。使えなければメモリ上だけで動作する。
- 読み込み値は `sanitize()` で必ず検証する(型・有限性・負数・未知の難易度ID)。
- スタンプの種類は `stampIndexFor(nth) = (nth - 1) % ANIMALS.length` で導出。
  カウントだけ保存すれば足りる。
- 保存タイミングは**リザルトに入る瞬間**。演出中にリロードされても記録が残る。

---

## 10. モジュールインターフェース

### 10.1 `game/board.ts`

```ts
buildRows(d: DifficultyConfig): Row[]
buildWinPocket(d: DifficultyConfig): WinPocket
buildHoles(d: DifficultyConfig): Hole[]

notchPos(row: Row): Vec2            // 溝でのコイン中心
flickDirX(row: Row): number         // 弾き出す向き(溝が右なら -1)
downhillDirX(row: Row): number      // 板が下る向き(溝が右なら +1)
plankSurfaceY(row: Row, x: number): number
plankCoinY(row: Row, x: number): number
onPlank(row: Row, x: number): boolean
inWinPocket(pocket: WinPocket, x: number): boolean
```

### 10.2 `game/coin.ts`

```ts
createCoin(): Coin
placeOnRow(coin, rows, rowIndex, x): void
placeAtStart(coin, rows): void
canFlick(coin, rows): boolean
flickCoin(coin, rows, power): boolean          // 弾けたら true
stepCoin(coin, dt, rows, pocket, holes): StepResult

interface StepResult {
  landedOnRow: number | null;
  fellInHole: Hole | null;
  reachedWin: boolean;
}
```

### 10.3 `game/plunger.ts`

```ts
createPlunger(): PlungerState
pullToPower(pull: number): number
plungerPointerDown(st, p, pointerId): boolean   // true なら setPointerCapture すること
plungerPointerMove(st, p): void
plungerPointerUp(st): number | null             // 発射したら power、しなければ null
updatePlunger(st, dt): void
releasePlunger(st): void
```

### 10.4 `game/levers.ts`

```ts
createLevers(): LeverState[]
triggerLevers(levers): void
updateLevers(levers, dt, pull): void
```

---

## 11. `config.ts` の確定値

```ts
// 画面
LOGICAL_W = 720          LOGICAL_H = 1280        MAX_DPR = 3

// コイン
COIN_R = 28

// 盤面
BOARD_LEFT = 40          BOARD_RIGHT = 680
BOARD_TOP  = 40          BOARD_BOTTOM = 994      // 画面の 74%
ROW_COUNT  = 5           ROW_GAP = 145           ROW_TOP_Y = 210
PLANK_DROP = 22          NEAR_GAP = 120
BOARD_CENTER_X = 360     notchOffset(w) = (NEAR_GAP + w) / 2

// 物理
GRAVITY = 2200           ROLL_DAMPING = 1.6
FIXED_DT = 1/60          MAX_FRAME_TIME = 0.25

// 弾き
P_MIN = 200              P_MAX = 1000
FLICK_RISE_DEG = 12      FLICK_ZONE_PX = 90
FLICK_COOLDOWN = 0.3     LEVER_SWING_TIME = 0.2

// プランジャー
KNOB_REST = {x:560, y:1040}   KNOB_R = 46
STROKE_FINGER = 240           STROKE_KNOB = 190
PULL_DEADZONE = 0.05          KNOB_RETURN = 0.15
GRAB_ZONE = {x:300, y:996, w:420, h:284}

// UI
GIVEUP_CENTER = {x:108, y:108}   GIVEUP_R = 42       GIVEUP_CANCEL_R = 84
GIVEUP_HOLD = 1.0                GIVEUP_RING_DELAY = 0.2
GUIDE_IDLE_DELAY = 2.0           RESULT_INPUT_DELAY = 0.8
BUTTON_PADDING = 20

// 演出
INSERT_ANIM = 1.4   FALL_ANIM = 1.0   WIN_ANIM = 1.5   STAMP_ANIM = 0.6
COIN_SLOT_CENTER = {x:618, y:96}     COIN_SLOT_SIZE = {w:118, h:84}

// 難易度
easy:   plankWidth 330
normal: plankWidth 160

LINE_W = 4
ANIMALS = [usagi, kuma, panda, risu, neko, inu, zou, kirin, pengin, raion]
```

---

## 12. 検証

### 12.1 `npm run verify`(`scripts/verify-geometry.ts`)

**このスクリプトは放物線を解かない。実際の物理(`src/game/coin.ts`)を回して測る。**
以前、計算上は正しいのに遊べない不具合を何度も作り込んだため。

| # | 検査内容 |
|---|---|
| 1 | 段とあたりの口の座標が盤面 (40..680, ..994) に収まっている |
| 2 | 5つの遷移の「横に飛ぶ距離」と「落差」がすべて同一。手前の穴が `COIN_R` より広い |
| 3 | 各遷移の成功域を pull 0.05〜1.00 を 0.005 刻みで実シミュレーションして測る<br>・成功域が**連続**している(飛び地がない)<br>・**弱すぎでも強すぎでも落ちる**(片側しか失敗しないなら板が壁に接している)<br>・やさしい 60〜100%、ふつう 30〜50%、やさしい > ふつう |
| 4 | 投入後に放置しても落ちない。放置すると溝で止まって弾ける状態になる |
| 5 | どの `power` でもコインが盤面外に出ない。座標が NaN/Infinity にならない |
| 6 | プランジャー帯 ≤ 25%、盤面とノブが重ならない、指のストロークが画面内、<br>引ききってもノブが画面内、弾きゾーン < 手前の穴の幅 |

### 12.2 `npm test`(Vitest、70 テスト)

- `src/game/coin.test.ts`(37): 幾何・弾き・転がり・成功域スキャン・頑健性
- `src/game/plunger.test.ts`(19): 掴み判定、`pull` の境界、デッドゾーン、クールダウン、`pointercancel`
- `src/save.test.ts`(14): 保存・読込・不正値の sanitize・localStorage 例外時のフォールバック

### 12.3 ブラウザでの通しプレイ(Playwright, Pixel 7)

- タイトル → 投入 → 5段降りる → あたりの口 → リザルト(スタンプ獲得)
- 弱すぎ(pull 0.10)で手前の穴に落ちる
- 強すぎ(pull 1.00)で奥の穴に落ちる
- あきらめる長押し1秒でリザルトへ
- 未操作2秒で操作ガイドが出る / プランジャーを引くと全レバーが連動する
- `pageerror` / `console.error` が1件も出ないこと

---

## 13. ビルドとデプロイ

### 13.1 npm scripts

```json
"dev":     "vite",
"build":   "tsc --noEmit && vite build",
"preview": "vite preview",
"test":    "vitest run",
"verify":  "tsx scripts/verify-geometry.ts"
```

ランタイム依存は**ゼロ**。devDependencies のみ。

### 13.2 `vite.config.ts`

```ts
base: './'                    // 絶対パスにしない(§1.3)
build: { modulePreload: false }  // バンドルから fetch() を無くす
```

### 13.3 `tsconfig.json`

`strict` に加えて `noUncheckedIndexedAccess` と `exactOptionalPropertyTypes` を有効にする。

### 13.4 `.github/workflows/deploy.yml`

- トリガー: `push` to `main` + `workflow_dispatch`
- build: checkout → Node LTS → `npm ci` → `npm run verify` → `npm test` → `npm run build`
  → `configure-pages` → `upload-pages-artifact(dist/)`
- deploy: `deploy-pages`。`permissions: {pages: write, id-token: write}`
- **手動設定**: Settings → Pages → Source を「GitHub Actions」にする(1回だけ)

---

## 14. 実装時に迷ったら

1. **3歳児が泣かないか。** 迷ったら易しい方・優しい方を選ぶ。
2. **`npm run verify` と `npm test` を通す。** 定数をいじったら必ず両方走らせる。
   「遊べるかどうか」は目視ではなく検算で担保する。
3. **跳ね返らせない。** 壁でも板でも。跳ね返りは *強すぎ = 失敗* を壊す。
4. **`src/game/` に Canvas / DOM を持ち込まない。**
5. **外部素材を足さない。** 画像・音・フォント・CDN すべて禁止。
6. これら以外の仕様変更は発注者確認なしに行わない。
