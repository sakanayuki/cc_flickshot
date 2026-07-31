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

### 0.37 コインは飛ばない。レーンの上を走る(2026-07-31(2))

**発注者から、弾いたあとの動きが違うとの指摘があった。**

> 弾く機能は、玉が飛ぶというより、勢いがついてレーンの上を沿って走るイメージです。
> この青レーンを再現するように忠実にしてください

§0.36 までは放物線で飛ばす設計だったため、盤面は**切れ切れのレール**の集まりに
ならざるをえず、写真の青い線のような「1 本につながったレーン」にできなかった。
物理そのものを置き換えた。

| | 前(§0.36) | 現在 |
|---|---|---|
| コインの動き | 放物線で飛ぶ(2次元) | **レーンに沿って走る(1次元)** |
| 状態 | `onPlank` / `airborne` / `falling` / `win` | **`onLane` / `falling` / `win`** |
| 位置・速度 | `pos: Vec2` と `vel: Vec2` | **経路上の距離 `s` と前向きの速さ `v`** |
| 盤面 | 切れ切れのレール 5 本 | **1 本につながった折れ線**(直線 + 壁でのUターン) |
| 弾く | 仰角つきの初速 | レーンに沿った初速。**仰角という概念が消えた** |
| 止まる場所 | レールの先端の溝 | 走路の端(画面の左右の端)の**止まり木** |
| 穴 | レールとレールの隙間 | **レーンの床に開いた丸い口**(Uターンを出てすぐ) |
| 弱すぎ | 隙間を飛び越せない | **穴の上で勢いを失って落ちる** |
| 強すぎ | 板を飛び越して奥の穴 | **止まり木を乗り越えて**その先の穴へ |
| 難易度差 | 板の長さ | **穴の長さ** |
| 当たり判定 | 全レールの実体(上面+厚み+端面) | **不要**(1次元なので貫通も場外も起きない) |

弾く点が画面の左右の端にあること(§0.36 の要望)と、プランジャー 1 操作で
全レバーが連動する仕様はそのまま維持している。

**消えた不具合と、新しく生まれた不具合の芽。**
1 次元にしたことで「板を貫通する」(§0.35)と「盤面の外に出る」は**原理的に**消えた。
検算 §12-7/§12-8 の弾道チェックも役目を終えて撤去した。
代わりに**「コインがレーンの途中で完全に止まって詰む」**が起こりうる。
弾くこともできず結果も出ないので、進行不能になる。

レーンにわずかな傾き `LANE_ASSIST` を持たせ、止まりかけたコインをゆっくり
前へ送り続けることで潰した。止まりかけの速さ `LANE_CREEP = LANE_ASSIST / LANE_DRAG`
は穴に必ず捕まる速さ(`< HOLE_CATCH_SPEED`)にしてあるので、
「穴の手前で永久に静止する」も起きない。検算 §12-5 が全パワーで確認する。

### 0.4 設計の中心にある考え方

1. **5回の操作をすべて同一条件にする。**
   レーンを「直線 + Uターン」の**合同な繰り返し**で作るので、どの回も
   「Uターン → 穴 → 助走 → 止まり木」の同じ並びを同じ距離だけ通る。
   チューニング定数は `P_MIN` / `P_MAX` の2つで済み、
   3歳児は「同じ引き方」を5回繰り返せばよい。
2. **コインはレーンから離れない。**
   位置は経路上の距離 `s` ひとつだけ。飛ばさないので、貫通も場外も起こりようがない。
3. **失敗は必ず両側にある。**
   弱すぎ → 渡りきれずに穴、強すぎ → 止まり木を乗り越えてその先の穴。
   片側しか失敗しない配置は設計が崩れている証拠なので、検算スクリプトが自動で落とす。
4. **時間的な制約を作らない。**
   コインは必ず止まり木で止まる。
   3歳児が落ち着いてプランジャーを引ける時間を無制限に確保する。
5. **後戻りさせない。**
   跳ね返ると「強すぎたのに戻ってきて助かる」が起き、
   *強すぎ = 失敗* というルールが崩れる。`v` は常に 0 以上。
6. **レーンの途中で止めない。**
   完全に静止すると弾くことも結果を出すこともできず進行不能になる。
   `LANE_ASSIST` が必ず次の止まり木か穴まで送り届ける(§0.37)。

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

## 3. レーンの幾何

### 3.0 全体像

```
      [投入口]
 走路0:  ←──────────────●     ← 右上から入って左へ走る
        ╭╯                      ● = 止まり木(レバー)。走路の端 = 壁ぎわ
 走路1:  ○○──────────────→●     ○ = 穴(アウト)。Uターンを出てすぐ
                          ╰╮
 走路2:  ●←──────────────○○
        ╭╯
 走路3:  ○○──────────────→●
                          ╰╮
 走路4:  ●←──────────────○○
        ╭╯
 走路5:  ○○──────────[あたり]→○  ← 乗り越えたコインが落ちる穴
        145                  575
```

レーンは**1本につながった折れ線**で、コインはこの上を経路に沿った距離 `s` だけで動く。
止まり木から弾かれる → Uターンを回る → 穴を渡る → 次の止まり木で止まる、が1回ぶんの操作。

### 3.1 走路とUターン

```ts
RUN_COUNT   = ROW_COUNT + 1 = 6     // 走路の本数。1 本目は投入用
ROW_COUNT   = 5                     // 止まり木の数 = 弾く回数
ROW_TOP_Y   = 190                   // 1 本目の走路の y
ROW_GAP     = 138                   // 走路から走路までの垂直距離
RUN_LEFT_X  = 145                   // 走路の左端
RUN_RIGHT_X = 680 - (145 - 40) = 575 // 走路の右端(左右対称)
RUN_DROP    = 22                    // 走路の傾き(見た目だけ。物理には効かない)
LANE_W      = 64                    // レーン(溝)の幅。コインの直径 56 より広い
```

- 走路 `i` は `y = ROW_TOP_Y + i * ROW_GAP` から `RUN_DROP` だけ下りながら左右の端を結ぶ。
  走路0 は左へ、以降は右・左…と交互。
- 端まで来たら**半円のUターン**で1段下の走路の始点へつなぐ。Uターンは壁の側へ膨らむ。
  半径は `(ROW_GAP - RUN_DROP) / 2 = 58`。
- **Uターンが壁に食い込んではならない。**
  `RUN_LEFT_X - 58 >= BOARD_LEFT + COIN_R` を満たすこと(検算 §12-1)。
  現在は `145 - 58 = 87 >= 68` で 19px の余裕がある。
- 最後の走路の先は、あたりの口を乗り越えたコインが落ちるための四分円を足して終わる。

折れ線は頂点列 `pts` と累積距離 `cum` で持ち、`posAt(lane, s)` / `dirAt(lane, s)` で
経路上の座標と進行方向を引く。**レーンの形を変えても、遊びの条件を決めるのは
`s` の上の距離だけ**なので、見た目の調整と遊びの調整が分離されている。

### 3.2 止まり木 — 5回の操作を同一条件にする配置

止まり木は走路 0..ROW_COUNT-1 の**終端**、つまり画面の左右の端に置く。
端が左・右・左…と交互なので、レバーも交互に並ぶ(実機の写真と同じ)。

穴は**Uターンを出てすぐ**、次の走路の始まりに置く。したがって
止まり木 `k` から弾かれたコインは必ず

```
Uターン(218px)→ 穴(holeSpan)→ 助走 → 止まり木 k+1
```

の順に通る。レーンが合同な繰り返しでできているので、**この 3 つの距離は
5 回すべてで完全に一致する**(検算 §12-2、Vitest「5つの操作がすべて同じ条件」)。

> **1 本目の走路には穴を置かない。** 投入されただけのコインが没収されてしまう。

### 3.3 難易度別の実測値

| | やさしい (穴 120) | ふつう (穴 190) |
|---|---|---|
| レーン全長 | 3606 | 3606 |
| 止まり木 s | 431 / 1043 / 1655 / 2268 / 2880 | 同左 |
| あたりの口 s | 3493 | 3493 |
| Uターンから穴まで | 218 | 218 |
| 穴の長さ | 120 | 190 |
| 穴から止まり木までの助走 | 311 | 241 |

**止まり木の位置は穴の長さに依存しない。** だから難易度を変えても弾く点も
レーンの形も動かず、指の感覚が変わらない(§5)。

> **穴を長くしすぎてはならない。** 助走が足りなくなり、「渡りきれる勢い」と
> 「止まり木で止まれる勢い」が両立しなくなって成功域が消える。検算 §12-3 が落とす。

### 3.4 あたりの口

レーンの終点(最後の走路の終端)に置く。**止まり木とまったく同じ扱い**で、
`STOP_HOLD_SPEED` 以下で来たコインだけが受け止められる。
乗り越えるとその先の穴に落ちるので、6 回目の操作も他と完全に同一条件になる。

### 3.5 穴

```ts
interface Hole {
  index: number;                     // 0 起点。穴 i は止まり木 i と i+1 のあいだ
  s0: number; s1: number;            // 落下として扱う経路上の区間
  circles: { cx, cy, r }[];          // 見た目の丸。区間を隙間なく埋める
  cx, cy, rx, ry: number;            // 落下演出でコインが吸い込まれる先
}
```

- 区間 `[s0, s1]` を `NEAR_HOLE_PITCH = 74` に近い直径の丸で割って並べる。
  写真の「レーンの丸くなっているところ」と同じ見た目になる。
- **落下範囲と見た目を一致させる。** 丸を小さく描くと「レーンの上にいるのに落ちた」
  ように読めてしまう。Vitest の「穴の丸が区間を隙間なく埋めている」が検出する。
- 穴 `i` は止まり木 `i` と `i+1` のあいだにある。止まり木 `k` から弾いたコインが
  渡るべき穴は `k` なので、
  **穴 `k` に落ちた = 弱すぎ / 穴 `k+1` 以降 = 止まり木を乗り越えた = 強すぎ**。

---

## 4. 物理モデル

### 4.1 コインの状態機械

```ts
type CoinState = 'onLane' | 'falling' | 'win'

interface Coin {
  state: CoinState;
  s: number;          // レーンに沿った位置。これが位置のすべて
  v: number;          // レーンに沿った速さ。つねに 0 以上(後戻りしない)
  held: boolean;      // 止まり木に受け止められて静止中。true のときだけ弾ける
  stopIndex: number;  // 直近で受け止められた止まり木。-1 は投入直後
  pos: Vec2;          // 描画用。posAt(lane, s) の結果
  timer: number;      // falling / win の演出経過秒
  hole: Hole | null;  // falling のとき、落ちた穴
  fallFrom: Vec2;     // falling に入った瞬間の位置
  spin: number;       // 見た目の回転
}
```

`airborne` は無い。**コインは飛ばない。**

### 4.2 `onLane` の更新

```ts
// 1 サブステップの移動量が MAX_SUBSTEP_MOVE (6px) を超えないよう分割する。
// 高速のときに穴や止まり木をまたいで見落とさないため
steps = clamp(ceil(v * dt / MAX_SUBSTEP_MOVE), 1, 24)
h     = dt / steps

for s in 0..steps-1:
  prevS = coin.s
  coin.v += (LANE_ASSIST - LANE_DRAG * coin.v) * h
  coin.s += coin.v * h

  // 止まり木。またいだ瞬間に、受け止められるか乗り越えるかが決まる
  for stop of lane.stops:
    if prevS < stop.s <= coin.s:
      if coin.v <= STOP_HOLD_SPEED → s=stop.s, v=0, held=true, stopIndex=stop.index
      else                          → 乗り越える(overran。火花だけ出す)

  // あたりの口。止まり木とまったく同じ扱い
  if prevS < goalS <= coin.s && coin.v <= STOP_HOLD_SPEED → state='win'

  // 穴。勢いが足りないまま口の上に来ると落ちる
  if holeAt(lane, coin.s) && coin.v < HOLE_CATCH_SPEED → state='falling'

  // レーンの終端。通り過ぎたら最後の穴へ
  if coin.s >= lane.length → state='falling'
```

`held` が true のあいだは物理を進めない。だから止まり木で止まったコインは
`LANE_ASSIST` に押されて動き出すことがなく、いつまでも待てる。

### 4.3 減速のモデル — なぜ `assist - drag * v` なのか

```
dv/dt = LANE_ASSIST - LANE_DRAG * v          LANE_DRAG = 1.6 [1/s], LANE_ASSIST = 95 [px/s²]
```

- 速いあいだ(`v >> LANE_CREEP`)は `dv/ds ≒ -LANE_DRAG` になり、
  **速さが距離に対してほぼ一直線に落ちる**。
  「引いた量」と「走る距離」が素直に対応するので、3歳児にも因果が読める。
- 止まりかけると `LANE_ASSIST`(レーンの傾き)が勝ち、
  **止まりかけの速さ `LANE_CREEP = LANE_ASSIST / LANE_DRAG = 59 px/s` でゆっくり前へ進み続ける**。
  完全に静止しないので「レーンの途中で詰む」が起きない(§0.37)。
- `LANE_CREEP < HOLE_CATCH_SPEED (170)` なので、creep で穴に来たコインは必ず落ちる。
  「穴の手前でじりじり進み続けて決着しない」も起きない。

`ROLL_DAMPING` を距離基準にせず時間基準にしているのは、固定タイムステップで
そのまま積分できるようにするため。

### 4.4 成功の条件 — 2つの速さで挟む

止まり木 `k` から初速 `v0` で弾いたコインが成功するのは、次の**両方**を満たすとき。

| 条件 | 意味 | 破ると |
|---|---|---|
| 穴の終わりで `v >= HOLE_CATCH_SPEED (170)` | 勢いよく穴の口を渡りきる | **弱すぎ** → 穴に落ちる |
| 止まり木で `v <= STOP_HOLD_SPEED (130)` | 受け止められる速さまで落ちている | **強すぎ** → 乗り越えて次の穴へ |

`v` は単調に減るので、この2つは「穴を渡ってから止まり木までの**助走**で、
170 まで落ちる前に 130 まで落としきる」ことを要求する。
**助走の長さが成功域の広さを決める**ので、難易度は穴の長さ(= 助走の長さ)で付ける(§5)。

> `STOP_HOLD_SPEED < HOLE_CATCH_SPEED` であることが本質。
> 逆にすると、穴を渡れる勢いのコインはそのまま止まり木でも止まれてしまい、
> 「強すぎ」の失敗が消えて片側だけのゲームになる。

### 4.5 `falling` / `win`

どちらも `timer += dt` するだけの演出状態。物理は止まる。

- `falling`: `FALL_ANIM = 1.0` 秒。
  `0..0.3` 穴の口まで滑る → `0.3..0.8` 沈みながら縮小 → `0.8..` フェード。
  沈み始めたら**穴の手前側のリムをコインの上に重ねて描く**(`drawRoundHoleFront`)。
- `win`: `WIN_ANIM = 1.5` 秒。あたりの口の中で小さく跳ねる。

---

## 5. 難易度

### 5.1 パラメータ

```ts
DIFFICULTIES = {
  easy:   { id: 'easy',   label: 'やさしい', holeSpan: 120 },
  normal: { id: 'normal', label: 'ふつう',   holeSpan: 190 },
}
```

**難易度差は穴の長さだけ。** 弾き力の範囲・ストローク・レーンの形・止まり木の位置は
すべて共通。穴が短いほど

- 渡りきるのに要る勢いが小さい(下限が下がる)
- 渡ってから止まり木までの**助走**が長い(減速する余地が増え、上限との差が開く)

の両方が効いて成功域が広がる。難易度を切り替えても弾く点も指の感覚も変わらない。

### 5.2 実測された成功域(`npm run verify`)

| 操作 | やさしい | ふつう |
|---|---|---|
| 1回目 → 止まり木2 | 65%(pull 0.22〜0.83) | 48%(pull 0.38〜0.83) |
| 2回目 → 止まり木3 | 65% | 48% |
| 3回目 → 止まり木4 | 65% | 48% |
| 4回目 → 止まり木5 | 65% | 48% |
| 5回目 → あたりの口 | 65% | 48% |

- すべて**連続した1区間**。飛び地はない。
- すべての操作で**弱すぎ・強すぎの両方の失敗が存在する**。
- **5回とも数値が完全に一致している。** レーンが合同な繰り返しでできているので、
  遷移ごとのばらつきが構造的にゼロになった(以前は最後の1回だけ数%ずれていた)。
- やさしい (65%) > ふつう (48%)。

### 5.3 P_MIN / P_MAX の決め方

手で決めてはいけない。**成功する power の境界を実測してから逆算する。**

```
二分探索で境界を測る:
  a  = 成功する power の下限(やさしい)     → 570
  a' = 成功する power の下限(ふつう)       → 671
  b  = 成功する power の上限(難易度共通)   → 972
        ※ 上限は「止まり木で止まれる速さ」で決まるので穴の長さに依存しない

やさしいの成功域を目標比 f に置く:
  range = (b - a) / f
  弱すぎ区間と強すぎ区間を range - (b - a) から分け合う
  pmin は pull = PULL_DEADZONE のときに弱すぎ側へ届く値にする
```

現在値は `P_MIN = 430` / `P_MAX = 1080`。
デッドゾーン(pull 0.05)を除いた実効範囲は 462..1080 で、
やさしい 65% / ふつう 48% になる。
ふつうの成功域は `(b - a') / (b - a)` で自動的に決まるので、`holeSpan` の比だけで調整する。

### 5.4 チューニングの経緯(再発防止のため記録)

| 試した値 | 結果 | 判断 |
|---|---|---|
| コインを放物線で飛ばす(§0.35〜§0.36) | 盤面が切れ切れのレールになり、写真の1本につながったレーンにできない | 却下。物理を1次元に置き換えた(§0.37) |
| `STOP_HOLD_SPEED > HOLE_CATCH_SPEED` | 穴を渡れる勢いならそのまま止まり木でも止まれてしまい、**強すぎの失敗が消滅** | 却下。必ず `STOP_HOLD < HOLE_CATCH` |
| `LANE_ASSIST = 0` | 弱く弾くとコインがレーンの途中で完全に静止し、**弾けず結果も出ず詰む** | 却下。95 を入れて creep させる |
| `LANE_CREEP > HOLE_CATCH_SPEED` | creep で穴を渡りきってしまい、弱すぎの失敗が消える | 却下。`59 < 170` を検算で固定 |
| `ENTRY_SPEED = 780` | 1つ目の止まり木を乗り越えて、**投入しただけで没収** | 660 に下げた(検算 §12-4) |
| 穴を走路の中ほどに置く | Uターンからの距離が回ごとにずれ、成功域が回ごとに変わる | 却下。**Uターンを出てすぐ**に固定 |
| `LANE_DRAG = 1.6`、穴 120/190、`P 430..1080` | 易 65% / 普 48%、5回とも完全に一致 | **採用** |

穴の長さの上限は「助走が足りること」で決まる(§3.3、§4.4)。
長くしすぎると `HOLE_CATCH` と `STOP_HOLD` を両立できる `v0` が無くなり、検算 §12-3 が落とす。

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
  && canFlick(coin)          // = 止まり木で静止していて弾ける
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
2  drawBoardFace              化粧板(おひさま・雲・草花)
3  drawEntryChute             投入口からレーンの入口へのシュート
4  drawSideAnimals            レーンより先に描くので腰から下が隠れる
5  drawLeverRods              ノブと止まり木をつなぐロッド(レーンの下を通る)
6  drawLane                   1本につながったレーン(影→黒枠→金の枠→溝の底)
7  drawLaneArrows             レーンの床の進行方向マーク
8  drawRoundHole × n          レーンの床に開いた丸穴
9  drawWinPocket              あたりの口+旗+看板
10 drawStopper × 5            レーンを横切る杭(止まり木)
11 コイン(状態別)+ drawRoundHoleFront(沈むとき手前のリムを重ねる)
12 particles                  受け止めの土煙・乗り越えの星・あたりの紙吹雪
13 drawBoardFrame             窓枠+ネジ+ガラスの反射。中身を全部覆う
14 drawSideKnobs              筐体の左右の縁に並ぶレバーのノブ
15 drawCabinetLower           プランジャー帯の装飾+あたりの受け皿
16 drawCoinSlot               右上の投入口
17 drawInsertCoin             insert フェーズのみ
18 drawPlunger
19 drawGiveUpButton
20 drawHandGuide              条件を満たすときのみ
```

**レーンは折れ線を太さを変えて4回なぞって描く。** 1本のパスなので、
Uターンも直線も継ぎ目なくつながる。穴と止まり木はその上に重ねる。

**レバーのノブは筐体の左右の縁に置く。** 実機ではレバーの軸が側面を貫いて
ノブになっている。走路の端が左・右・左…と交互なので、ノブも交互に並ぶ。
窓枠(13)より後に描いて、枠に載って見えるようにする。

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

### 8.35 化粧板の絵柄と応援どうぶつをどこに置くか

レーンが盤面をほぼ埋めるので、余白は**走路と走路のあいだ、盤面の中央寄り**しかない。
印刷の草花も応援どうぶつもそこに置く。レーンにも穴にもかからないので、
コースの見通しを損なわない。

### 8.4 描画関数一覧(`render/drawings.ts`)

```
空      drawSky, drawSunAndClouds                (タイトル / リザルト用)
筐体    drawCabinetBase, drawCabinetLower, drawBoardFrame, drawBoardFace
レーン  drawLane, drawLaneArrows, drawRoundHole, drawRoundHoleFront
盤面    drawStopper, drawSideKnobs, drawLeverRods, drawWinPocket
コイン  drawCoin, drawCoinSlot, entryChute, drawEntryChute, drawInsertCoin
操作    drawPlunger, drawHandGuide, drawGiveUpButton, drawButton
収集    drawStamp, drawStampBook
画面    drawTitleLogo, drawResultSteps
装飾    drawSideAnimals
```

- `drawCoin` は `squash` 引数で止まり木に受け止められた瞬間のつぶれを表現する
  (`LAND_SQUASH_TIME = 0.14` 秒、`sin` で往復)。
- 空中を飛ばなくなったので、落下地点を示す影(旧 `drawCoinShadow`)は撤去した。

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
| `puff` | 止まり木に受け止められた瞬間、穴に落ちた瞬間 | 左右に広がりながら膨らんでフェード。0.35〜0.55秒 |
| `star` | レバーの打撃、止まり木を乗り越えた瞬間 | 放射状に飛んで落ちる。0.3〜0.45秒 |

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
buildLane(d: DifficultyConfig): Lane          // 折れ線・止まり木・穴を一式で作る

posAt(lane, s): Vec2                          // 経路上の距離 s の座標
dirAt(lane, s): Vec2                          // 経路の進行方向(単位ベクトル)
holeAt(lane, s): Hole | null                  // s が穴の上か
nextHole(lane, s): Hole | null                // s より先の最初の穴
runUpLength(lane, stopIndex): number          // 穴から止まり木までの助走
turnOuterMargin(): number                     // U ターンと壁の余裕(検算用)

interface Lane {
  pts: Vec2[]; cum: number[]; length: number; // 折れ線と累積距離
  runs: Run[]; stops: Stop[]; holes: Hole[];
  goalS: number; goalPos: Vec2;
}
```

> **座標は `s` から引く。** レーンの形を変えても、遊びの条件を決めるのは
> `s` の上の距離だけ。見た目の調整と遊びの調整が分離されている。

### 10.2 `game/coin.ts`

```ts
createCoin(): Coin
placeOnLane(coin, lane, s, v): void
placeAtStop(coin, lane, stopIndex): void       // 止まり木に受け止められた状態
placeAtStart(coin, lane): void                 // 投入。ENTRY_SPEED で走り出す
canFlick(coin): boolean                        // 止まり木で静止中だけ true
flickCoin(coin, power): boolean                // 弾けたら true
stepCoin(coin, dt, lane): StepResult
runIndexOf(lane, s): number                    // いまいる走路の番号(到達段数)

interface StepResult {
  heldAtStop: number | null;    // 受け止められた止まり木
  fellInHole: Hole | null;
  fellKind: 'weak' | 'strong' | null;
  reachedWin: boolean;
  overran: Vec2 | null;         // 止まり木を乗り越えた位置(星の演出用)
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
ROW_COUNT  = 5           RUN_COUNT = 6
ROW_GAP    = 138         ROW_TOP_Y = 190
RUN_LEFT_X = 145         RUN_RIGHT_X = 575       RUN_SPAN = 430
RUN_DROP   = 22          LANE_W = 64             LANE_RAIL = 7

// 物理(レーンに沿った 1 次元)
FIXED_DT = 1/60          MAX_FRAME_TIME = 0.25
MAX_SUBSTEP_MOVE = 6     // 1サブステップの最大移動量(穴の見落とし防止)
LANE_DRAG = 1.6          LANE_ASSIST = 95        LANE_CREEP = 59
HOLE_CATCH_SPEED = 170   STOP_HOLD_SPEED = 130   ENTRY_SPEED = 660

// 弾き(手で決めず §5.3 の手順で逆算する)
P_MIN = 430              P_MAX = 1080
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
easy:   holeSpan 120
normal: holeSpan 190

LINE_W = 4
ANIMALS = [usagi, kuma, panda, risu, neko, inu, zou, kirin, pengin, raion]
```

---

## 12. 検証

### 12.1 `npm run verify`(`scripts/verify-geometry.ts`)

**このスクリプトは式を解かない。実際の物理(`src/game/coin.ts`)を回して測る。**
以前、計算上は正しいのに遊べない不具合を何度も作り込んだため。

| # | 検査内容 |
|---|---|
| 1 | レーン上の全点が盤面 (40..680, 40..994) にコイン半径ぶん余裕を持って収まっている。<br>止まり木が `ROW_COUNT` 個あり、**すべて画面の左右の端**(盤面幅の 20% 以内)にある。<br>左右交互に並んでいる。**Uターンが壁に食い込まない**。穴がコインより長い |
| 2 | 5回の操作の「Uターンから穴まで」「穴の長さ」「穴から止まり木までの助走」が<br>**すべて同一**。助走が `COIN_R * 2` より長い |
| 3 | 各操作の成功域を pull 0.05〜1.00 を 0.005 刻みで実シミュレーションして測る<br>・成功域が**連続**している(飛び地がない)<br>・**弱すぎでも強すぎでも落ちる**<br>・やさしい 60〜100%、ふつう 30〜50%、やさしい > ふつう |
| 4 | 投入後に放置しても落ちない。放置すると 1 つ目の止まり木で止まって弾ける |
| 5 | **どの `power` でも必ず決着する**(レーンの途中で止まって詰まない)。<br>止まりかけの速さ `LANE_CREEP` が `HOLE_CATCH_SPEED` 未満 |
| 6 | プランジャー帯 ≤ 25%、盤面とノブが重ならない、指のストロークが画面内、<br>引ききってもノブが画面内、レーンがコインより広い |
| 7 | 全パワー掃引で `s` / `v` が NaN にならず、**後戻りせず**、範囲を外れない |

§5 は §0.37 で新しく生まれた「詰み」の再発防止。
放物線を撤去したので、旧 §7(板の貫通)と旧 §8(弾道の余裕)は役目を終えて削除した。

### 12.2 `npm test`(Vitest、87 テスト)

- `src/game/coin.test.ts`(54): レーンの形・弾き・走り・成功域スキャン・頑健性
  - 「止まり木が画面の左右の端にある」= 発注者の指摘(§0.36)を数値で固定する
  - 「弾くとレーンに沿った速さになる(飛ばない)」= 発注者の指摘(§0.37)を固定する
  - 「5つの操作がすべて同じ条件」= 距離を突き合わせる(§3.2)
  - 「穴の丸が区間を隙間なく埋めている」= 落下範囲と見た目の一致(§3.5)
  - 「どのパワーでも必ず決着する(詰まない)」「コインは後戻りしない」
  - 「走り出したコインはレーンの上から離れない」= `pos` が必ず `posAt(s)` と一致する
- `src/game/plunger.test.ts`(19): 掴み判定、`pull` の境界、デッドゾーン、クールダウン、`pointercancel`
- `src/save.test.ts`(14): 保存・読込・不正値の sanitize・localStorage 例外時のフォールバック

### 12.3 ブラウザでの通しプレイ(Playwright + Chromium, 450×800)

実際に確認した内容:

- タイトル → やさしい → 投入アニメ → レーンを走って 1 つ目の止まり木で停止
- pull 0.55 を5回繰り返してレーンを下り、あたりの口に入る → 紙吹雪 →「やったね!」+ スタンプ獲得
- 走行中のコインが**つねにレーンの中**にいる(飛んでいない)
- pull 0.10(弱すぎ)で**穴**に落ち、リムに隠れながら沈む →「おしい!」
- pull 1.00(強すぎ)で**止まり木を乗り越えて**その先の穴に落ちる
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
3. **コインを飛ばさない。** 位置は経路上の距離 `s` ひとつだけ(§0.37)。
   2次元の速度を持たせた瞬間に、貫通も場外も設計上の心配ごととして戻ってくる。
4. **後戻りさせない。** `v` はつねに 0 以上。跳ね返りは *強すぎ = 失敗* を壊す。
5. **レーンの途中でコインを止めない。** 完全に静止すると進行不能になる。
   `LANE_ASSIST > 0` かつ `LANE_CREEP < HOLE_CATCH_SPEED` を必ず保つ(§4.3、検算 §12-5)。
6. **`STOP_HOLD_SPEED < HOLE_CATCH_SPEED` を崩さない。**
   逆にすると「強すぎ」の失敗が消えて片側だけのゲームになる(§4.4)。
7. **穴を長くするときは助走が足りているか確認する。**
   助走が短いと「渡りきれる勢い」と「止まり木で止まれる勢い」が両立せず成功域が消える。
8. **レーンの形を変えたら §12-2 の均一性を必ず見る。**
   合同な繰り返しが崩れると、回ごとに難しさがばらつく。
9. **`P_MIN` / `P_MAX` を手で置かない。** §5.3 の手順で成功域の境界から逆算する。
10. **`src/game/` に Canvas / DOM を持ち込まない。**
11. **外部素材を足さない。** 画像・音・フォント・CDN すべて禁止。
12. これら以外の仕様変更は発注者確認なしに行わない。
