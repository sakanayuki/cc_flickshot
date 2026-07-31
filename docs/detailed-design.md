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
| 弾く向き | 斜め上(仰角26°) | **ほぼ横**(仰角12°。→ 後に §0.35 で 28° に戻した) |
| 強すぎたとき | 天井に当たって減速、失敗しない | **奥の穴に落ちて没収** |
| 弱すぎたとき | 同じ段に戻る | **手前の穴に落ちて没収** |
| クリア | 山頂のゴールバスケット | **最下段の下のあたりの口** |
| 難易度差 | 穴の数・半径・落下閾値・ゴール幅・リップ高の5つ | **板の幅だけ** |
| 盤面の高さ | 画面の 55% | **画面の 74%** |
| プランジャー帯 | 画面の 41%(指ストローク450px) | **画面の 22%**(指ストローク240px) |

旧ルール固有の仕組み(上向きシャフト、レーン先端・裏面の当たり判定、リップ越えの転落、
転がり速度による穴判定、壁での跳ね返り)は**すべて削除した**。

### 0.35 盤面の作り直し(2026-07-28(4))— 貫通の原因と対処

**発注者から「棒を貫通する」との指摘があった。これはチューニングでは直せない
構造的な欠陥だったため、盤面の幾何と衝突判定を作り直した。**

旧設計は「溝は板の低い**側**」「弾く向きは**溝と反対**」だった。
つまりコインは自分が乗っている板の上を逆走する形で飛び出す。
板は飛行方向に向かってせり上がっているので、**どんな弾道でも板の内部を通る**。
さらに着地判定を「1段下の板だけ」に限っていたため、自分の板との衝突が
そもそも計算されず、コインが板をすり抜けて見えていた。

| | 旧 | 新 |
|---|---|---|
| 板の並び | 中央を挟んで左右にずらす | **ジグザグ**(溝が中央の隙間を挟んで向かい合う) |
| 溝の位置 | 板の低い「側」 | 板の**先端** |
| 弾く向き | 溝と反対(=自分の板の上を逆走) | **先端の外**(自分の板から離れる) |
| 衝突対象 | 1段下の板の上面だけ | **全ての板の実体**(上面+厚み+端面) |
| 積分 | 1フレーム1回 | **1サブステップ 6px 以下に分割** |
| 端に当たったとき | 判定なし | 水平の勢いを失ってそのまま落ちる(跳ね返さない) |
| 穴 | 「板でないところ」の帯 | **丸い落とし穴**(実機と同じオレンジのリム付き) |
| 仰角 | 12° | **28°** |

新しい幾何では、溝から弾いたコインは即座に板の外へ出る。
**自分の板を横切ることが構造的にありえない**ので、貫通は幾何のレベルで消えている。
その上で全板との実体衝突を持たせ、検算 §12-7 が全パワー掃引で担保する。

### 0.36 弾く点を画面の端へ(2026-07-31)— レーンの作り直し

**発注者から実機の写真とともに2点の指摘があった。**

1. レーンを写真の青い線のように引き直すこと。丸くなっているところは穴で、入ればアウト
2. 弾く点が画面中央付近にある。写真のように、**レーンが左右の画面端に接するところの
   横のレバー**で弾く形にすること(プランジャー1操作という仕様はそのまま)

§0.35 の設計は「溝から**板の外**へ弾く」ことで貫通を消していたが、その代償として
弾く点は盤面の中央付近に固定されていた(§3.0.1 の綱引き)。指摘の 2 を満たすには
この前提そのものを裏返すしかない。

| | 前(§0.35) | 現在 |
|---|---|---|
| 先端(弾く点)の位置 | 中央の隙間の両縁(x=230 / 490) | **左右の壁ぎわ(x=124 / 596)** |
| レールの並び | 中央を挟んで向かい合う2本の柱 | **左端・右端・左端…と交互** |
| 弾く向き | 先端の外(板から離れる) | **盤面の内側(自分のレールを飛び越す)** |
| レバーの位置 | 先端の真下 | **先端の横、壁から生える**(写真と同じ) |
| 手前の穴 | 2本の柱の間 | **盤面の中央**(丸を並べて開口を埋める) |
| 奥の穴 | 板の高い端 〜 壁 | **先端 〜 壁(`TIP_INSET`)** |
| 仰角 | 28° | **35°** |
| 板の幅(易/普) | 120 / 80 | **140 / 100** |
| 弾き力 | 530..840 | **665..950** |

自分のレールを飛び越す弾道は、§0.35 が消したはずの貫通が戻ってくる形でもある。
今回はそれを**幾何で消すのではなく、成立条件として明文化して機械で守る**:

- 仰角ぶんの上昇がレールの傾きぶんの上昇を全長にわたって上回ること
  → 下限が `FLICK_RISE` / `P_MIN`、上限が `plankWidth` / `PLANK_DROP`
- 頂点が高くなりすぎて 1 段上のレールの裏に当たらないこと
  → 上限が `FLICK_RISE` / `P_MAX`
- 高い端の返し(旧 `PLANK_LIP`)は**廃止**。返しがあると飛び越せない。
  着地したコインは必ず先端側へ転がるので、返しはもともと不要だった

前者2つは検算 §12-8 が、物理エンジンを通さない理想の放物線で直接測る。
エンジンの押し出しに隠されて「当たっているのに検算は通る」状態を防ぐため、
§12-7(実物理の掃引)とは別に持っている。現在の余裕は最小 14px(コイン半径の半分)。

### 0.4 設計の中心にある考え方

1. **5つの遷移をすべて同一条件にする。**
   段1→2、2→3、3→4、4→5、段5→あたりの口の「横に飛ぶ距離」と「落差」を完全に等しくする。
   先端は左右の壁ぎわ(`TIP_LEFT_X` / `TIP_RIGHT_X`)に交互に固定され、
   着地するレールも必ず反対側の壁ぎわにあるので、
   どの遷移も「自分のレールを飛び越え、中央の穴を越えて、同じ幅のレールに乗る」になる。
   チューニング定数は `P_MIN` / `P_MAX` の2つで済み、
   3歳児は「同じ引き方」を5回繰り返せばよい。
2. **弾く向きは壁と反対、盤面の内側。**
   弾く点が壁ぎわにある以上これしかない。飛び出したコインは自分のレールを飛び越すので、
   飛び越せることが設計の必須条件になる(§0.36)。
3. **失敗は必ず両側にある。**
   弱すぎ → 中央の穴、強すぎ → 飛び越した先の壁ぎわの穴。
   片側しか失敗しない配置は設計が崩れている証拠なので、検算スクリプトが自動で落とす。
4. **時間的な制約を作らない。**
   着地したコインは板の傾斜で必ず溝まで転がって止まる。
   3歳児が落ち着いてプランジャーを引ける時間を無制限に確保する。
5. **跳ね返らせない。**
   壁でも板でも跳ね返らせない。跳ね返ると「強すぎたのに壁のおかげで助かる」が起き、
   *強すぎ = 失敗* というルールが崩れる。板の端に当たったときも、
   水平の勢いを殺してそのまま落とす。

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

### 3.0 全体像

```
                                       [投入口]
 段1:            ○ ○ ○      ━━レール━━◎|   ← 先端 x=596(右)。左へ弾く
 段2: |○ ◎━━レール━━      ○ ○ ○         ← 先端 x=124(左)。右へ弾く
 段3:            ○ ○ ○      ━━レール━━◎|
 段4: |○ ◎━━レール━━      ○ ○ ○
 段5:            ○ ○ ○      ━━レール━━◎|
 口 : |○ ━あたりの口━                       ← 段5 から左へ弾いて入れる
      40  124        264    456       596  680
```

- `◎` = 溝(コインが止まる先端)。**すぐ横の壁にレバーが付く**
- `○` = 丸い落とし穴(アウト)
- `|` = 先端と壁の隙間 `TIP_INSET = 84`。ここも落とし穴

先端は左右の壁ぎわに交互に固定されている。コインはそこで止まり、
**盤面の内側へ**弾かれて自分のレールを飛び越し、中央の穴の上を飛んで、
反対側の壁ぎわにある1段下のレールに着地する。

### 3.0.1 先端の位置を決めているもの(重要)

先端は壁から `TIP_INSET` だけ内側にある。この隙間がそのまま「強すぎ」で落ちる
奥の穴なので、**コイン1枚(`COIN_R * 2 = 56`)より狭くできない**。
逆に広げすぎると弾く点が中央へ戻ってしまい、発注者の指摘(§0.36)を満たさなくなる。
現在の 84 は「壁から板幅の 13%」で、検算 §12-1 が両側から挟んでいる。

板幅の上限を決めているのは壁ではなく、**自分のレールを飛び越せるか**になった。

```
仰角ぶんの上昇 gain(w) = tan(FLICK_RISE)·w − g·w² / (2·vx²)  >  PLANK_DROP
```

`w` を広げるほど、また `P_MIN` を下げるほど余裕が減る。検算 §12-8 が全パワーで測る。

| | 前(2026-07-28(4)) | 現在 |
|---|---|---|
| 先端(弾く点)の x | 230 / 490 | **124 / 596** |
| 先端から壁まで | 190 | **84** |
| 先端から壁まで(盤面幅比) | 30% | **13%** |
| 板の幅(易/普) | 120 / 80 | **140 / 100** |
| `PLANK_DROP` | 20 | **8** |

### 3.1 段(板)

```ts
interface Row {
  index: number;      // 0..4
  left: number;       // 板の左端 x
  right: number;      // 板の右端 x
  grooveSide: 'left' | 'right';   // 溝が板のどちらの「端」か
  grooveY: number;    // 溝(板の低い先端)の y
  highY: number;      // 板の高い端の y = grooveY - PLANK_DROP
}
```

- 段数 `ROW_COUNT = 5`。溝の y は `ROW_TOP_Y + i * ROW_GAP` = 210, 355, 500, 645, 790。
- 偶数段(index 0,2,4)は `grooveSide = 'right'`、先端は右壁ぎわ、板は左へ伸び、**左へ**弾く。
- 奇数段(index 1,3)は `grooveSide = 'left'`、先端は左壁ぎわ、板は右へ伸び、**右へ**弾く。
- 板は溝側に `PLANK_DROP = 8` px だけ下っている。コインはこの傾斜で必ず先端まで転がる。
- 板の厚みは `PLANK_THICK = 20`。**この厚みは実体で、コインが衝突する。**
- **高い端に返し(ストッパー)は無い。** 付けると弾いたコインが自分のレールを
  飛び越せなくなる。着地したコインは必ず先端側へ転がるので、返しは要らない(§0.36)。

### 3.2 先端の x — 5つの遷移を同一条件にする配置

```ts
TIP_INSET   = 84
TIP_LEFT_X  = BOARD_LEFT  + 84 =  124        // 奇数段の先端(板は右へ)
TIP_RIGHT_X = BOARD_RIGHT - 84 =  596        // 偶数段の先端(板は左へ)
TIP_SPAN    = 596 - 124        =  472
```

```
偶数段 → [left, right] = [596 - w, 596    ]
奇数段 → [left, right] = [124,     124 + w]
```

先端 596 から左へ弾いたコインが乗るべき板の右端(高い端)が `124 + w`、
先端 124 から右へ弾いたコインが乗るべき板の左端が `596 - w` になる。
結果として**どの遷移でも「飛び越す最短距離」が `TIP_SPAN − w`、落差が `ROW_GAP = 145` px**。
先端の位置は板幅 `w` によらず一切動かないので、難易度を変えても指の感覚が変わらない(§5)。

> **中央の穴(`TIP_SPAN − 2w`)を 0 にしてはならない。** 0 にすると「弱すぎ」で
> 落ちる余地が消え、強すぎでしか失敗しない片側だけのゲームになる。

### 3.3 難易度別の実測値

| | やさしい (w=140) | ふつう (w=100) |
|---|---|---|
| 偶数段の先端 x | 596 | 596 |
| 奇数段の先端 x | 124 | 124 |
| 板(偶数段) | 456 .. 596 | 496 .. 596 |
| 板(奇数段) | 124 .. 264 | 124 .. 224 |
| 中央の穴(= 手前の穴) | 264 .. 456(192) | 224 .. 496(272) |
| 飛び越す最短の横距離 | 332 | 372 |
| 落差 | 145 | 145 |
| 先端と壁の隙間(= 奥の穴) | 84 | 84 |

どちらも `BOARD_LEFT = 40` .. `BOARD_RIGHT = 680` に収まっている(検算 §12-1)。

> **板幅の上限は「自分のレールを飛び越せること」で決まる。** 板を広げると
> `P_MIN` で弾いたコインが高い端の角に当たる。検算 §12-8 がこれを落とす。

### 3.4 あたりの口

```ts
interface WinPocket { left: number; right: number; y: number }
```

- 段5(先端は右端 x=596)から左へ弾いて入れる位置に置く。
  奇数段の板とまったく同じ `left = 124`、`right = 124 + w`。
  6つ目の遷移も他と完全に同一条件になる。
- `y = ROW_TOP_Y + ROW_COUNT * ROW_GAP = 935`。段5の溝(790)から 145px 下。
- 幅は板と同じなので、**難易度差はあたりの口にもそのまま効く**。
- 成功判定 `inWinPocket` は左右 4px ずつ内側に絞る。
  口の縁ぎりぎりで「入ったのか外れたのか分からない」判定を避けるため。

### 3.5 穴

```ts
interface Hole {
  rowIndex: number;            // その穴がある段。ROW_COUNT ならあたりの口の高さ
  left: number; right: number; // 落下として扱う x 範囲
  y: number;                   // 落下レベル(その段の板面の高さ)
  kind: 'near' | 'far';        // 間(弱すぎ) / 奥(強すぎ)
  cx: number; cy: number;      // 見た目の中心
  rx: number; ry: number;      // 見た目の半径(楕円)
}
```

段2〜段5とあたりの口の高さについて、`near` と `far` の両方を作る。

| 種別 | 落下範囲 | 見た目 |
|---|---|---|
| `near`(中央の穴) | 弾いた側のレールの高い端 〜 着地するレールの高い端 | **丸を並べて開口をまるごと埋める**。1つの幅が `NEAR_HOLE_PITCH = 72` に近くなる個数に割る |
| `far`(奥の穴) | 着地するレールの先端 〜 壁(`TIP_INSET`) | 丸穴 1 つ。`rx = 42`、`ry = 30` |

- **段1には穴を作らない。** 投入されるだけで、着地判定の対象にならないため。
- `far` がどちら側かは、**1つ上の段からどちらへ弾かれてくるか**で決まる。
- **`near` は落下範囲と見た目を一致させる。** 丸穴にして隙間より小さく描くと、
  隙間の端に落ちたコインが「板でないところ」から穴まで滑って見え、
  *板の上に乗ったのに落ちた* ように読めてしまう。
  写真の「レーンの丸くなっているところが穴」という指定にも、
  丸を隙間なく並べるほうが近い。
  この不一致は Vitest の「間の穴は隙間をほぼ埋めている」が検出する。
- 幅が 0 の穴は作られない。この状態は片側の失敗が消えることを
  意味するので、検算 §12-1 と §12-3 が別途落とす。

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
  fallFrom: Vec2;     // falling に入った瞬間の位置(落下演出の始点)
  spin: number;       // 見た目の回転
}
```

### 4.2 `onPlank` の更新

```ts
slope = (row.grooveY - row.highY) / (row.right - row.left)   // tanθ
dir   = downhillDirX(row)                                     // 溝へ向かう向き = 弾く向き
a  = GRAVITY * slope * dir - ROLL_DAMPING * vx
vx += a * dt
x  += vx * dt
spin += vx * dt / COIN_R
```

- 溝(`groovePos(row).x`)に達したら `x` を溝に固定し `vx = 0`。ここでレバーにもたれる。
- 高い端は `highEndX(row) + dir * 4` で押さえるだけ(返しは無い)。
  着地したコインは必ず先端側へ転がるので、ここへ戻ってくることはない。
  着地の瞬間だけ端からはみ出さないようにするための保険。
- コイン中心の y は常に `plankCoinY(row, x) = plankSurfaceY(row, x) - COIN_R`。

`GRAVITY = 2200`、`ROLL_DAMPING = 1.4`。
やさしい (w=140) の傾き `tanθ = 8/140 = 0.057` → 終端速度は約 90px/s。
着地したコインは飛んできた横向きの勢いを引き継ぐので、実際にはもっと速く先端へ着く。

### 4.3 発射

```ts
canFlick(coin, rows) := coin.state === 'onPlank'
                        && |coin.x - groovePos(row).x| <= FLICK_ZONE_PX (90)

flickCoin(coin, rows, power):
  dir = flickDirX(row)          // grooveSide === 'left' なら -1(左へ)
  vel = { x: dir * power * cos(FLICK_RISE),
          y: -power * sin(FLICK_RISE) }   // FLICK_RISE = 35°
  state = 'airborne'
```

- **`flickDirX` は必ず「壁と反対=盤面の内側」を返す。** 溝は壁ぎわの先端なので、
  弾かれたコインは自分のレールの上を飛び越していく(§0.36)。
- コインは必ず溝で停止するため、実際には常にゾーン内にいる。
  `FLICK_ZONE_PX = 90` は中央の穴(192 / 272)より狭くしてある(検算 §12-6)。
- 仰角 35°。下限は「自分のレールを飛び越せること」、
  上限は「頂点が 1 段上のレールの裏に届かないこと」で挟まれている(§0.36)。

### 4.4 `airborne` の更新 — サブステップ+全板の実体衝突

**1フレームを、1サブステップの移動量が `MAX_SUBSTEP_MOVE = 6` px を
超えないように分割して積分する**(上限 12 分割)。これが高速時のすり抜けを防ぐ。

```ts
speed = |vel|(重力込み)
steps = clamp(ceil(speed * dt / MAX_SUBSTEP_MOVE), 1, 12)
h     = dt / steps

for s in 0..steps-1:
  prev = pos
  vel.y += GRAVITY * h
  pos   += vel * h

  // 壁: 跳ね返らせず、横速度を殺して滑り落とす
  if (pos.x - COIN_R < BOARD_LEFT)  { pos.x = BOARD_LEFT + COIN_R;  if(vel.x<0) vel.x = 0 }
  if (pos.x + COIN_R > BOARD_RIGHT) { pos.x = BOARD_RIGHT - COIN_R; if(vel.x>0) vel.x = 0 }

  for row of rows:                      // ★ 全ての板と衝突する
    // 上面への着地。下向きに面を横切った瞬間だけ乗せる(跳ねない)
    if vel.y >= 0 && onPlank(row, pos.x)
       && prev.y <= plankCoinY(row, prev.x) + 1
       && pos.y  >= plankCoinY(row, pos.x):
         → state='onPlank', rowIndex=row.index, x=pos.x, vx=vel.x, landedOnRow=row.index
    // 端面(左端・右端)との衝突
    collidePlankEnd(row, row.left,  -1)
    collidePlankEnd(row, row.right, +1)

  // あたりの口
  if isPocket && vel.y > 0 && pos.y >= pocket.y - COIN_R && inWinPocket(pocket, pos.x)
     → state='win', reachedWin=true

  // 落下確定
  if pos.y > captureY:                  // 1段下の板面 + CAPTURE_BELOW
     → state='falling', hole=findHole(targetIndex, pos.x), fallFrom=pos
```

`collidePlankEnd(row, endX, outward)` は、コインの円と板の端の**縦の線分**
(上面から底面まで)との最近接距離で判定する。

```ts
top    = plankSurfaceY(row, endX)
bottom = plankSurfaceY(row, endX) + PLANK_THICK
if (pos.y + COIN_R < top) return false           // コインの下端がまだ板面より上
nearY = clamp(pos.y, top, bottom)
if ((pos.x-endX)² + (pos.y-nearY)² >= COIN_R²) return false
if ((pos.x-endX) * outward < 0) return false     // 外側から当たったときだけ
pos.x = endX + outward * push                    // めり込みぶん水平に押し出す
if (vel.x * outward < 0) vel.x = 0               // 跳ね返さず、勢いだけ殺す
```

**跳ね返らせないことが重要。** 壁でも板の端でも跳ね返らせると、
強く弾いたコインが戻って板に乗り、「強すぎ = 失敗」が成立しなくなる。

> **除外条件を「板面より上なら上面判定に任せる」と書いてはならない。**
> 上面判定は板の範囲内(`onPlank`)でしか働かないので、範囲外から
> 板の角に食い込むコインがどちらの判定にも拾われず、板を突き抜ける。
> 実際 `pos.y < top - COIN_R*0.35` と書いていた時期があり、
> 中央の隙間を 120 → 260 に広げた瞬間にその経路が現れて
> 12px のめり込みが出た(検算 §12-7 が検出)。
> 判定は必ず**コインの下端が板面に触れているか**で行う。

`findHole` は落下 x を含む穴を返す。どの穴の範囲にも入らなければ、
同じ段で最も近い穴を返す(演出の落下先が null にならないようにする)。

### 4.5 `falling` / `win`

どちらも `timer += dt` するだけの演出状態。物理は止まる。

- `falling`: `FALL_ANIM = 1.0` 秒。
  `0..0.3` 穴の口まで滑る → `0.3..0.8` 沈みながら縮小 → `0.8..` フェード。
  沈み始めたら**穴の手前側のリムをコインの上に重ねて描く**(`drawRoundHoleFront`)。
  これで「穴の中へ入っていく」ように見える。
- `win`: `WIN_ANIM = 1.5` 秒。あたりの口の中で小さく跳ねる。

---

## 5. 難易度

### 5.1 パラメータ

```ts
DIFFICULTIES = {
  easy:   { id: 'easy',   label: 'やさしい', plankWidth: 140 },
  normal: { id: 'normal', label: 'ふつう',   plankWidth: 100 },
}
```

**難易度差は板の幅だけ。** 弾き力の範囲・ストローク・重力・段間距離はすべて共通。
先端の位置(124 / 596)は板幅に依存しないので、落差も弾く点も難易度で動かない。
難易度を切り替えても指の感覚が変わらないので3歳児が混乱しない。

### 5.2 実測された成功域(`npm run verify`)

| 遷移 | やさしい | ふつう |
|---|---|---|
| 段1 → 段2 | 65%(pull 0.13〜0.75) | 45%(pull 0.33〜0.75) |
| 段2 → 段3 | 65% | 45% |
| 段3 → 段4 | 65% | 45% |
| 段4 → 段5 | 65% | 45% |
| 段5 → あたりの口 | 68%(pull 0.09〜0.73) | 48%(pull 0.28〜0.73) |

- すべて**連続した1区間**。飛び地はない。
- すべての遷移で**弱すぎ・強すぎの両方の失敗が存在する**。
- やさしい (最小 65%) > ふつう (最小 45%)。
- あたりの口だけ他よりわずかに広いのは、口の面が水平で、
  板の高い端(`PLANK_DROP` ぶん高い)ほど手前で引っかからないため。

### 5.3 P_MIN / P_MAX の決め方

手で決めてはいけない。**成功する power の境界を実測してから逆算する。**
境界を外すと成功域が一気に痩せる(手で 250..800 と置いていたとき、
同じ盤面で成功域が 71% → 33% まで落ちた)。

```
a  = 成功する power の下限(全段で最も厳しい段)
be = やさしいの上限   bn = ふつうの上限
                                   ↓ 二分探索で実測する
plo  = a - (be - a) * 0.2          // 弱すぎ区間をストロークの約12%残す
pmax = plo + (be - a) / 0.62       // やさしいの成功域を 62% に置く
pmin = (plo - 0.05 * pmax) / 0.95  // plo は pull=PULL_DEADZONE のときの power
```

ふつうの成功域は `(bn - a) / (be - a)` で自動的に決まるので、
`plankWidth` の比だけで調整する。

### 5.4 チューニングの経緯(再発防止のため記録)

| 試した値 | 結果 | 判断 |
|---|---|---|
| 旧: 溝は板の「側」、弾く向きは溝と反対 | 弾道が必ず自分の板を通る = **貫通** | 却下。幾何を作り直した(§0.35) |
| `FLICK_RISE = 12°` | 弾道がほぼ直線で「弾かれた」感が出ない | 却下。28° に上げた |
| 溝を中央の隙間の縁に置く(§0.35) | 遊べるが**弾く点が中央付近に固定される**(壁から 190px) | 却下。発注者の指摘(§0.36)に反する |
| 先端を壁ぎわへ+仰角 45〜55° | 自分のレールは余裕で越えるが、**頂点が 1 段上のレールの裏に当たる** | 却下。仰角を下げた |
| 先端を壁ぎわへ+仰角 35°、板 140/100、`PLANK_DROP = 8` | 自分のレールとの余裕 14px。易 65〜68%、普 45〜48% | **採用** |
| `P_MIN = 650` | 弱すぎ区間は広がるが、自分のレールとの余裕が 8.5px まで落ちる | 665 に上げた |
| `P_MIN = 680` | 余裕は十分だが、**最下段だけ弱すぎ失敗が消える** | 却下(検算 §12-3 が落とした) |

板幅の上限は「自分のレールを飛び越せること」で決まる(§3.3)。
`P_MIN` を下げるか板を広げるかすると余裕が消え、検算 §12-8 が落とす。

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
power = P_MIN + (P_MAX - P_MIN) * pull      // 665 .. 950 px/s
if (pull < PULL_DEADZONE = 0.05) → 発射しない(誤タップで空撃ちしない)
```

### 6.5 レバー(ハンマー)

```ts
interface LeverState {
  swing: number;   // -1..0 タメ / 0 静止 / 0..1 はたき(1 が振り上げの頂点)
  timer: number;   // はたきアニメの残り
  flash: number;   // 打撃直後の光 (0..1)
}
```

- 見た目: **壁の側から先端のコインの横に立つハンマー**(実機の写真と同じ)。
  軸は溝より壁寄りの `grooveX - flickDirX * 20`、高さ `grooveY + PLANK_THICK + 18`。
  軸がコインの外側にあるので、振ると必ずコインを盤面の内側へ押し出す形になる。
- 軸は筐体の側面を貫いて丸いノブになる(`drawSideKnobs`)。先端が右・左・右…と
  交互なので、ノブも左右交互に並ぶ。ロッド(`drawLeverRods`)が壁のノブと軸をつなぐ。
- 引いている間: `swing = -pull`(全段が連動して外側へ巻き上がる。タメの視覚フィードバック)
- 発射時 `triggerLevers()`: 全段の `timer = LEVER_SWING_TIME (0.22s)`、`flash = 1`。
  `t < 0.35` で一気に振り上げ、その後戻る。振り上げ中は扇形の残像を描く。
- レバーは**見た目だけ**。当たり判定は `canFlick` / `flickCoin` が持つ。

### 6.6 発射のタイミング — レバーが当たってから飛ぶ

`pointerup` の瞬間にコインが飛ぶと、レバーが振り上がる前にコインが消えて
「はたかれた」ように見えない。そこで発射を `LEVER_HIT_DELAY = 0.06` 秒だけ遅らせる。

```
pointerup → triggerLevers() ですぐレバーが動き出す
          → pendingPower に power を積む
0.06s 後  → flickCoin(power)。同時に打撃点に星を撒く
```

`beginEnding()` は `pendingPower` を破棄する(あきらめた直後に飛ばないように)。

### 6.7 クールダウン

発射後 `FLICK_COOLDOWN = 0.35` 秒は再度掴めない。表示はしない。

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
1  drawCabinetBase            画面全体の赤いキャビネット+金の帯
2  drawBoardFace              化粧板(おひさま・雲・草花・コース案内の矢印)
3  drawEntryChute             投入口から段1へのシュート
4  drawRoundHole × n          間の穴(隙間まるごと)と奥の丸穴
5  drawWinPocket              あたりの口+旗
6  drawSideAnimals            板より先に描くので腰から下が隠れる
7  drawLeverRods              ノブと弾き部をつなぐロッド(板の下を通る)
8  drawPlank × 5
9  drawLever × 5              板の先端にぶら下がるハンマー
10 コイン(状態別)+ drawRoundHoleFront(沈むとき手前のリムを重ねる)
11 particles                  着地の土煙・打撃の星・あたりの紙吹雪
12 drawBoardFrame             窓枠+ネジ+ガラスの反射。中身を全部覆う
13 drawSideKnobs              筐体の左右の縁に並ぶレバーのノブ
14 drawCabinetLower           プランジャー帯の装飾+あたりの受け皿
15 drawCoinSlot               右上の投入口
16 drawInsertCoin             insert フェーズのみ
17 drawPlunger
18 drawGiveUpButton
19 drawHandGuide              条件を満たすときのみ
```

**レバーのノブは筐体の左右の縁に置く。** 実機ではレバーの軸が側面を貫いて
ノブになっている。板は溝の反対側の壁へ伸びるので、ノブはその壁側に付き、
結果として段ごとに左・右・左…と交互に並ぶ。窓枠(12)より後に描いて、
枠に載って見えるようにする。

**順序の要点**: コインとパーティクルは窓枠(11)より先に描く。
こうすると盤面からはみ出したものが枠に隠れ、ガラスの内側に収まって見える。

### 8.2 カラーパレット

```ts
sky '#8FD3F4'  skyTop '#BDE9FF'  sun '#FFE066'  cloud '#FFFFFF'
// 筐体(実機の赤いキャビネット)
cabinet '#D8452F'  cabinetDark '#A93223'  cabinetTrim '#F2B33D'  cabinetTrimDark '#C98F1E'
// 盤面の化粧板
boardFace '#FFF3CF'  boardFaceDeep '#F5DE9E'
// レール
plankTop '#F5B04C'  plankSide '#C97F23'  plankEdge '#6B4423'
lever '#E8503A'  leverDark '#B23324'
// 丸穴(こげ茶の穴+オレンジのリム)
hole '#2A1B0C'  holePit '#120B04'  holeRing '#FF7A2F'  holeRingDark '#D65A17'
coinRim '#F5C242'  coinFace '#FFF3D0'
pocket '#F5C242'  pocketDark '#D9A227'  flagRed '#E8503A'
ink '#3B2A1A'  panel '#FFF8EC'  accent '#FF8A3D'  disabled '#C9C2B6'
```

`LINE_W = 4`。3歳児の視認性のため輪郭線を細くしない。

### 8.3 穴の描き方

奥行きが出るように、1つの穴を**手前と奥に分けて**描く。
どちらも `rx` / `ry` の楕円。中央の穴は写真と同じく**丸を隙間なく並べて**開口を埋め、
奥の穴(壁ぎわ)は丸 1 つで描く。

| 関数 | 内容 | 描くタイミング |
|---|---|---|
| `drawRoundHole` | 影 → オレンジのリム(下半分を暗く)→ 穴の中(放射グラデーション)→ 奥の内壁 | コインより**前** |
| `drawRoundHoleFront` | 手前半分のリング+手前の内壁 | 沈むコインより**後** |

コインが穴に入る瞬間に `drawRoundHoleFront` を重ねることで、
コインの下半分がリムに隠れて「穴の中へ落ちていく」ように見える。

### 8.35 化粧板の絵柄をどこに置くか

レールの左右はどちらも穴になったので、印刷の草花は**段と段のあいだの壁ぎわ**に置く。
コインの通り道(中央)にも穴にもかからない唯一の余白で、
実機の賑やかさをそこだけで出す。落下地点の見通しは損なわない。

### 8.4 描画関数一覧(`render/drawings.ts`)

```
空      drawSky, drawSunAndClouds                (タイトル / リザルト用)
筐体    drawCabinetBase, drawCabinetLower, drawBoardFrame, drawBoardFace
盤面    drawRoundHole, drawRoundHoleFront, drawPlank, drawLever, drawWinPocket
コイン  drawCoin, drawCoinShadow, drawCoinSlot, entryChute, drawEntryChute, drawInsertCoin
操作    drawPlunger, drawHandGuide, drawGiveUpButton, drawButton
収集    drawStamp, drawStampBook
画面    drawTitleLogo, drawResultSteps
装飾    drawSideAnimals
```

- `drawCoin` は `squash` 引数で着地のつぶれを表現する
  (`LAND_SQUASH_TIME = 0.14` 秒、`sin` で往復)。
- `drawCoinShadow` は空中のコインの真下、着地面に落ちる影。
  高さに応じて濃さと大きさが変わり、どこに落ちるかの手がかりになる。

- どうぶつの顔は `render/animals.ts`(`drawAnimalFace`, `drawCheerAnimal`)。
- 図形・文字の下請けは `render/shapes.ts`(`roundRect`, `circle`, `ellipse`, `polygon`,
  `paint`, `line`, `text`, `clamp01`, `lerp`, `easeOut`, `easeBack`, `dist`, `rectContains`)。
- **外部素材は一切使わない。** 画像・音声・フォント・CDN への参照ゼロ。
  ビルド後のバンドルを grep して確認すること。

### 8.5 パーティクル

`render/particles.ts`。3種類を1つのシステムで扱う。上限 300 個。

| 種類 | 用途 | 挙動 |
|---|---|---|
| `confetti` | あたり(ゲーム画面・リザルト両方) | 重力+左右の揺れ+回転。画面外で消える |
| `puff` | 着地の土煙、穴に落ちた瞬間 | 左右に広がりながら膨らんでフェード。0.35〜0.55秒 |
| `star` | レバーの打撃、板の端にぶつかった瞬間 | 放射状に飛んで落ちる。0.3〜0.45秒 |

リザルトのあたりでは 0.4 秒ごとに 20 個の紙吹雪を追加し続ける。

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

groovePos(row: Row): Vec2           // 溝(壁ぎわの先端)でのコイン中心
flickDirX(row: Row): number         // 弾き出す向き(grooveSide==='left' なら +1)
downhillDirX(row: Row): number      // 板が下る向き。-flickDirX
highEndX(row: Row): number          // 板の高い端の x(先端の反対 = 盤面の内側)
plankSurfaceY(row: Row, x: number): number
plankCoinY(row: Row, x: number): number
onPlank(row: Row, x: number): boolean
inWinPocket(pocket: WinPocket, x: number): boolean
nearGapWidth(d: DifficultyConfig): number   // 中央の穴の幅
```

> `flickDirX === -downhillDirX` は偶然ではなく設計そのもの。
> 溝は壁ぎわの先端にあり、コインはそこへ転がり降りて、来た向きへ弾き返される。
> だから**弾いたコインは自分のレールを飛び越す**(§0.36、検算 §12-8)。

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
  bonk: Vec2 | null;      // 板の端にぶつかった位置(星の演出用)
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
BOARD_CENTER_X = 360
ROW_COUNT  = 5           ROW_GAP = 145           ROW_TOP_Y = 210
TIP_INSET  = 84          TIP_LEFT_X = 124        TIP_RIGHT_X = 596
TIP_SPAN   = 472
PLANK_DROP = 8           PLANK_THICK = 20
CAPTURE_BELOW = 14

// 物理
GRAVITY = 2200           ROLL_DAMPING = 1.4
FIXED_DT = 1/60          MAX_FRAME_TIME = 0.25
MAX_SUBSTEP_MOVE = 6     // 空中の1サブステップの最大移動量(貫通防止)

// 弾き(手で決めず §5.3 の手順で逆算する)
P_MIN = 665              P_MAX = 950
FLICK_RISE_DEG = 35      FLICK_ZONE_PX = 90
FLICK_COOLDOWN = 0.35    LEVER_SWING_TIME = 0.22   LEVER_HIT_DELAY = 0.06

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
LAND_SQUASH_TIME = 0.14
COIN_SLOT_CENTER = {x:618, y:96}     COIN_SLOT_SIZE = {w:118, h:84}

// 難易度
easy:   plankWidth 140
normal: plankWidth 100

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
| 1 | 段とあたりの口の座標が盤面 (40..680, ..994) に収まっている。<br>**各段の高い端と壁の間に `COIN_R * 2` 以上の隙間がある**(奥の穴が消えていない) |
| 2 | 5つの遷移の「横に飛ぶ距離」と「落差」がすべて同一。間の穴が `COIN_R` より広い |
| 3 | 各遷移の成功域を pull 0.05〜1.00 を 0.005 刻みで実シミュレーションして測る<br>・成功域が**連続**している(飛び地がない)<br>・**弱すぎでも強すぎでも落ちる**(片側しか失敗しないなら板が壁に接している)<br>・やさしい 60〜100%、ふつう 30〜50%、やさしい > ふつう |
| 4 | 投入後に放置しても落ちない。放置すると溝で止まって弾ける状態になる |
| 5 | どの `power` でもコインが盤面外に出ない。座標が NaN/Infinity にならない |
| 6 | プランジャー帯 ≤ 25%、盤面とノブが重ならない、指のストロークが画面内、<br>引ききってもノブが画面内、弾きゾーン < 中央の穴の幅 |
| 7 | **板を貫通しないこと(全パワー掃引)**。全段 × `P_MIN..P_MAX` を 10 刻みで飛ばし、<br>飛行中の全サブフレームでコインの円が板の実体に食い込む深さを測る。**4px 以下**であること |
| 8 | **弾道が自分のレールと 1 段上のレールを避けること**。物理エンジンを通さない<br>理想の放物線で余裕を測る。**`COIN_R / 2 = 14px` 以上**空いていること |

§7 は発注者からの「棒を貫通する」という不具合報告(§0.35)の再発防止。
§8 はその弾道版(§0.36)で、エンジンの押し出しに隠された接触を検出する。
現在の実測値は貫通 **両難易度とも 0.0px**、弾道の余裕 **14.1 / 14.6px**。

### 12.2 `npm test`(Vitest、79 テスト)

- `src/game/coin.test.ts`(48): 幾何・弾き・転がり・成功域スキャン・**貫通しないこと**・頑健性
  - 「間の穴は隙間をほぼ埋めている」= 落下範囲と見た目の一致(§3.5)
  - 「弾く点(溝)が画面の端にある」= 発注者の指摘(§0.36)を数値で固定する
  - 「弾く向きは壁と反対、盤面の内側」を溝の前後で `onPlank` を見て直接テストする
  - 全パワー掃引でのめり込み測定(検算 §7 と同じ判定)
  - 板の先端に横から高速で打ち込んで、止まって落ちる(すり抜けない)ことをテストする
- `src/game/plunger.test.ts`(19): 掴み判定、`pull` の境界、デッドゾーン、クールダウン、`pointercancel`
- `src/save.test.ts`(14): 保存・読込・不正値の sanitize・localStorage 例外時のフォールバック

### 12.3 ブラウザでの通しプレイ(Playwright + Chromium, 450×800)

実際に確認した内容:

- タイトル → やさしい → 投入アニメ → 溝で停止
- pull 0.45 を5回繰り返して5段降り、あたりの口に入る → 紙吹雪 →「やったね!」+ スタンプ獲得
- pull 0.07(弱すぎ)で**中央の穴**に落ち、リムに隠れながら沈む →「おしい!」
- pull 1.00(強すぎ)で**壁ぎわの奥の穴**(先端を飛び越した先)に落ちる
- スタンプが localStorage に残り、リロード後のタイトルに表示される
- `pageerror` が1件も出ないこと

> リモート実行環境では `/opt/pw-browsers/chromium` を `executablePath` に
> 指定して起動する(`npx playwright install` は不要)。

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
3. **弾く向きは壁と反対、盤面の内側。** 飛び出したコインは自分のレールを飛び越すので、
   飛び越せることを検算 §12-8 で必ず担保する(§0.36)。
   `flickDirX` と `downhillDirX` が一致していることがその不変条件。
4. **跳ね返らせない。** 壁でも板の端でも。跳ね返りは *強すぎ = 失敗* を壊す。
5. **板の幅を広げるときは奥の穴を潰していないか確認する。**
   高い端と壁の隙間が `COIN_R * 2` を切ると「強すぎ」で失敗できなくなる。
   板を太くすると溝も中央へ寄る。「弾く点を端に」と「板を太く」は両立しない(§3.0.1)。
6. **`P_MIN` / `P_MAX` を手で置かない。** §5.3 の手順で成功域の境界から逆算する。
7. **`src/game/` に Canvas / DOM を持ち込まない。**
8. **外部素材を足さない。** 画像・音・フォント・CDN すべて禁止。
9. これら以外の仕様変更は発注者確認なしに行わない。
