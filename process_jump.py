#!/usr/bin/env python3
"""
Processa a sprite sheet "JUMP (6 FRAMES)" do mesmo personagem chibi.

Diferencas em relacao a caminhada:
  - 1 linha x 6 colunas.
  - Cada frame tem uma SOMBRA cinza no chao -> removida (o jogo desenha a
    propria sombra).
  - O personagem SOBE no ar (arco de pulo). Aqui o arco e PRESERVADO: os
    frames sao alinhados pela LINHA DO CHAO (nao pelos pes), entao ao tocar
    a tira a personagem realmente decola e pousa, como na arte original.

Saida:
  output/jump_strip.png            tira horizontal 1x6
  output/frames/jump_1..6.png      frames soltos transparentes
"""

import os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "assets/source/jump_sheet.png"
FRAMES_DIR = "output/frames"
STRIP_PATH = "output/jump_strip.png"

# Colunas dos 6 frames (detectadas por projecao) e faixa vertical util.
COL_BANDS = [(50, 283), (320, 551), (589, 822), (853, 1089), (1117, 1348), (1387, 1624)]
YBAND = (315, 770)

PAD = 14

# Linha do chao dentro do recorte (cell): 756 (absoluto) - YBAND[0].
GROUND_CELL = 756 - YBAND[0]

def isolate_char(cell):
    """Deixa so o personagem: remove fundo + sombra, mantem brilho dos olhos.

    A sombra e um cinza-neutro (baixa saturacao). Removemos:
      - o fundo claro (grade/branco) em toda a imagem;
      - o cinza da sombra SO na faixa inferior (perto do chao), pra nunca
        tocar o cabelo escuro la em cima nem as sandalias (tan, saturadas).
    """
    r = cell[:, :, 0].astype(int); g = cell[:, :, 1].astype(int); b = cell[:, :, 2].astype(int)
    mn = np.minimum(np.minimum(r, g), b); mx = np.maximum(np.maximum(r, g), b)
    sat = mx - mn

    bg = (mn >= 228) & (sat <= 20)                       # fundo claro (toda a img)
    grey = (sat <= 22) & (mn >= 45) & (mn < 228)         # cinza-neutro da sombra
    band = np.zeros(cell.shape[:2], bool)
    band[GROUND_CELL - 60:, :] = True                    # faixa perto do chao
    shadow = grey & band                                 # cinza so no chao = sombra

    remove_col = bg | shadow
    labels, n = ndimage.label(remove_col)
    remove = np.zeros(cell.shape[:2], bool)
    if n:
        border = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
        border.discard(0)
        remove |= np.isin(labels, list(border))
        sizes = ndimage.sum(np.ones_like(labels), labels, range(1, n + 1))
        for i in range(1, n + 1):
            if i not in border and sizes[i - 1] > 110:   # bolsao grande = grade presa
                remove |= (labels == i)
    out = cell.copy()
    out[remove, 3] = 0
    # mantem so o maior componente opaco (descarta restos de sombra soltos)
    op = out[:, :, 3] > 8
    lab, m = ndimage.label(op)
    if m > 1:
        sz = ndimage.sum(np.ones_like(lab), lab, range(1, m + 1))
        keep = np.argmax(sz) + 1
        drop = op & (lab != keep)
        out[drop, 3] = 0
    # de-fringe: tira a franja cinza-clara do cabelo (halo no fundo escuro)
    sat = mx - mn
    op2 = out[:, :, 3] > 8
    fringe = op2 & (mn >= 150) & (mn <= 228) & (sat <= 28)
    out[fringe, 3] = 0
    return out


def main():
    os.makedirs(FRAMES_DIR, exist_ok=True)
    arr = np.array(Image.open(SRC).convert("RGBA"))

    # Recorta e isola cada frame; mede centroide-x, pes (base) e topo da cabeca.
    frames = []
    for (x0, x1) in COL_BANDS:
        cell = arr[YBAND[0]:YBAND[1], x0:x1].copy()
        sp = isolate_char(cell)
        ys, xs = np.where(sp[:, :, 3] > 8)
        info = dict(top=ys.min(), bot=ys.max(), cx=int(round(xs.mean())),
                    x0=xs.min(), x1=xs.max())
        # recorta no bbox
        sub = sp[info["top"]:info["bot"] + 1, info["x0"]:info["x1"] + 1]
        info["cx"] -= info["x0"]                 # centroide relativo ao recorte
        info["h"] = info["bot"] - info["top"] + 1
        info["w"] = info["x1"] - info["x0"] + 1
        info["feet"] = info["bot"]               # base absoluta (na faixa)
        info["img"] = sub
        frames.append(info)

    # Alinhamento pelos pes (o arco do pulo agora e feito por JS no jogo,
    # entao os frames guardam so as POSES, com os pes na mesma linha).
    for f in frames:
        f["rise"] = 0

    # Dimensoes normalizadas.
    left = max(f["cx"] for f in frames)
    right = max(f["w"] - 1 - f["cx"] for f in frames)
    left = right = max(left, right)   # centro estavel => troca de sprite sem pulo lateral
    frame_w = left + right + 1 + 2 * PAD
    BOTTOM = 2                                    # pouca folga embaixo => pes no chao
    top_above = max(f["rise"] + f["h"] for f in frames)   # ponto mais alto acima do chao
    frame_h = top_above + PAD + BOTTOM
    frame_w += frame_w % 2; frame_h += frame_h % 2

    anchor_x = left + PAD
    baseline = frame_h - BOTTOM                    # onde o pe do frame no chao encosta

    norm = []
    for f in frames:
        canvas = np.zeros((frame_h, frame_w, 4), np.uint8)
        dst_x = anchor_x - f["cx"]
        feet_y = baseline - f["rise"]             # pes sobem conforme o arco
        dst_y = feet_y - (f["h"] - 1)
        canvas[dst_y:dst_y + f["h"], dst_x:dst_x + f["w"]] = f["img"]
        norm.append(canvas)

    for i, c in enumerate(norm, 1):
        Image.fromarray(c, "RGBA").save(f"{FRAMES_DIR}/jump_{i}.png")

    strip = np.zeros((frame_h, frame_w * len(norm), 4), np.uint8)
    for i, c in enumerate(norm):
        strip[:, i * frame_w:(i + 1) * frame_w] = c
    Image.fromarray(strip, "RGBA").save(STRIP_PATH)

    print("JUMP processado")
    print(f"  frame        : {frame_w} x {frame_h} px")
    print(f"  tira (1x6)   : {frame_w * len(norm)} x {frame_h} px")
    print(f"  chao/baseline: y={baseline}  | pico do pulo: {max(f['rise'] for f in frames)} px")
    print(f"  arco (rise)  : {[f['rise'] for f in frames]}")
    return frame_w, frame_h


if __name__ == "__main__":
    main()
