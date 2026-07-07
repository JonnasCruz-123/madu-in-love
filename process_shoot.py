#!/usr/bin/env python3
"""
Processa a sprite sheet "SHOOT (8 FRAMES)" e extrai o projetil.

Saidas:
  output/shoot_strip.png           tira horizontal 1x8 (personagem atirando)
  output/frames/shoot_1..8.png     frames soltos transparentes
  output/projectile_heart.png      SO o projetil (flecha-coracao) apontando p/ direita

Detalhes:
  - Fundo claro removido (grade/branco) mantendo brilho dos olhos.
  - Em cada frame do personagem fica so o MAIOR componente (corpo + arco +
    flecha encaixada); os coracoes soltos e o projetil ja disparado saem.
  - Os frames sao ESPELHADOS para o personagem olhar para a ESQUERDA, igual
    a caminhada/pulo -> o virar no jogo fica consistente.
  - Alinhamento pela base dos pes (personagem em pe), como a caminhada.
"""

import os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "assets/source/shoot_sheet.png"
FRAMES_DIR = "output/frames"
STRIP_PATH = "output/shoot_strip.png"
PROJ_PATH = "output/projectile_heart.png"

# Colunas do PERSONAGEM (sem o projetil destacado do frame 4) e linhas.
CHAR_CELLS = [
    ((87, 349), (174, 465)), ((459, 748), (174, 465)),
    ((842, 1181), (174, 465)), ((1240, 1500), (174, 465)),
    ((87, 420), (566, 855)), ((490, 732), (566, 855)),
    ((875, 1111), (566, 855)), ((1278, 1529), (566, 855)),
]
# Regiao do projetil disparado (frame 4, voando para a direita).
PROJ_REGION = ((1500, 1700), (255, 445))

PAD = 14


def remove_bg(cell):
    """Fundo claro-neutro -> transparente (borda + bolsoes grandes)."""
    r = cell[:, :, 0].astype(int); g = cell[:, :, 1].astype(int); b = cell[:, :, 2].astype(int)
    mn = np.minimum(np.minimum(r, g), b); mx = np.maximum(np.maximum(r, g), b)
    bg = (mn >= 228) & ((mx - mn) <= 20)
    lbl, n = ndimage.label(bg)
    rem = np.zeros(cell.shape[:2], bool)
    if n:
        border = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1]); border.discard(0)
        rem |= np.isin(lbl, list(border))
        sz = ndimage.sum(np.ones_like(lbl), lbl, range(1, n + 1))
        for i in range(1, n + 1):
            if i not in border and sz[i - 1] > 110:
                rem |= (lbl == i)
    out = cell.copy(); out[rem, 3] = 0
    # de-fringe: tira a franja cinza-clara (halo no fundo escuro)
    sat = mx - mn
    op = out[:, :, 3] > 8
    fringe = op & (mn >= 150) & (mn <= 228) & (sat <= 28)
    out[fringe, 3] = 0
    return out


def largest_component(rgba):
    """Mantem so o maior blob opaco (descarta coracoes soltos / restos)."""
    op = rgba[:, :, 3] > 8
    lbl, n = ndimage.label(op)
    if n > 1:
        sz = ndimage.sum(np.ones_like(lbl), lbl, range(1, n + 1))
        keep = np.argmax(sz) + 1
        out = rgba.copy(); out[op & (lbl != keep), 3] = 0
        return out
    return rgba


def crop_alpha(rgba):
    ys, xs = np.where(rgba[:, :, 3] > 8)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def feet_anchor(sp):
    ys, xs = np.where(sp[:, :, 3] > 8)
    base = ys.max(); h = ys.max() - ys.min() + 1
    band = ys >= base - max(1, int(h * 0.14))
    return int(round(xs[band].mean())), base


def main():
    os.makedirs(FRAMES_DIR, exist_ok=True)
    arr = np.array(Image.open(SRC).convert("RGBA"))

    sprites = []
    for (x0, x1), (y0, y1) in CHAR_CELLS:
        sp = largest_component(remove_bg(arr[y0:y1, x0:x1].copy()))
        sp = crop_alpha(sp)
        sp = np.ascontiguousarray(sp[:, ::-1])       # espelha -> olha p/ esquerda
        sprites.append(sp)

    # dimensoes normalizadas pela base dos pes
    left = right = up = 0
    metr = []
    for sp in sprites:
        h, w = sp.shape[:2]; cx, by = feet_anchor(sp)
        left = max(left, cx); right = max(right, w - 1 - cx); up = max(up, by)
        metr.append((cx, by, w, h))
    left = right = max(left, right)   # pes centrados => troca de sprite sem pulo lateral
    BOTTOM = 2                        # pouca folga embaixo => pes no chao
    frame_w = left + right + 1 + 2 * PAD
    frame_h = up + 1 + PAD + BOTTOM
    frame_w += frame_w % 2; frame_h += frame_h % 2
    anchor_x = left + PAD; base_line = up + PAD

    norm = []
    for sp, (cx, by, w, h) in zip(sprites, metr):
        canvas = np.zeros((frame_h, frame_w, 4), np.uint8)
        dx = anchor_x - cx; dy = base_line - by
        canvas[dy:dy + h, dx:dx + w] = sp
        norm.append(canvas)

    for i, c in enumerate(norm, 1):
        Image.fromarray(c, "RGBA").save(f"{FRAMES_DIR}/shoot_{i}.png")
    strip = np.zeros((frame_h, frame_w * 8, 4), np.uint8)
    for i, c in enumerate(norm):
        strip[:, i * frame_w:(i + 1) * frame_w] = c
    Image.fromarray(strip, "RGBA").save(STRIP_PATH)

    # ---- projetil (flecha-coracao) apontando para a DIREITA ----
    (px0, px1), (py0, py1) = PROJ_REGION
    proj = largest_component(remove_bg(arr[py0:py1, px0:px1].copy()))
    proj = crop_alpha(proj)
    Image.fromarray(proj, "RGBA").save(PROJ_PATH)

    print("SHOOT processado")
    print(f"  frame      : {frame_w} x {frame_h} px")
    print(f"  tira (1x8) : {frame_w * 8} x {frame_h} px")
    print(f"  projetil   : {proj.shape[1]} x {proj.shape[0]} px  -> {PROJ_PATH}")
    return frame_w, frame_h


if __name__ == "__main__":
    main()
