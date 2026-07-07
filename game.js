// ============================================================
//  Madu in Love — Fase 1 (platformer, paisagem)
//  Chao/plataformas = superfícies DESENHADAS no cenário (hitbox por imagem)
// ============================================================
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;
  const stage = $('stage'), player = $('player'), sprite = $('sprite');
  const stick = $('joystick'), knob = $('knob');
  const jumpBtn = $('jumpBtn'), shootBtn = $('shootBtn');
  const menu = $('menu'), startBtn = $('startBtn'), cfgBtn = $('cfgBtn'), achBtn = $('achBtn');
  const menuToast = $('menuToast'), backBtn = $('backBtn');
  const fsMenuBtn = $('fsMenuBtn'), fsGameBtn = $('fsGameBtn');
  const levelCard = $('levelCard'), achPopup = $('achPopup');

  const num = v => parseFloat(getComputedStyle(root).getPropertyValue(v));

  // ---- fisica ----
  const GRAV = 2600, JUMP_VEL = 1040, EDGE = 26;
  const SCALE = 0.42;   // = --player-scale

  // ---- superfícies desenhadas no cenário (fracoes da imagem 1584x672) ----
  //  A primeira (ground) atravessa toda a largura e e "solida".
  //  As demais sao plataformas one-way (sobe por baixo, pousa em cima).
  const IMG_W = 1584, IMG_H = 672;
  const HITBOXES = [
    { x0: 0.00, x1: 1.00, top: 0.876 },   // 0 = chao (passarela da frente)
    { x0: 0.045, x1: 0.225, top: 0.620 }, // esquerda-meio
    { x0: 0.395, x1: 0.625, top: 0.615 }, // centro (varanda da casa)
    { x0: 0.715, x1: 0.885, top: 0.620 }, // direita-meio
    { x0: 0.078, x1: 0.225, top: 0.345 }, // esquerda-alto
    { x0: 0.715, x1: 0.950, top: 0.420 }, // direita-alto
  ];
  let floors = [];

  function coverMap() {
    const W = stage.clientWidth, H = stage.clientHeight;
    const s = Math.max(W / IMG_W, H / IMG_H);
    const dw = IMG_W * s, dh = IMG_H * s;
    return { dw, dh, offX: (W - dw) * 0.5, offY: (H - dh) };  // pos: center bottom
  }
  function computeFloors() {
    const c = coverMap();
    floors = HITBOXES.map(h => ({
      x0: c.offX + h.x0 * c.dw,
      x1: c.offX + h.x1 * c.dw,
      top: c.offY + h.top * c.dh,
    }));
  }
  const groundTop = () => floors[0].top;

  // ---- estado ----
  let pos = { x: 0, y: 0 }, vyVel = 0, onGround = false, face = 1, vx = 0;
  const keys = new Set(); const DEAD = 0.12;
  let shooting = false, shootTimer = 0, projTimer = 0;
  const projectiles = []; let playing = false;

  function place() {
    const w = sprite.offsetWidth, h = sprite.offsetHeight;
    player.style.transform = `translate3d(${pos.x - w / 2}px, ${pos.y - h}px, 0)`;
  }

  // ---- joystick (so horizontal) ----
  const R = 70; let dragId = null;
  const setKnob = (dx, dy) => knob.style.transform = `translate(${dx}px, ${dy}px)`;
  function joyStart(e) { dragId = e.pointerId; stick.setPointerCapture(e.pointerId); joyMove(e); }
  function joyMove(e) {
    if (e.pointerId !== dragId) return;
    const r = stick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(dx, dy); if (m > R) { dx = dx / m * R; dy = dy / m * R; }
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
  const keyDir = () => (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);

  // ---- pulo ----
  function jump() { if (playing && onGround) { vyVel = -JUMP_VEL; onGround = false; } }

  // ---- tiro ----
  function spawnProjectile() {
    const dir = -face;
    const w = num('--projectile-w') * SCALE, h = num('--projectile-h') * SCALE;
    const el = document.createElement('div'); el.className = 'projectile'; stage.appendChild(el);
    const p = { el, w, h, vx: dir * num('--projectile-speed'), flip: dir < 0,
      x: pos.x + dir * (num('--shoot-w') * SCALE * 0.34),
      y: pos.y - num('--shoot-h') * SCALE * 0.48 };
    projectiles.push(p); drawProjectile(p);
  }
  function drawProjectile(p) {
    p.el.style.width = p.w + 'px'; p.el.style.height = p.h + 'px';
    p.el.style.transform = `translate3d(${p.x - p.w / 2}px, ${p.y - p.h / 2}px, 0)` + (p.flip ? ' scaleX(-1)' : '');
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i]; p.x += p.vx * dt; drawProjectile(p);
      if (p.x < -p.w || p.x > stage.clientWidth + p.w) { p.el.remove(); projectiles.splice(i, 1); }
    }
  }
  function endShoot() { if (!shooting) return; shooting = false; clearTimeout(shootTimer); sprite.classList.remove('is-shooting'); }
  function shoot() {
    if (!playing || shooting) return;
    shooting = true; sprite.classList.add('is-shooting');
    projTimer = setTimeout(spawnProjectile, num('--shoot-speed') * 1000 * 0.45);
    shootTimer = setTimeout(endShoot, 1400);
  }
  sprite.addEventListener('animationend', e => { if (e.animationName === 'shoot') endShoot(); });

  // ---- botoes de acao ----
  function bindButton(btn, fn) {
    btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('pressed'); fn(); });
    const off = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', off); btn.addEventListener('pointercancel', off); btn.addEventListener('pointerleave', off);
  }
  bindButton(jumpBtn, jump);
  bindButton(shootBtn, shoot);

  // ---- segredo: clicar num passarinho ao fundo ----
  const ACH_KEY = 'madu_ach_bird';
  function unlockBirdAchievement() {
    try { localStorage.setItem(ACH_KEY, '1'); } catch (_) {}
    achPopup.classList.add('show');
    clearTimeout(unlockBirdAchievement._t);
    unlockBirdAchievement._t = setTimeout(() => achPopup.classList.remove('show'), 3400);
  }
  document.querySelectorAll('.bird').forEach(bd =>
    bd.addEventListener('click', e => { e.stopPropagation(); unlockBirdAchievement(); }));

  // ---- loop ----
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (playing) {
      const W = stage.clientWidth;
      let ix = Math.max(-1, Math.min(1, vx + keyDir()));
      const moving = Math.abs(ix) > DEAD && !shooting;
      if (moving) {
        pos.x += ix * num('--move-speed') * dt;
        pos.x = Math.max(EDGE, Math.min(W - EDGE, pos.x));
        if (ix < -0.05) face = 1; else if (ix > 0.05) face = -1;
        root.style.setProperty('--face', face);
      }
      // gravidade + colisao
      vyVel += GRAV * dt;
      let ny = pos.y + vyVel * dt, landed = false;
      if (vyVel >= 0) {                              // plataformas one-way
        for (let i = 1; i < floors.length; i++) {
          const f = floors[i];
          if (pos.x >= f.x0 && pos.x <= f.x1 && pos.y <= f.top + 2 && ny >= f.top) {
            ny = f.top; vyVel = 0; landed = true;
          }
        }
      }
      const g = floors[0];                           // chao solido (pega sempre)
      if (ny >= g.top) { ny = g.top; vyVel = 0; landed = true; }
      pos.y = ny; onGround = landed;

      // poses
      if (!shooting) {
        sprite.classList.toggle('is-airborne', !onGround);
        sprite.classList.toggle('is-walking', onGround && moving);
        sprite.classList.toggle('is-idle', onGround && !moving);
      }
      place();
      updateProjectiles(dt);
    }
    requestAnimationFrame(tick);
  }

  // ---- tela cheia ----
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  function enterFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
    if (req) { try { const r = req.call(el); if (r && r.catch) r.catch(() => {}); } catch (_) {} }
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  }
  function toggleFullscreen() {
    if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen || (() => {})).call(document);
    else enterFullscreen();
  }
  fsMenuBtn.addEventListener('click', toggleFullscreen);
  fsGameBtn.addEventListener('click', toggleFullscreen);

  // ---- menu / navegacao ----
  function resetPlayer() {
    computeFloors();
    pos.x = stage.clientWidth * 0.3; pos.y = groundTop();
    vyVel = 0; onGround = true; face = 1; root.style.setProperty('--face', face);
    sprite.className = 'sprite is-idle'; place();
  }
  function startGame() {
    enterFullscreen();
    menu.style.display = 'none'; stage.hidden = false;
    resetPlayer(); playing = true;
    levelCard.classList.add('show');
    clearTimeout(startGame._t);
    startGame._t = setTimeout(() => levelCard.classList.remove('show'), 2200);
  }
  function toMenu() { playing = false; stage.hidden = true; menu.style.display = 'flex'; }
  function toast(msg) {
    menuToast.textContent = msg; menuToast.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => menuToast.classList.remove('show'), 1800);
  }
  startBtn.addEventListener('click', startGame);
  cfgBtn.addEventListener('click', () => toast('Configurações — em breve 💫'));
  achBtn.addEventListener('click', () => toast(
    localStorage.getItem(ACH_KEY) ? '🏆 confundindo os jogos patrão?' : 'Nenhuma conquista ainda… 👀'));
  backBtn.addEventListener('click', toMenu);

  addEventListener('resize', () => {
    if (stage.hidden) return;
    computeFloors();
    pos.x = Math.max(EDGE, Math.min(stage.clientWidth - EDGE, pos.x));
    pos.y = Math.min(pos.y, groundTop());
    place();
  });

  requestAnimationFrame(tick);
})();
