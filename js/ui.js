// js/ui.js
import { SFX } from './audio.js';

export class UI {
  constructor(game) {
    this.game = game;
    this.el = (id) => document.getElementById(id);

    this.hud = this.el('hud');
    this.overlay = this.el('overlay');
    this.screens = {};
    ['menu', 'controls', 'settings', 'abilities', 'records', 'pause', 'upgrade', 'results', 'click']
      .forEach(n => { this.screens[n] = this.el('screen-' + n); });

    this.toastEl = this.el('hud-toast');
    this.toastTimer = 0;
    this.abilityEls = [];

    this.buildAbilityHud();
    this.bind();
    this.applySettingsToUI();
  }

  /* ------------------------- screens ------------------------- */
  hideAllScreens() {
    for (const k in this.screens) this.screens[k].classList.add('hidden');
  }

  showScreen(name) {
    this.hideAllScreens();
    if (name && this.screens[name]) this.screens[name].classList.remove('hidden');
  }

  showHud(v) {
    this.hud.classList.toggle('hidden', !v);
  }

  showToast(text, ms = 1400) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = ms / 1000;
  }

  tickToast(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }

  /* ------------------------- bindings ------------------------- */
  bind() {
    const click = (id, fn) => {
      const e = this.el(id);
      if (e) e.addEventListener('click', () => { SFX.ui(); fn(); });
    };

    click('btn-play', () => this.game.startRun());
    click('btn-continue', () => this.game.resumeRun());
    click('btn-abilities', () => { this.renderAbilities(); this.showScreen('abilities'); });
    click('btn-records', () => { this.renderRecords(); this.showScreen('records'); });
    click('btn-settings', () => this.showScreen('settings'));
    click('btn-controls', () => this.showScreen('controls'));
    click('btn-pause-settings', () => { this.returnScreen = 'pause'; this.showScreen('settings'); });

    click('btn-resume', () => this.game.resume());
    click('btn-restart', () => this.game.restartStage());
    click('btn-abandon', () => this.game.abandonRun());

    click('btn-res-continue', () => this.game.continueFromResults());
    click('btn-res-retry', () => this.game.retryStage());
    click('btn-res-hub', () => this.game.toHub());

    click('btn-reset', () => {
      if (confirm('Erase all progression, records and settings? This cannot be undone.')) {
        this.game.resetSave();
        this.applySettingsToUI();
        this.showScreen('menu');
      }
    });

    document.querySelectorAll('[data-back]').forEach(b => {
      b.addEventListener('click', () => {
        SFX.ui();
        if (this.returnScreen === 'pause') {
          this.returnScreen = null;
          this.showScreen('pause');
        } else {
          this.showScreen(this.game.state === 'paused' ? 'pause' : 'menu');
        }
      });
    });

    // Settings inputs
    const setSens = this.el('set-sens');
    const setFov = this.el('set-fov');
    const setVol = this.el('set-vol');
    const setFx = this.el('set-fx');
    const setQ = this.el('set-quality');

    setSens.addEventListener('input', () => {
      this.game.settings.sensitivity = parseFloat(setSens.value);
      this.el('val-sens').textContent = this.game.settings.sensitivity.toFixed(2);
      this.game.persistSettings();
    });
    setFov.addEventListener('input', () => {
      this.game.settings.fov = parseFloat(setFov.value);
      this.el('val-fov').textContent = Math.round(this.game.settings.fov);
      this.game.persistSettings();
    });
    setVol.addEventListener('input', () => {
      this.game.settings.volume = parseFloat(setVol.value);
      this.el('val-vol').textContent = this.game.settings.volume.toFixed(2);
      this.game.applyVolume();
      this.game.persistSettings();
    });
    setFx.addEventListener('change', () => {
      this.game.settings.cameraFx = setFx.checked;
      this.game.persistSettings();
    });
    setQ.addEventListener('change', () => {
      this.game.settings.quality = setQ.value;
      this.game.engine.setQuality(setQ.value);
      this.game.persistSettings();
    });
  }

  applySettingsToUI() {
    const s = this.game.settings;
    this.el('set-sens').value = s.sensitivity;
    this.el('val-sens').textContent = Number(s.sensitivity).toFixed(2);
    this.el('set-fov').value = s.fov;
    this.el('val-fov').textContent = Math.round(s.fov);
    this.el('set-vol').value = s.volume;
    this.el('val-vol').textContent = Number(s.volume).toFixed(2);
    this.el('set-fx').checked = !!s.cameraFx;
    this.el('set-quality').value = s.quality;
  }

  /* ------------------------- HUD ------------------------- */
  buildAbilityHud() {
    const wrap = this.el('hud-abilities');
    wrap.innerHTML = '';
    this.abilityEls = [];
    for (let i = 0; i < 2; i++) {
      const d = document.createElement('div');
      d.className = 'ability empty';
      d.innerHTML = `<div class="glyph">—</div><div class="key">${i === 0 ? 'Q' : 'R'}</div><div class="cd" style="transform:scaleY(0)"></div>`;
      wrap.appendChild(d);
      this.abilityEls.push(d);
    }
  }

  refreshAbilityHud(player) {
    const { ABILITIES } = this.game.abilityDefs;
    for (let i = 0; i < 2; i++) {
      const el = this.abilityEls[i];
      const id = player.abilities[i];
      if (!id) {
        el.classList.add('empty');
        el.querySelector('.glyph').textContent = '—';
        el.querySelector('.cd').style.transform = 'scaleY(0)';
        el.classList.remove('ready');
        continue;
      }
      const ab = ABILITIES[id];
      el.classList.remove('empty');
      el.querySelector('.glyph').textContent = ab.glyph;
      const cd = player.cooldowns[id] || 0;
      const max = Math.max(0.001, id === 'dash' ? player.stats.dashCooldown : id === 'slam' ? 1.4 : 3.2);
      const f = Math.min(1, cd / max);
      el.querySelector('.cd').style.transform = `scaleY(${f})`;
      el.classList.toggle('ready', cd <= 0);
    }
  }

  updateHud(player, run) {
    this.el('hud-timer').textContent = this.game.stageTime.toFixed(3);
    this.el('hud-total').textContent = (run.totalTime + this.game.stageTime).toFixed(3);
    this.el('hud-speed').textContent = player.getHorizontalSpeed().toFixed(1);
    this.el('hud-stage').textContent = `STAGE ${run.stageIndex + 1} / ${run.stageCount}`;
    this.el('hud-health-fill').style.width = `${Math.max(0, (player.health / player.stats.maxHealth) * 100)}%`;
    this.el('hud-heals').textContent = 'HEAL ' + '◆'.repeat(Math.max(0, player.heals));

    const pb = this.game.save.stageBests[run.stageIndex];
    this.el('hud-pb').textContent = pb ? pb.toFixed(3) : '--';

    this.refreshAbilityHud(player);

    const cross = document.getElementById('crosshair');
    if (player.aimAnchor) cross.classList.add('active');
    else cross.classList.remove('active');

    this.tickToast(this.game.dt);
  }

  /* ------------------------- panels ------------------------- */
  renderAbilities() {
    const { ABILITIES } = this.game.abilityDefs;
    const list = this.el('ability-list');
    const save = this.game.save;
    list.innerHTML = '';
    const order = ['dash', 'slam', 'blink'];
    order.forEach(id => {
      const ab = ABILITIES[id];
      const known = save.unlockedAbilities.includes(id) || id === 'dash';
      const div = document.createElement('div');
      div.className = 'item' + (known ? '' : ' locked');
      div.innerHTML = `<span class="name">${ab.glyph} ${ab.name}</span>
        <span class="desc">${known ? ab.desc : 'LOCKED — find this during a run'}</span>`;
      list.appendChild(div);
    });
  }

  renderRecords() {
    const list = this.el('records-list');
    const save = this.game.save;
    list.innerHTML = '';
    if (!save.stageBests || Object.keys(save.stageBests).length === 0) {
      list.innerHTML = '<div class="item"><span class="name">NO RECORDS YET</span><span class="val">—</span></div>';
      return;
    }
    for (const k of Object.keys(save.stageBests).sort()) {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `<span class="name">STAGE ${Number(k) + 1}</span>
        <span class="val">${save.stageBests[k].toFixed(3)}s</span>`;
      list.appendChild(div);
    }
    if (save.bestRun) {
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `<span class="name">BEST FULL RUN</span><span class="val">${save.bestRun.toFixed(3)}s</span>`;
      list.appendChild(div);
    }
  }

  showUpgradeChoices(choices, onPick) {
    const wrap = this.el('upgrade-cards');
    wrap.innerHTML = '';
    choices.forEach(u => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="rarity ${u.rarity}">${u.rarity.toUpperCase()}</div>
        <h3>${u.name}</h3><p>${u.desc}</p>`;
      card.addEventListener('click', () => { SFX.upgrade(); onPick(u); });
      wrap.appendChild(card);
    });
    this.showScreen('upgrade');
  }

  showResults(data) {
    this.el('res-title').textContent = data.title || 'STAGE COMPLETE';
    this.el('res-time').textContent = data.time.toFixed(3);
    this.el('res-best').textContent = data.best ? data.best.toFixed(3) : '--';
    this.el('res-medal').textContent = data.medal;
    this.el('res-medal').style.color =
      data.medal === 'GOLD' ? '#ffd24a' : data.medal === 'SILVER' ? '#c9d6e0' :
      data.medal === 'BRONZE' ? '#c98a4b' : '#5a6b78';
    this.el('res-credits').textContent = '+' + data.credits;

    const splits = this.el('res-splits');
    splits.innerHTML = '';
    if (data.splits && data.splits.length) {
      data.splits.forEach(s => {
        const row = document.createElement('div');
        row.className = 'row2';
        row.innerHTML = `<span>${s.label}</span><span>${s.time.toFixed(3)}s</span>`;
        splits.appendChild(row);
      });
    }
    const contBtn = this.el('btn-res-continue');
    contBtn.textContent = data.final ? 'FINISH RUN' : 'CONTINUE';
    this.showScreen('results');
  }

  updateMenuMeta(save) {
    this.el('menu-currency').textContent = 'CREDITS: ' + (save.credits || 0);
    const contBtn = this.el('btn-continue');
    contBtn.style.display = this.game.run ? 'block' : 'none';
  }
}
