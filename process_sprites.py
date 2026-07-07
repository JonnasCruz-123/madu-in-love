#!/usr/bin/env python3
"""
Processa a sprite sheet "WALK (8 FRAMES)" de um personagem chibi.

Etapas:
  1. Recorta os 8 frames (2 linhas x 4 colunas), ignorando titulo, numeros e grade.
  2. Remove o fundo (branco/grade clara) deixando-o transparente, sem apagar a
     pele creme do personagem (usa componentes conectados a partir da borda).
  3. Alinha todos os frames pelo mesmo ponto de referencia (centro/base dos pes).
  4. Normaliza todos para o mesmo tamanho de quadro.
  5. Monta uma sprite sheet horizontal unica (1 linha x 8 colunas).
  6. Exporta tambem os 8 frames soltos em PNG transparente.

Uso:
    python process_sprites.py [caminho_da_imagem_origem]
"""

import sys
import os
import numpy as np
from PIL import Image
from scipy import ndimage

# ---------------------------------------------------------------------------
# Configuracao
# ---------------------------------------------------------------------------
SRC = sys.argv[1] if len(sys.argv) > 1 else "assets/source/walk_sheet.png"
OUT_DIR = "output"
FRAMES_DIR = os.path.join(OUT_DIR, "frames")
SHEET_PATH = os.path.join(OUT_DIR, "walk_strip.png")

# Bandas de conteudo detectadas por projecao (excluem titulo e numeros).
# (y0, y1) das duas linhas de personagens:
ROW_BANDS = [(140, 452), (531, 844)]
# Faixas horizontais das 4 colunas (com folga nas bordas):
COL_BANDS = [(210, 510), (570, 870), (928, 1228), (1291, 1591)]

# Teste de fundo: pixel claro e neutro (cinza), sem chegar perto do tom de pele.
# Pele creme ~ (247, 218, 194): canal minimo 194 -> bem abaixo do limiar 228.
BG_MIN_CHANNEL = 228      # todos os canais RGB precisam ser >= isto
BG_MAX_SATURATION = 20    # (max-min) dos canais <= isto  (cinza neutro)

# Bolsoes de fundo presos DENTRO do personagem (grade branca entre os cachos
# do cabelo, atras dos oculos). Removemos os grandes; os pequenos e brilhantes
# — os brilhos brancos dos olhos — sao preservados.
POCKET_MAX_KEEP = 110     # area (px): bolsao <= isto e mantido (brilho do olho)

PAD = 12                  # margem de seguranca ao redor do quadro normalizado


# ---------------------------------------------------------------------------
# Remocao de fundo
# ---------------------------------------------------------------------------
def make_transparent(rgba: np.ndarray) -> np.ndarray:
    """Deixa transparente apenas o fundo conectado as bordas.

    Isso preserva pixels claros do interior (brilho dos olhos, lentes) e,
    principalmente, nao remove a pele creme (que nao e cinza-clara)."""
    r = rgba[:, :, 0].astype(np.int16)
    g = rgba[:, :, 1].astype(np.int16)
    b = rgba[:, :, 2].astype(np.int16)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)

    bg_like = (mn >= BG_MIN_CHANNEL) & ((mx - mn) <= BG_MAX_SATURATION)

    # Rotula regioes de "cor de fundo".
    labels, n = ndimage.label(bg_like)
    remove = np.zeros_like(bg_like)
    if n > 0:
        border = set(labels[0, :]) | set(labels[-1, :]) | \
                 set(labels[:, 0]) | set(labels[:, -1])
        border.discard(0)
        # 1) tudo que toca a borda = fundo externo (grade + branco em volta).
        remove |= np.isin(labels, list(border))
        # 2) bolsoes internos GRANDES = grade presa no cabelo/atras dos oculos.
        #    Bolsoes pequenos (brilho dos olhos) ficam.
        sizes = ndimage.sum(np.ones_like(labels), labels, index=range(1, n + 1))
        border_lbls = set(border)
        for i in range(1, n + 1):
            if i in border_lbls:
                continue
            if sizes[i - 1] > POCKET_MAX_KEEP:
                remove |= (labels == i)

    out = rgba.copy()
    out[remove, 3] = 0
    return out


def bbox_of_alpha(rgba: np.ndarray):
    """Retorna (x0, y0, x1, y1) do conteudo opaco, ou None se vazio."""
    alpha = rgba[:, :, 3] > 8
    ys, xs = np.where(alpha)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def feet_anchor(sprite: np.ndarray):
    """Ponto de referencia = base dos pes.

    - base_y: linha opaca mais baixa (chao).
    - center_x: centro horizontal do bloco inferior (pes), estavel mesmo com
      o cabelo balancando de um lado para o outro.
    """
    alpha = sprite[:, :, 3] > 8
    ys, xs = np.where(alpha)
    base_y = ys.max()
    h = ys.max() - ys.min() + 1
    foot_band = max(1, int(h * 0.14))          # ~14% inferior = regiao dos pes
    mask = ys >= (base_y - foot_band)
    center_x = int(round(xs[mask].mean()))
    return center_x, base_y


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------
def main():
    os.makedirs(FRAMES_DIR, exist_ok=True)

    img = Image.open(SRC).convert("RGBA")
    arr = np.array(img)
    arr = make_transparent(arr)

    # 1) Recorta cada frame na sua faixa (linha x coluna) e obtem o bbox justo.
    sprites = []
    order = []  # numeracao 1..8
    idx = 0
    for (y0, y1) in ROW_BANDS:
        for (x0, x1) in COL_BANDS:
            idx += 1
            cell = arr[y0:y1, x0:x1]
            bb = bbox_of_alpha(cell)
            if bb is None:
                raise RuntimeError(f"Frame {idx}: nada encontrado na celula")
            cx0, cy0, cx1, cy1 = bb
            sprite = cell[cy0:cy1, cx0:cx1]
            sprites.append(sprite)
            order.append(idx)

    # 2) Descobre o tamanho normalizado do quadro a partir dos ancoras.
    #    Cada frame precisa de espaco para a esquerda/direita do centro dos pes
    #    e acima da base.
    left = right = up = 0
    metrics = []
    for sp in sprites:
        h, w = sp.shape[:2]
        cx, by = feet_anchor(sp)
        left = max(left, cx)
        right = max(right, w - 1 - cx)
        up = max(up, by)              # altura acima da base (base incluida)
        metrics.append((cx, by, w, h))

    frame_w = left + right + 1 + 2 * PAD
    frame_h = up + 1 + 2 * PAD
    # Alturas de sprite pares deixam o pixel-art mais estavel:
    frame_w += frame_w % 2
    frame_h += frame_h % 2

    anchor_x = left + PAD            # onde o centro dos pes cai no quadro
    base_line = up + PAD             # onde a base dos pes cai no quadro

    # 3) Compoe cada frame no quadro normalizado, alinhado pelos pes.
    norm_frames = []
    for sp, (cx, by, w, h) in zip(sprites, metrics):
        canvas = np.zeros((frame_h, frame_w, 4), dtype=np.uint8)
        dst_x = anchor_x - cx        # alinha centro dos pes
        dst_y = base_line - by       # alinha base dos pes
        canvas[dst_y:dst_y + h, dst_x:dst_x + w] = sp
        norm_frames.append(canvas)

    # 4) Exporta os 8 frames soltos.
    for n, canvas in zip(order, norm_frames):
        Image.fromarray(canvas, "RGBA").save(
            os.path.join(FRAMES_DIR, f"walk_{n}.png"))

    # 5) Monta a tira horizontal 1x8.
    strip = np.zeros((frame_h, frame_w * 8, 4), dtype=np.uint8)
    for i, canvas in enumerate(norm_frames):
        strip[:, i * frame_w:(i + 1) * frame_w] = canvas
    Image.fromarray(strip, "RGBA").save(SHEET_PATH)

    # 6) Relatorio.
    print("=" * 52)
    print("PROCESSAMENTO CONCLUIDO")
    print("=" * 52)
    print(f"Origem              : {SRC}  ({img.width}x{img.height})")
    print(f"Frames por quadro   : {frame_w} x {frame_h} px")
    print(f"Tira completa (1x8) : {frame_w * 8} x {frame_h} px")
    print(f"Ancora dos pes      : x={anchor_x}, base_y={base_line} (dentro do quadro)")
    print(f"Tira salva em       : {SHEET_PATH}")
    print(f"Frames soltos em    : {FRAMES_DIR}/walk_1..8.png")
    return frame_w, frame_h


if __name__ == "__main__":
    main()
