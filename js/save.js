// js/save.js
const KEY = 'velocity_breakpoint_save_v1';

export const DEFAULT_SAVE = {
  version: 1,
  credits: 0,
  bestRun: null,
  stageBests: {},
  runsCompleted: 0,
  settings: { sensitivity: 1, fov: 92, volume: 0.6, cameraFx: true, quality: 'high' }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULT_SAVE);
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== 1) return clone(DEFAULT_SAVE);
    return {
      ...clone(DEFAULT_SAVE),
      ...data,
      settings: { ...DEFAULT_SAVE.settings, ...(data.settings || {}) },
      stageBests: data.stageBests && typeof data.stageBests === 'object' ? data.stageBests : {}
    };
  } catch (e) {
    console.warn('[save] corrupt save, resetting', e);
    return clone(DEFAULT_SAVE);
  }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); }
  catch (e) { console.warn('[save] write failed', e); }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}
