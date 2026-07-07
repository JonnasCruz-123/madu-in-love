// ============================================================
//  Mini game — controla o mascote com joystick / teclado
// ============================================================
(() => {
  const root   = document.documentElement;
  const stage  = document.getElementById('stage');
  const player = document.getElementById('player');
  const sprite = document.getElementById('sprite');
  const stick  = document.getElementById('joystick');
  const knob   = document.getElementById('knob');
  const jumpBtn = document.getElementById('jumpBtn');
  const shootBtn = document.getElementById('shootBtn');

  // ---- estado ----
  const cfg = {
    get speed() { return parseFloat(getComputedStyle(root).getPropertyValue('--move-speed')); },
  };
  let vx = 0, vy = 0;            // vetor de entrada normalizado (-1..1)
  let face = 1;                 // 1 = esquerda (original), -1 = direita
  let pos = { x: 0, y: 0 };     // posicao do pe do personagem no cenario
  const keys = new Set();
  const DEAD = 0.12;            // zona morta do joystick

  // Posiciona o personagem: (pos.x,pos.y) = base dos pes (centro-inferior).
  function place() {
    // .player usa transform-origin bottom center no sprite, entao alinhamos
    // o canto do .player de modo que o centro-base caia em (pos.x,pos.y).
    const w = sprite.offsetWidth;   // largura ja escalada
    const h = sprite.offsetHeight;
    player.style.transform =
      `translate3d(${pos.x - w / 2}px, ${pos.y - h}px, 0)`;
  }

  function bounds() {
    const w = sprite.offsetWidth, h = sprite.offsetHeight;
    return {
      minX: w / 2, maxX: stage.clientWidth - w / 2,
      minY: h,     maxY: stage.clientHeight - 8,
    };
  }

  // ---- pulo (o arco ja esta embutido nos frames; roda a tira UMA vez) ----
  let jumping = false, jumpTimer = 0;
  function endJump() {
    if (!jumping) return;
    jumping = false;
    clearTimeout(jumpTimer);
    sprite.classList.remove('is-jumping');
    place();                         // volta ao quadro de caminhada
  }
  function jump() {
    if (jumping || shooting) return;   // uma acao de cada vez
    jumping = true;
    sprite.classList.remove('is-walking');
    sprite.classList.add('is-jumping');
    place();                         // quadro do pulo e mais alto (espaco pro arco)
    jumpTimer = setTimeout(endJump, 1000);   // seguranca, caso animationend falhe
  }

  // ---- tiro (flecha-coracao) ----
  const projectiles = [];
  let shooting = false, shootTimer = 0, projTimer = 0;

  function num(v) { return parseFloat(getComputedStyle(root).getPropertyValue(v)); }

  function spawnProjectile() {
    const scale = num('--player-scale');
    const dir = -face;                       // face 1(esq)=> -1 ; face -1(dir)=> +1
    const w = num('--projectile-w') * scale;
    const h = num('--projectile-h') * scale;
    const el = document.createElement('div');
    el.className = 'projectile';
    stage.appendChild(el);
    const p = {
      el, w, h, vx: dir * num('--projectile-speed'), flip: dir < 0,
      x: pos.x + dir * (num('--shoot-w') * scale * 0.34),   // sai a frente, na ponta do arco
      y: pos.y - num('--shoot-h') * scale * 0.48,           // altura do arco/mao
    };
    projectiles.push(p);
    drawProjectile(p);
  }
  function drawProjectile(p) {
    p.el.style.width = p.w + 'px';
    p.el.style.height = p.h + 'px';
    p.el.style.transform =
      `translate3d(${p.x - p.w / 2}px, ${p.y - p.h / 2}px, 0)` + (p.flip ? ' scaleX(-1)' : '');
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt;
      drawProjectile(p);
      if (p.x < -p.w || p.x > stage.clientWidth + p.w) {   // saiu da tela -> remove
        p.el.remove();
        projectiles.splice(i, 1);
      }
    }
  }

  function endShoot() {
    if (!shooting) return;
    shooting = false;
    clearTimeout(shootTimer);
    sprite.classList.remove('is-shooting');
    place();
  }
  function shoot() {
    if (jumping || shooting) return;   // uma acao de cada vez
    shooting = true;
    sprite.classList.remove('is-walking');
    sprite.classList.add('is-shooting');
    place();
    // o coracao sai quando ela solta a corda (~frame 4)
    projTimer = setTimeout(spawnProjectile, num('--shoot-speed') * 1000 * 0.45);
    shootTimer = setTimeout(endShoot, 1400);
  }

  // ao terminar as animacoes de acao, volta ao normal
  sprite.addEventListener('animationend', (e) => {
    if (e.animationName === 'jump') endJump();
    if (e.animationName === 'shoot') endShoot();
  });

  // ---- joystick (Pointer Events: mouse + toque unificados) ----
  const R = 70;                 // raio maximo do knob (px)
  let dragId = null;

  function setKnob(dx, dy) {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function joyStart(e) {
    dragId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    joyMove(e);
  }
  function joyMove(e) {
    if (e.pointerId !== dragId) return;
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > R) { dx = dx / mag * R; dy = dy / mag * R; }
    setKnob(dx, dy);
    vx = dx / R; vy = dy / R;
  }
  function joyEnd(e) {
    if (e.pointerId !== dragId) return;
    dragId = null; vx = 0; vy = 0; setKnob(0, 0);
  }
  stick.addEventListener('pointerdown', joyStart);
  stick.addEventListener('pointermove', joyMove);
  stick.addEventListener('pointerup', joyEnd);
  stick.addEventListener('pointercancel', joyEnd);

  // ---- teclado (WASD / setas) ----
  const KEYMAP = {
    ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
    ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r',
  };
  addEventListener('keydown', e => {
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.code === 'Space') { jump(); e.preventDefault(); }
    if (e.code === 'KeyF' || e.code === 'Enter') { shoot(); e.preventDefault(); }
  });
  addEventListener('keyup',   e => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });

  // ---- botoes de acao (toque / clique) ----
  function bindButton(btn, fn) {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('pressed'); fn(); });
    const off = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  }
  bindButton(jumpBtn, jump);
  bindButton(shootBtn, shoot);

  function keyVector() {
    let kx = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
    let ky = (keys.has('d') ? 1 : 0) - (keys.has('u') ? 1 : 0);
    if (kx && ky) { kx *= 0.7071; ky *= 0.7071; } // normaliza diagonal
    return { kx, ky };
  }

  // ---- loop principal ----
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // combina joystick + teclado
    const { kx, ky } = keyVector();
    let ix = vx + kx, iy = vy + ky;
    const mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; }

    const moving = mag > DEAD;
    if (moving) {
      const sp = cfg.speed;
      pos.x += ix * sp * dt;
      pos.y += iy * sp * dt;
      const b = bounds();
      pos.x = Math.max(b.minX, Math.min(b.maxX, pos.x));
      pos.y = Math.max(b.minY, Math.min(b.maxY, pos.y));

      // vira para o lado do movimento horizontal (mantem se for so vertical)
      if (ix < -0.05) face = 1;
      else if (ix > 0.05) face = -1;
      root.style.setProperty('--face', face);
      place();
    }
    sprite.classList.toggle('is-walking', moving);

    updateProjectiles(dt);
    requestAnimationFrame(tick);
  }

  // ---- HUD (sliders opcionais) ----
  function bindRange(id, cssVar, fmt, suffix = '') {
    const el = document.getElementById(id);
    const out = document.getElementById(id + 'Val');
    const apply = () => {
      root.style.setProperty(cssVar, el.value + suffix);
      out.textContent = fmt(el.value);
    };
    el.addEventListener('input', apply); apply();
  }
  bindRange('speed', '--move-speed', v => v + ' px/s');
  bindRange('walk',  '--walk-speed', v => (+v).toFixed(2) + 's', 's');
  bindRange('scale', '--player-scale', v => (+v).toFixed(2) + '×');

  // ---- init ----
  function start() {
    pos.x = stage.clientWidth / 2;
    pos.y = stage.clientHeight * 0.72;
    place();
    requestAnimationFrame(tick);
  }
  addEventListener('resize', () => {
    const b = bounds();
    pos.x = Math.max(b.minX, Math.min(b.maxX, pos.x));
    pos.y = Math.max(b.minY, Math.min(b.maxY, pos.y));
    place();
  });
  start();
})();
