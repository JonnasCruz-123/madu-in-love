// ============================================================
//  Madu in Love — platformer (paisagem) com menu, pulo e tiro
// ============================================================
(() => {
  const root    = document.documentElement;
  const stage   = document.getElementById('stage');
  const player  = document.getElementById('player');
  const sprite  = document.getElementById('sprite');
  const stick   = document.getElementById('joystick');
  const knob    = document.getElementById('knob');
  const jumpBtn = document.getElementById('jumpBtn');
  const shootBtn = document.getElementById('shootBtn');
  const platformsEl = document.getElementById('platforms');
  const groundEl = document.getElementById('ground');
  const coinCountEl = document.getElementById('coinCount');
  // menu
  const menu = document.getElementById('menu');
  const startBtn = document.getElementById('startBtn');
  const cfgBtn = document.getElementById('cfgBtn');
  const achBtn = document.getElementById('achBtn');
  const menuToast = document.getElementById('menuToast');
  const backBtn = document.getElementById('backBtn');
  const fsMenuBtn = document.getElementById('fsMenuBtn');
  const fsGameBtn = document.getElementById('fsGameBtn');

  const num = v => parseFloat(getComputedStyle(root).getPropertyValue(v));

  // ---- fisica ----
  const GRAV = 2600;          // gravidade (px/s^2)
  const JUMP_VEL = 1040;      // impulso do pulo (px/s)  -> altura ~208px
  const GROUND_H = 54;        // espessura do chao (px)
  const EDGE = 26;            // margem lateral

  // ---- estado ----
  let pos = { x: 0, y: 0 };   // pos dos PES
  let vyVel = 0;              // velocidade vertical (+ = caindo)
  let onGround = false;
  let face = 1;               // 1 = esquerda, -1 = direita
  let vx = 0;                 // entrada horizontal do joystick (-1..1)
  const keys = new Set();
  const DEAD = 0.12;
  let shooting = false, shootTimer = 0, projTimer = 0;
  const projectiles = [];
  let playing = false;

  // ---- plataformas (frações do palco) ----
  const PLAT_DEFS = [
    { x: 0.06, w: 0.19, top: 0.60 },
    { x: 0.39, w: 0.20, top: 0.42 },
    { x: 0.72, w: 0.21, top: 0.60 },
  ];
  let platforms = [];

  function groundTop() { return stage.clientHeight - GROUND_H; }

  function buildPlatforms() {
    platformsEl.innerHTML = '';
    platforms = PLAT_DEFS.map(d => {
      const el = document.createElement('div');
      el.className = 'platform';
      platformsEl.appendChild(el);
      return { el, def: d };
    });
    layout();
  }
  function layout() {
    const W = stage.clientWidth, H = stage.clientHeight;
    for (const p of platforms) {
      p.px = p.def.x * W;
      p.pw = p.def.w * W;
      p.ptop = Math.round(p.def.top * H);
      const ph = 46;   // plataforma flutuante fininha
      p.el.style.left = p.px + 'px';
      p.el.style.top = p.ptop + 'px';
      p.el.style.width = p.pw + 'px';
      p.el.style.height = ph + 'px';
    }
    groundEl.style.height = GROUND_H + 'px';
  }

  function place() {
    const w = sprite.offsetWidth, h = sprite.offsetHeight;
    player.style.transform = `translate3d(${pos.x - w / 2}px, ${pos.y - h}px, 0)`;
  }

  // ---- joystick (só o eixo horizontal move) ----
  const R = 70; let dragId = null;
  const setKnob = (dx, dy) => knob.style.transform = `translate(${dx}px, ${dy}px)`;
  function joyStart(e) { dragId = e.pointerId; stick.setPointerCapture(e.pointerId); joyMove(e); }
  function joyMove(e) {
    if (e.pointerId !== dragId) return;
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > R) { dx = dx / m * R; dy = dy / m * R; }
    setKnob(dx, dy); vx = dx / R;
  }
  function joyEnd(e) { if (e.pointerId !== dragId) return; dragId = null; vx = 0; setKnob(0, 0); }
  stick.addEventListener('pointerdown', joyStart);
  stick.addEventListener('pointermove', joyMove);
  stick.addEventListener('pointerup', joyEnd);
  stick.addEventListener('pointercancel', joyEnd);

  // ---- teclado ----
  const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  addEventListener('keydown', e => {
    if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { jump(); e.preventDefault(); }
    if (e.code === 'KeyF' || e.code === 'Enter') { shoot(); e.preventDefault(); }
  });
  addEventListener('keyup', e => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
  function keyDir() { return (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0); }

  // ---- pulo ----
  function jump() { if (playing && onGround) { vyVel = -JUMP_VEL; onGround = false; } }

  // ---- tiro (flecha-coracao) ----
  function spawnProjectile() {
    const scale = num('--player-scale');
    const dir = -face;
    const w = num('--projectile-w') * scale, h = num('--projectile-h') * scale;
    const el = document.createElement('div'); el.className = 'projectile';
    stage.appendChild(el);
    const p = {
      el, w, h, vx: dir * num('--projectile-speed'), flip: dir < 0,
      x: pos.x + dir * (num('--shoot-w') * scale * 0.34),
      y: pos.y - num('--shoot-h') * scale * 0.48,   // pos.y ja inclui a altura do pulo
    };
    projectiles.push(p); drawProjectile(p);
  }
  function drawProjectile(p) {
    p.el.style.width = p.w + 'px'; p.el.style.height = p.h + 'px';
    p.el.style.transform =
      `translate3d(${p.x - p.w / 2}px, ${p.y - p.h / 2}px, 0)` + (p.flip ? ' scaleX(-1)' : '');
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt; drawProjectile(p);
      if (p.x < -p.w || p.x > stage.clientWidth + p.w) { p.el.remove(); projectiles.splice(i, 1); }
    }
  }
  function endShoot() {
    if (!shooting) return;
    shooting = false; clearTimeout(shootTimer);
    sprite.classList.remove('is-shooting');
  }
  function shoot() {
    if (!playing || shooting) return;       // pode atirar pulando; a flecha sai mais alta
    shooting = true;
    sprite.classList.remove('is-walking');
    sprite.classList.add('is-shooting');
    projTimer = setTimeout(spawnProjectile, num('--shoot-speed') * 1000 * 0.45);
    shootTimer = setTimeout(endShoot, 1400);
  }
  sprite.addEventListener('animationend', e => { if (e.animationName === 'shoot') endShoot(); });

  // ---- botoes ----
  function bindButton(btn, fn) {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('pressed'); fn(); });
    const off = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  }
  bindButton(jumpBtn, jump);
  bindButton(shootBtn, shoot);

  // ---- loop ----
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (playing) {
      const W = stage.clientWidth;
      // horizontal (parada enquanto atira)
      let ix = vx + keyDir();
      ix = Math.max(-1, Math.min(1, ix));
      const moving = Math.abs(ix) > DEAD && !shooting;
      if (moving) {
        pos.x += ix * num('--move-speed') * dt;
        pos.x = Math.max(EDGE, Math.min(W - EDGE, pos.x));
        if (ix < -0.05) face = 1; else if (ix > 0.05) face = -1;
        root.style.setProperty('--face', face);
      }

      // vertical: gravidade + colisao com chao/plataformas (one-way)
      vyVel += GRAV * dt;
      let ny = pos.y + vyVel * dt;
      let landed = false;
      const gt = groundTop();
      if (ny >= gt) { ny = gt; vyVel = 0; landed = true; }
      if (vyVel >= 0) {
        for (const p of platforms) {
          if (pos.x >= p.px && pos.x <= p.px + p.pw &&
              pos.y <= p.ptop + 2 && ny >= p.ptop) {
            ny = p.ptop; vyVel = 0; landed = true;
          }
        }
      }
      pos.y = ny; onGround = landed;

      // poses
      if (!shooting) {
        if (!onGround) { sprite.classList.add('is-airborne'); sprite.classList.remove('is-walking'); }
        else { sprite.classList.remove('is-airborne'); sprite.classList.toggle('is-walking', moving); }
      }
      place();
      updateProjectiles(dt);
    }
    requestAnimationFrame(tick);
  }

  // ---- menu / navegacao ----
  function resetPlayer() {
    pos.x = stage.clientWidth * 0.28;
    pos.y = groundTop();
    vyVel = 0; onGround = true; face = 1;
    root.style.setProperty('--face', face);
    place();
  }
  // ---- tela cheia ----
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }
  function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
    if (req) { try { const r = req.call(el); if (r && r.catch) r.catch(() => {}); } catch (_) {} }
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock('landscape').catch(() => {});   // trava em paisagem se der
    }
  }
  function toggleFullscreen() {
    if (fsElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
    } else {
      enterFullscreen();
    }
  }
  fsMenuBtn.addEventListener('click', toggleFullscreen);
  fsGameBtn.addEventListener('click', toggleFullscreen);

  function startGame() {
    enterFullscreen();          // tela cheia no gesto de INICIAR
    menu.style.display = 'none';
    stage.hidden = false;
    buildPlatforms();
    resetPlayer();
    playing = true;
  }
  function toMenu() {
    playing = false;
    stage.hidden = true;
    menu.style.display = 'flex';
  }
  function toast(msg) {
    menuToast.textContent = msg;
    menuToast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => menuToast.classList.remove('show'), 1600);
  }
  startBtn.addEventListener('click', startGame);
  cfgBtn.addEventListener('click', () => toast('Configurações — em breve 💫'));
  achBtn.addEventListener('click', () => toast('Conquistas — em breve 🏆'));
  backBtn.addEventListener('click', toMenu);

  addEventListener('resize', () => {
    if (stage.hidden) return;
    layout();
    pos.x = Math.max(EDGE, Math.min(stage.clientWidth - EDGE, pos.x));
    pos.y = Math.min(pos.y, groundTop());
    place();
  });

  // inicia o loop (a fisica só roda depois de "INICIAR JOGO")
  requestAnimationFrame(tick);
})();
