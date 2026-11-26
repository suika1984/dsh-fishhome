"""把「吊椅 + 大肥鱼」离线合成为一张图（秋千专用）。

为什么合成：椅子和她是两个独立元素，各自取帧会差半拍；合成后同一张图，
同步由构造保证。她本人在场景里改用「空白动作」，只保留节点位置给气泡用。

用法： python tools/compose_swing.py
输出： packs/bigfish-adult/swing-seat-{center,front,back}.png
      以及合成后的家具 rect（脚本会打印，数据里已经按它写好）
"""
from PIL import Image

PACK = r"D:\dschat\dsh-fishhome\packs\bigfish-adult"

# ---- 与 garden_swing.json 保持一致 ----
RECT = (238, 452, 124, 200)          # 椅子在场景里的 rect（x, y, w, h）
ANCHOR = (0.33, 0.86)                # 她的落点比例（椅子部件内）
CHAR_HEIGHT = 196 * 0.6              # characterHeight × characterScale（花园）
CELL = (435, 539)                    # fish-swing-sheet 的单格
SCALE = 4                            # 合成倍率，最后靠 rect 缩回去

# 每个相位用哪张椅子图 + 她哪一列（0=中 1=前 2=后）
PHASES = [
    ("center", "swing-chair-center.png", 0),
    ("front", "swing-chair-front.png", 1),
    ("back", "swing-chair-back.png", 2),
]


def main():
    sheet = Image.open(f"{PACK}\\fish-swing-sheet.png").convert("RGBA")
    cell_w, cell_h = CELL

    char_h = CHAR_HEIGHT * SCALE
    char_w = char_h * (cell_w / cell_h)
    anchor_x = (ANCHOR[0]) * RECT[2] * SCALE          # 相对椅子 rect 左上角
    anchor_y = (ANCHOR[1]) * RECT[3] * SCALE
    char_left = anchor_x - char_w / 2
    char_top = anchor_y - char_h

    chair_w = RECT[2] * SCALE
    chair_h = RECT[3] * SCALE

    # 画布要同时容下椅子和她：左侧/上方可能溢出
    left_pad = max(0, -char_left)
    top_pad = max(0, -char_top)
    right_pad = max(0, char_left + char_w - chair_w)
    bottom_pad = max(0, char_top + char_h - chair_h)

    out_w = int(round(chair_w + left_pad + right_pad))
    out_h = int(round(chair_h + top_pad + bottom_pad))

    for phase, chair_file, col in PHASES:
        canvas = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
        chair = Image.open(f"{PACK}\\{chair_file}").convert("RGBA")
        chair = chair.resize((int(round(chair_w)), int(round(chair_h))), Image.LANCZOS)
        canvas.alpha_composite(chair, (int(left_pad), int(top_pad)))
        her = sheet.crop((col * cell_w, 0, (col + 1) * cell_w, cell_h)).convert("RGBA")
        her = her.resize((int(round(char_w)), int(round(char_h))), Image.LANCZOS)
        canvas.alpha_composite(her, (int(left_pad + char_left), int(top_pad + char_top)))
        out = f"{PACK}\\swing-seat-{phase}.png"
        canvas.save(out, optimize=True)
        print(f"swing-seat-{phase}.png {canvas.size[0]}x{canvas.size[1]}")

    new_rect = (
        round(RECT[0] - left_pad / SCALE),
        round(RECT[1] - top_pad / SCALE),
        round(out_w / SCALE),
        round(out_h / SCALE),
    )
    print("合成后的家具 rect =", new_rect, "  （relative 锚点位置不变）")


if __name__ == "__main__":
    main()
