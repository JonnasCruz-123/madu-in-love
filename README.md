# madu-in-love — sprite de caminhada (chibi)

Processamento da sprite sheet **"WALK (8 FRAMES)"** e demo de animação de
caminhada no lugar (estilo mascote) com CSS.

## O que foi feito

A partir da folha original (2 linhas × 4 colunas, com título, numeração e grade
de fundo), o script `process_sprites.py`:

1. **Recorta os 8 frames** individuais, ignorando o título, os números e a grade.
2. **Deixa o fundo transparente** — o fundo branco/grade é removido por
   componentes conectados à borda, o que preserva a pele creme do rosto e até os
   brilhos brancos dos olhos (tolerância conservadora, sem halo).
3. **Alinha todos os frames** pelo mesmo ponto de referência (centro/base dos
   pés), então a animação não treme.
4. **Normaliza** todos para o mesmo tamanho de quadro.
5. **Monta a tira horizontal** única (1 linha × 8 colunas).
6. **Exporta os 8 frames soltos** em PNG transparente.

## Dimensões finais

| Item | Dimensão |
|------|----------|
| Cada frame | **288 × 338 px** |
| Tira completa (1×8) | **2304 × 338 px** |

## Arquivos gerados

```
output/
├── walk_strip.png        # tira horizontal 1×8 (2304×338)
└── frames/
    ├── walk_1.png ... walk_8.png   # frames soltos (288×338, transparentes)
```

## Como reprocessar

```bash
pip install Pillow numpy scipy
python3 process_sprites.py assets/source/walk_sheet.png
```

## Demo da animação

Abra `index.html` no navegador. A animação usa
`animation: walk var(--speed) steps(8) infinite` + `image-rendering: pixelated`.

### Ajustes rápidos (em `style.css`, bloco `:root`)

```css
--sprite:  url("output/walk_strip.png");  /* caminho da tira  */
--frame-w: 288px;                          /* largura do quadro */
--frame-h: 338px;                          /* altura do quadro  */
--frames:  8;                              /* nº de quadros     */
--speed:   0.9s;                           /* velocidade (menor = mais rápido) */
--scale:   1.2;                            /* tamanho na tela   */
```

O painel no canto inferior também permite mudar velocidade e escala ao vivo
(pode ser removido — é só para testes).

## 🎮 Mini game (joystick)

Abra `game.html` para controlar o personagem num cenário:

- **Joystick virtual** (canto inferior esquerdo) — funciona com toque e mouse.
- **Teclado** — WASD ou setas (com diagonais).
- O personagem **anima ao andar** e **para quando solta**; vira para o lado do
  movimento (espelhado à direita).
- HUD com sliders ao vivo: **velocidade** de deslocamento, **passada** (rapidez
  das pernas) e **tamanho** do personagem.

Arquivos: `game.html`, `game.css`, `game.js`. Os ajustes rápidos ficam no bloco
`:root` de `game.css` (`--move-speed`, `--walk-speed`, `--player-scale`, `--sprite`…).

---

(⁠◍⁠•⁠ᴗ⁠•⁠◍⁠)⁠❤
