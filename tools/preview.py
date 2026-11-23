"""
把 tools/preview.mjs 产出的「绘制清单」画成 PNG（布局级预览，不是真实渲染）。

支持 skew / rotate / flipX：变换矩阵直接解析客户端 spriteTransform() 给出的 transform 串，
所以贴墙的窗、帘、挂画在预览里也是斜的，不会“看起来没歪但实际歪了”。

    python tools/preview.py                 # 画 test/shots/render-*.json 里所有房间
    python tools/preview.py living          # 只画一个
    python tools/preview.py --labels        # 每个部件标名字 + z
    python tools/preview.py --occlusion     # 诊断用：用素材 alpha 通道算真实遮挡（窗帘/地毯这类叠层会正常报出来，别当 bug）

输出：test/shots/preview-<map>.png（gitignore，本地调试用）
"""
from PIL import Image, ImageChops, ImageDraw, ImageFont
import json
import os
import sys

# Windows 控制台默认 GBK，输出中文/符号会炸；统一成 utf-8 并容错
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SHOTS = os.path.join(ROOT, "test", "shots")
PACK = os.path.join(ROOT, "packs", "bigfish-adult")

argv = sys.argv[1:]
labels = "--labels" in argv
occlusion = "--occlusion" in argv
names = [a for a in argv if not a.startswith("--")]

if not os.path.isdir(SHOTS):
    print("没有 test/shots，先跑 node tools/preview.mjs")
    sys.exit(1)

files = sorted(f for f in os.listdir(SHOTS) if f.startswith("render-") and f.endswith(".json"))
if names:
    wanted = {f"render-{n}.json" for n in names}
    files = [f for f in files if f in wanted]
if not files:
    print("没有匹配的绘制清单")
    sys.exit(1)


def load_font(size):
    for name in ("msyh.ttc", "simhei.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


font = load_font(13)
font_small = load_font(11)



# ---------------- SVG transform -> 矩阵（畸变支持） ----------------
import math
import re

IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)  # x' = a*x + c*y + e ; y' = b*x + d*y + f


def mat_mul(m1, m2):
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def mat_invert(m):
    a, b, c, d, e, f = m
    det = a * d - b * c
    if abs(det) < 1e-9:
        return IDENTITY
    ia, ib, ic, id_ = d / det, -b / det, -c / det, a / det
    return (ia, ib, ic, id_, -(ia * e + ic * f), -(ib * e + id_ * f))


def parse_transform(text):
    """把 'translate(...) scale(...) skewY(...) rotate(...)' 合成一个矩阵"""
    if not text:
        return IDENTITY
    matrix = IDENTITY
    for name, raw in re.findall(r"([a-zA-Z]+)\(([^)]*)\)", text):
        nums = [float(v) for v in re.findall(r"-?[0-9.]+(?:e-?[0-9]+)?", raw)]
        if name == "translate":
            tx = nums[0] if nums else 0.0
            ty = nums[1] if len(nums) > 1 else 0.0
            m = (1.0, 0.0, 0.0, 1.0, tx, ty)
        elif name == "scale":
            sx = nums[0] if nums else 1.0
            sy = nums[1] if len(nums) > 1 else sx
            m = (sx, 0.0, 0.0, sy, 0.0, 0.0)
        elif name == "rotate":
            deg = nums[0] if nums else 0.0
            rad = math.radians(deg)
            cos_v, sin_v = math.cos(rad), math.sin(rad)
            m = (cos_v, sin_v, -sin_v, cos_v, 0.0, 0.0)
            if len(nums) >= 3:
                cx, cy = nums[1], nums[2]
                m = mat_mul((1.0, 0.0, 0.0, 1.0, cx, cy), m)
                m = mat_mul(m, (1.0, 0.0, 0.0, 1.0, -cx, -cy))
        elif name.lower() == "skewy":
            # SVG matrix(a,b,c,d,e,f)：x' = a x + c y + e ; y' = b x + d y + f
            # skewY 是 y' = tan*x + y —— 系数在 b 位
            rad = math.radians(nums[0] if nums else 0.0)
            m = (1.0, math.tan(rad), 0.0, 1.0, 0.0, 0.0)
        elif name.lower() == "skewx":
            rad = math.radians(nums[0] if nums else 0.0)
            m = (1.0, 0.0, math.tan(rad), 1.0, 0.0, 0.0)
        else:
            continue
        matrix = mat_mul(matrix, m)
    return matrix


def transform_image(img, matrix):
    """按 SVG 矩阵把图放到画布坐标系里，返回 (原点, 图)"""
    a, b, c, d, e, f = matrix
    w, h = img.size
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    pts = [(a * x + c * y + e, b * x + d * y + f) for x, y in corners]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = math.floor(min(xs)), math.floor(min(ys))
    x1, y1 = math.ceil(max(xs)), math.ceil(max(ys))
    out_w, out_h = max(1, x1 - x0), max(1, y1 - y0)
    # PIL 的 AFFINE 要的是「输出 -> 输入」的映射，而且系数顺序是 (a, b, c, d, e, f)
    # 即 x_in = a*x_out + b*y_out + c；SVG 矩阵是 x' = a*x + c*y + e，顺序不同，要换位
    ia, ib, ic, id_, ie, if_ = mat_invert(mat_mul((1.0, 0.0, 0.0, 1.0, -x0, -y0), matrix))
    coeffs = (ia, ic, ie, ib, id_, if_)
    out = img.transform((out_w, out_h), Image.AFFINE, coeffs, resample=Image.BICUBIC)
    return (x0, y0), out

def sprite_png(src):
    if not src:
        return None
    path = os.path.join(PACK, src)
    if not os.path.exists(path):
        return None
    try:
        return Image.open(path).convert("RGBA")
    except OSError:
        return None


def draw_room(data):
    w, h = data["canvas"]
    canvas = Image.new("RGBA", (int(w), int(h)), (245, 241, 233, 255))
    draw = ImageDraw.Draw(canvas)

    for shape in data.get("background", []):
        points = [tuple(p) for p in shape["points"]]
        draw.polygon(points, fill=shape.get("color") or "#eee6d8")

    alpha_layout = {}
    for part in data["parts"]:
        x, y = part["x"], part["y"]
        pw, ph = max(1, round(part["w"])), max(1, round(part["h"]))
        img = sprite_png(part.get("src"))
        if img is None:
            # 占位件：红色虚线框
            draw.rectangle([x, y, x + pw, y + ph], outline=(214, 74, 74, 255), width=2)
            if labels:
                draw.text((x + 3, y + 2), f"{part['label']} (缺图)", font=font_small, fill=(180, 40, 40, 255))
            continue
        img = img.resize((pw, ph), Image.LANCZOS)
        matrix = parse_transform(part.get("transform"))
        if matrix == IDENTITY:
            if part.get("flipX"):
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            origin, img = (round(x), round(y)), img
        else:
            origin, img = transform_image(img, matrix)
        canvas.alpha_composite(img, origin)
        # 记录 alpha 蒙版，供真实遮挡计算
        if occlusion:
            layer = Image.new("L", canvas.size, 0)
            mask = img.getchannel("A").point(lambda v: 255 if v > 40 else 0)
            layer.paste(mask, origin)
            alpha_layout[part["label"]] = (part["z"], layer)
        if labels:
            draw = ImageDraw.Draw(canvas)
            draw.rectangle([x, y, x + pw, y + ph], outline=(60, 120, 220, 90), width=1)
            draw.text((x + 3, y + 2), f"{part['label']} z={part['z']}", font=font_small, fill=(30, 60, 140, 255))

    character = data.get("character")
    if character:
        cx, cy = character.get("anchorPoint") or character.get("anchor")
        rx, ry, rw, rh = character["rect"]
        overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.rounded_rectangle([rx, ry, rx + rw, ry + rh], radius=int(rw * 0.28), fill=(110, 150, 215, 165))
        od.ellipse([cx - rw * 0.42, cy - 8, cx + rw * 0.42, cy + 10], fill=(90, 120, 170, 120))
        canvas.alpha_composite(overlay)
        draw = ImageDraw.Draw(canvas)
        draw.text((rx + 4, ry + 4), f"角色 {character['behavior']}", font=font_small, fill=(20, 50, 90, 255))
        draw.line([cx - 9, cy, cx + 9, cy], fill=(200, 60, 60, 255), width=2)

    # 顶部信息条
    draw = ImageDraw.Draw(canvas)
    title = f"{data['map']} · 代理渲染（布局级，非真实截图）· 部件 {len(data['parts'])}"
    draw.rectangle([0, 0, canvas.width, 20], fill=(28, 36, 52, 205))
    draw.text((6, 3), title, font=font, fill=(240, 246, 255, 255))

    out = os.path.join(SHOTS, f"preview-{data['map']}.png")
    canvas.convert("RGB").save(out, optimize=True)
    print(f"{out}  ({canvas.width}x{canvas.height})")

    if occlusion:
        report_occlusion(alpha_layout)


def report_occlusion(layers):
    """用素材 alpha 通道算真实遮挡：不受 rect 重叠造成的误报影响"""
    items = sorted(layers.items(), key=lambda kv: (kv[1][0], kv[0]))
    problems = []
    for i, (label, (z, mask)) in enumerate(items):
        area = mask.histogram()[255]
        if area <= 0:
            continue
        covered = Image.new("L", mask.size, 0)
        for j in range(i + 1, len(items)):
            _, (other_z, other_mask) = items[j]
            if other_z == z:
                continue
            covered = ImageChops.lighter(covered, ImageChops.multiply(mask, other_mask))
        ratio = covered.histogram()[255] / area
        if ratio >= 0.5:
            problems.append((ratio, label, z))
    if not problems:
        print("  (alpha) 没有部件被上层盖住超过 50%")
    for ratio, label, z in sorted(problems, reverse=True):
        print(f"  ! 实际遮挡: {label}(z={z}) 有 {round(ratio * 100)}% 的不透明像素被上层盖住")


for file in files:
    with open(os.path.join(SHOTS, file), "r", encoding="utf-8") as handle:
        draw_room(json.load(handle))
