#!/usr/bin/env python3
"""
盤面の幾何と物理定数の検算スクリプト(詳細設計書 §3.6 / §13.5)

detailed-design.md の §3.2(レーン座標)、§3.6(検算結果)、§7.1(難易度)の
数値がすべて自己整合していることを確認し、設計書に載せる表を再生成する。

    python3 docs/verify-geometry.py

座標・GRAVITY・FLICK_ANGLE_DEG・P_MIN/P_MAX を変更したら必ず実行し、
detailed-design.md §3.6 の表を更新すること。

実装時は同じ内容を scripts/verify-geometry.ts へ移植し、`npm run verify` で
実行できるようにする(設計書 §13.5)。
"""

import math
import sys

# ---------------------------------------------------------------- config.ts
BOARD_LEFT, BOARD_RIGHT = 60, 660
BOARD_TOP, BOARD_BOTTOM = 40, 750

LANE_COUNT, LANE_LEN, LANE_DROP, LANE_GAP, SHAFT_W = 5, 450, 40, 105, 150

COIN_R = 28
GRAVITY = 2200.0
ROLL_DAMPING = 0.35

P_MIN, P_MAX = 620.0, 1700.0
FLICK_ANGLE_DEG = 20.0
FLICK_ZONE_S_MIN = 0.70

KNOB_REST_Y, KNOB_R = 830, 70
STROKE_FINGER, STROKE_KNOB = 450, 380

GOAL_LIP_X, GOAL_LIP_TOP, GOAL_FLOOR_Y = 510, 177, 235

DIFFICULTIES = {
    "やさしい": dict(hole_radius=25, fall_speed=230, goal_left=280, lip_escape=None),
    "ふつう":   dict(hole_radius=34, fall_speed=320, goal_left=385, lip_escape=520),
}

# ---------------------------------------------------------------- derived
ANG = math.radians(FLICK_ANGLE_DEG)
SIN, COS = math.sin(ANG), math.cos(ANG)
CEIL_Y = BOARD_TOP + COIN_R          # コイン中心が到達できる最小 y
SLOPE = math.asin(LANE_DROP / LANE_LEN)

failures = []


def check(label, cond, detail=""):
    print(f"  {'OK  ' if cond else 'NG  '}{label}{('  ' + detail) if detail else ''}")
    if not cond:
        failures.append(label)


def build_lanes():
    lanes = []
    for i in range(LANE_COUNT):
        right = i % 2 == 0
        lo_y = BOARD_BOTTOM - 8 - i * LANE_GAP
        hi_y = lo_y - LANE_DROP
        hi = (BOARD_LEFT + SHAFT_W, hi_y) if right else (BOARD_RIGHT - SHAFT_W, hi_y)
        lo = (BOARD_RIGHT, lo_y) if right else (BOARD_LEFT, lo_y)
        lanes.append(dict(index=i, side="right" if right else "left", hi=hi, lo=lo))
    return lanes


def rise_at_drift(v, d):
    """初速 v で弾いたコインが横に d px 流れた時点での上昇量。"""
    t = d / (v * SIN)
    return v * COS * t - 0.5 * GRAVITY * t * t


def min_launch_speed(rise_needed, drift, margin=8.0):
    lo, hi = 200.0, 4000.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if rise_at_drift(mid, drift) >= rise_needed + margin:
            hi = mid
        else:
            lo = mid
    return hi


def goal_landing_x(v):
    """段5のレバーから初速 v で弾いたコインが、ゴールの床の高さに達する x。"""
    c0 = (BOARD_RIGHT, (BOARD_BOTTOM - 8 - 4 * LANE_GAP) - COIN_R)   # (660, 294)
    floor_center = GOAL_FLOOR_Y - COIN_R
    a = GRAVITY / (2 * (v * SIN) ** 2)
    b = -COS / SIN
    peak = (v * COS) ** 2 / (2 * GRAVITY)
    cap = c0[1] - CEIL_Y

    if peak <= cap:                                   # 天井に当たらない自由な放物線
        disc = b * b - 4 * a * (c0[1] - floor_center)
        if disc < 0:
            return None
        return c0[0] - (-b + math.sqrt(disc)) / (2 * a)

    disc = b * b - 4 * a * cap                        # 天井に当たる
    d_ceil = (-b - math.sqrt(disc)) / (2 * a)
    t_fall = math.sqrt(2 * (floor_center - CEIL_Y) / GRAVITY)
    return c0[0] - d_ceil - v * SIN * t_fall


def roll_speed(v0, dist, dt=1 / 600):
    """レーン上を dist px 転がったあとの速度(減衰込み)。"""
    a0 = GRAVITY * math.sin(SLOPE)
    v, x = v0, 0.0
    while x < dist:
        v += (a0 - ROLL_DAMPING * v) * dt
        x += v * dt
    return v


# ---------------------------------------------------------------- checks
print("=== 1. レーン座標(設計書 §3.2)===")
lanes = build_lanes()
for ln in lanes:
    print(f"  段{ln['index']+1}: レバー{ln['side']:5}  高い端={ln['hi']}  レバー端={ln['lo']}")
check("レーン長 == LANE_LEN", BOARD_RIGHT - (BOARD_LEFT + SHAFT_W) == LANE_LEN)
print(f"  傾き = {math.degrees(SLOPE):.2f} 度")

print("\n=== 2. 5つの跳躍の均一性(設計書 §3.1。ゲームの手触りの根幹)===")
jumps = []
for i, ln in enumerate(lanes):
    tip = lanes[i + 1]["hi"] if i < LANE_COUNT - 1 else (GOAL_LIP_X, GOAL_LIP_TOP)
    label = f"段{i+1} → 段{i+2}" if i < LANE_COUNT - 1 else f"段{i+1} → ゴール"
    across, up = abs(ln["lo"][0] - tip[0]), ln["lo"][1] - tip[1]
    jumps.append((across, up))
    print(f"  {label}: 横={across:3.0f}  上={up:3.0f}")
check("5つの跳躍がすべて同一条件", len(set(jumps)) == 1, f"{jumps[0]}")

across, up = jumps[0]
v_min = min_launch_speed(up, across)
pull_min = (v_min - P_MIN) / (P_MAX - P_MIN)
print(f"\n=== 3. 必要初速と成功域(設計書 §3.6)===")
print(f"  v_min = {v_min:.0f} px/s   pull >= {pull_min:.3f}"
      f"   成功域 = ストロークの {100*(1-pull_min):.0f}%")
check("必要 pull が 0.35 未満(3歳児が届く)", pull_min < 0.35, f"pull={pull_min:.3f}")
check("P_MIN では届かない(弱すぎが存在する)", P_MIN < v_min)

print("\n=== 4. ゴールの成功域(設計書 §3.6 / §7.1)===")
for name, d in DIFFICULTIES.items():
    ok = [v for v in range(int(v_min) + 1, int(P_MAX) + 1)
          if (goal_landing_x(v) or 0) >= d["goal_left"]]
    p0 = (min(ok) - P_MIN) / (P_MAX - P_MIN)
    p1 = (max(ok) - P_MIN) / (P_MAX - P_MIN)
    print(f"  {name}: バスケット左端={d['goal_left']}  "
          f"pull {p0:.2f}〜{p1:.2f}  = ストロークの {100*(p1-p0):.0f}%")
    check(f"{name}: ゴールを外す余地がある", p1 < 1.0 or p0 > 0.0)

print("\n=== 5. 転がり速度と落下閾値(設計書 §4.2 / §7.2)===")
weak_return = roll_speed(0, 225)      # 弱い弾きで戻ってきたコイン
full_roll = roll_speed(0, LANE_LEN)   # 静止から全長を転がる
after_land = roll_speed(480, 250)     # 成功した弾きの着地後
print(f"  終端速度                       = {GRAVITY*math.sin(SLOPE)/ROLL_DAMPING:.0f} px/s")
print(f"  弱い弾きで戻ったコイン(225px) = {weak_return:.0f} px/s")
print(f"  静止から全長({LANE_LEN}px)     = {full_roll:.0f} px/s")
print(f"  成功した弾きの着地後(250px)   = {after_land:.0f} px/s")
check("やさしい: 弱い戻りは穴を通過する", weak_return > DIFFICULTIES["やさしい"]["fall_speed"])
check("ふつう:   弱い戻りは穴に落ちる", weak_return < DIFFICULTIES["ふつう"]["fall_speed"])
check("両難易度: 成功した弾きは穴を通過する",
      after_land > max(d["fall_speed"] for d in DIFFICULTIES.values()))
check("ふつう: 通常の転がりでは転落しない",
      full_roll < DIFFICULTIES["ふつう"]["lip_escape"])

print("\n=== 6. 弾きゾーンとシャフト(設計書 §6.5)===")
x_zone = BOARD_RIGHT - (1 - FLICK_ZONE_S_MIN) * LANE_LEN
print(f"  s={FLICK_ZONE_S_MIN} -> x={x_zone:.0f}  (シャフトは x >= {BOARD_RIGHT - SHAFT_W})")
check("弾きゾーンがシャフトの内側に収まっている", x_zone >= BOARD_RIGHT - SHAFT_W)

print("\n=== 7. レイアウト(設計書 §2.3 / §6.3)===")
check("盤面とノブが重ならない", KNOB_REST_Y - KNOB_R >= BOARD_BOTTOM,
      f"隙間 {KNOB_REST_Y - KNOB_R - BOARD_BOTTOM}px")
check("指のストロークが画面内に収まる", 1280 - KNOB_REST_Y == STROKE_FINGER,
      f"{1280 - KNOB_REST_Y}px")
check("引ききってもノブが画面内に残る", KNOB_REST_Y + STROKE_KNOB + KNOB_R <= 1280,
      f"下端 {KNOB_REST_Y + STROKE_KNOB + KNOB_R}")

print("\n" + ("=" * 50))
if failures:
    print(f"NG: {len(failures)} 件の不整合があります")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("すべての検算に成功しました。設計書 §3.6 の表と一致しています。")
