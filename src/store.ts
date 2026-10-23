// What the readout, the popover and the settings panel share: the devices and their levels, the
// apps playing sound, this plugin's settings, and the microphone shortcut.
//
// At module scope, not in a component: the shortcut must work while the popover is closed and the
// settings panel is not mounted, and both read the same devices. Started at import, stopped by
// `stop` (the plugin's dispose), so a reload does not leave a second poll or a second listener.
import {
  audioDevices, audioPeak, audioSessions, audioSessionSet, audioSetDefault, audioSetMute, audioSetVolume,
  configRead, configWrite, notifyOs, shortcutClear, shortcutSet,
  type AudioDevice, type AudioSession,
} from "deck-plugin-sdk/bridge";
import { listen } from "deck-plugin-sdk/event";

export interface SoundSettings {
  /** The system-wide microphone mute, as Deck writes chords ("ctrl+shift+m"). "" for none. */
  chord: string;
  /** A Windows notification when the shortcut mutes or unmutes, while Deck is not in front. */
  notify: boolean;
  /** The volume as a number beside the speaker; off, the icon alone. */
  showNumber: boolean;
  /** The microphone's own icon in the footer. */
  showMic: boolean;
  /** Percent one wheel notch over the speaker changes. */
  step: 1 | 2 | 5;
}
export const DEFAULTS: SoundSettings = { chord: "ctrl+shift+m", notify: true, showNumber: true, showMic: true, step: 2 };

/** One app in the mixer: every process of one program, set together. */
export interface App { name: string; pids: number[]; volume: number; muted: boolean; peak: number }

const CONFIG = "settings";
const SHORTCUT = "sound:mic";
/** How often the devices are read while Deck is on screen: often enough that a volume key or the
 *  Windows mixer shows here within a moment. */
// ponytail: polled; IAudioEndpointVolumeCallback would push changes instead, if this ever lags.
const POLL_MS = 1500;

let settings: SoundSettings = { ...DEFAULTS };
let devices: AudioDevice[] = [];
let apps: App[] = [];
let inPeak = 0;
/** Why the shortcut could not be taken, for the settings panel. */
let shortcutError = "";
let version = 0;
const subs = new Set<() => void>();
const emit = () => { version++; subs.forEach((f) => f()); };
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getVersion = () => version;
export const get = () => ({ settings, devices, apps, inPeak, shortcutError });

export const defaultOut = () => devices.find((d) => d.flow === "out" && d.default);
export const defaultIn = () => devices.find((d) => d.flow === "in" && d.default);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function readDevices() {
  try {
    const next = await audioDevices();
    if (!same(next, devices)) { devices = next; emit(); }
  } catch (e) { console.warn("[sound] reading the devices failed", e); }
}

async function readApps() {
  try {
    const list: AudioSession[] = await audioSessions();
    const by = new Map<string, App>();
    for (const s of list) {
      const a = by.get(s.name);
      if (a) { a.pids.push(s.pid); a.peak = Math.max(a.peak, s.peak); }
      else by.set(s.name, { name: s.name, pids: [s.pid], volume: s.volume, muted: s.muted, peak: s.peak });
    }
    // System sounds last; the rest by name, so rows do not jump about as levels change.
    const next = [...by.values()].sort((a, b) => (a.name === "System sounds" ? 1 : b.name === "System sounds" ? -1 : a.name.localeCompare(b.name)));
    if (!same(next, apps)) { apps = next; emit(); }
  } catch (e) { console.warn("[sound] reading the apps failed", e); }
}

// ---- the poll ----------------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | undefined;
let fast: ReturnType<typeof setInterval> | undefined;
let stopped = false;
const onVisible = () => { if (!document.hidden) void readDevices(); };

/** While the popover is open: the apps every second and the microphone's level five times one. */
export function watchPopover(open: boolean) {
  clearInterval(fast);
  fast = undefined;
  if (!open) return;
  void readApps();
  let n = 0;
  fast = setInterval(() => {
    const mic = defaultIn();
    if (mic) void audioPeak(mic.id).then((p) => { if (Math.abs(p - inPeak) > 0.01) { inPeak = p; emit(); } }, () => {});
    if (++n % 5 === 0) void readApps();
  }, 200);
}

// ---- changes -----------------------------------------------------------------------------------

/** Changes to one device's level, sent one at a time with only the newest waiting: a slider
 *  dragged fires dozens, and each would otherwise queue a call of its own. */
const sending = new Map<string, Promise<void>>();
const waiting = new Map<string, () => Promise<void>>();
function latest(key: string, send: () => Promise<void>) {
  if (sending.has(key)) { waiting.set(key, send); return; }
  const run = (f: () => Promise<void>): Promise<void> => {
    const p = f().catch((e) => console.warn("[sound] a change failed", e)).finally(() => {
      sending.delete(key);
      const next = waiting.get(key);
      if (next) { waiting.delete(key); sending.set(key, run(next)); }
    });
    return p;
  };
  sending.set(key, run(send));
}

const patchDevice = (id: string, p: Partial<AudioDevice>) => { devices = devices.map((d) => (d.id === id ? { ...d, ...p } : d)); emit(); };

export function setVolume(d: AudioDevice, level: number) {
  const v = Math.max(0, Math.min(1, level));
  // Moving the slider of a muted device unmutes it, as Windows' own does.
  patchDevice(d.id, { volume: v, muted: false });
  latest(d.id, async () => { await audioSetVolume(d.id, v); if (d.muted) await audioSetMute(d.id, false); });
}
export function setMuted(d: AudioDevice, muted: boolean) {
  patchDevice(d.id, { muted });
  void audioSetMute(d.id, muted).catch((e) => console.warn("[sound] mute failed", e));
}
export async function makeDefault(d: AudioDevice) {
  devices = devices.map((x) => (x.flow === d.flow ? { ...x, default: x.id === d.id, default_comms: x.id === d.id } : x));
  emit();
  await audioSetDefault(d.id).catch((e) => console.warn("[sound] setting the default failed", e));
  await readDevices();
  void readApps();
}
/** The default output's volume by wheel notches: one notch is `step` percent. */
export function nudge(notches: number) {
  const d = defaultOut();
  if (d) setVolume(d, Math.round((d.volume * 100 + notches * settings.step) / settings.step) * settings.step / 100);
}

const patchApp = (name: string, p: Partial<App>) => { apps = apps.map((a) => (a.name === name ? { ...a, ...p } : a)); emit(); };
export function setAppVolume(a: App, level: number) {
  const v = Math.max(0, Math.min(1, level));
  patchApp(a.name, { volume: v, muted: false });
  latest("app:" + a.name, async () => { for (const pid of a.pids) await audioSessionSet(pid, v, a.muted ? false : undefined); });
}
export function setAppMuted(a: App, muted: boolean) {
  patchApp(a.name, { muted });
  for (const pid of a.pids) void audioSessionSet(pid, undefined, muted).catch((e) => console.warn("[sound] app mute failed", e));
}

/** The microphone shortcut: mute or unmute the default input, read fresh (Deck may have been in
 *  the background, not polling). */
export async function toggleMic(fromShortcut = false) {
  await readDevices();
  const mic = defaultIn();
  if (!mic) return;
  const muted = !mic.muted;
  setMuted(mic, muted);
  // The footer says it either way; a notification only helps when Deck is not in front.
  if (fromShortcut && settings.notify && !document.hasFocus()) {
    void notifyOs(muted ? "Microphone muted" : "Microphone on", mic.name).catch(() => {});
  }
}

// ---- settings and the shortcut ----------------------------------------------------------------

async function holdShortcut() {
  shortcutError = "";
  try {
    if (settings.chord) await shortcutSet(SHORTCUT, settings.chord);
    else await shortcutClear(SHORTCUT);
  } catch (e) {
    shortcutError = String(e);
    console.warn("[sound] the microphone shortcut could not be taken", e);
  }
  emit();
}

export async function update(patch: Partial<SoundSettings>) {
  const chordChanged = patch.chord !== undefined && patch.chord !== settings.chord;
  settings = { ...settings, ...patch };
  emit();
  if (chordChanged) await holdShortcut();
  await configWrite(CONFIG, JSON.stringify(settings, null, 2)).catch((e) => console.warn("[sound] saving the settings failed", e));
}

async function load() {
  try {
    const t = await configRead(CONFIG);
    if (t.trim()) {
      const raw = JSON.parse(t) as Partial<SoundSettings>;
      settings = {
        chord: typeof raw.chord === "string" ? raw.chord : DEFAULTS.chord,
        notify: typeof raw.notify === "boolean" ? raw.notify : DEFAULTS.notify,
        showNumber: typeof raw.showNumber === "boolean" ? raw.showNumber : DEFAULTS.showNumber,
        showMic: typeof raw.showMic === "boolean" ? raw.showMic : DEFAULTS.showMic,
        step: raw.step === 1 || raw.step === 2 || raw.step === 5 ? raw.step : DEFAULTS.step,
      };
    }
  } catch (e) { console.warn("[sound] reading the settings failed", e); }
  emit();
}

const unlisten = listen<{ id: string }>("global-shortcut", (e) => { if (e.payload.id === SHORTCUT) void toggleMic(true); });

export function start() {
  void load().then(() => { if (!stopped) void holdShortcut(); });
  void readDevices();
  // Only while Deck is on screen (rule 11): the shortcut reads the devices itself when pressed.
  timer = setInterval(() => { if (!document.hidden) void readDevices(); }, POLL_MS);
  document.addEventListener("visibilitychange", onVisible);
}

export function stop() {
  stopped = true;
  clearInterval(timer);
  clearInterval(fast);
  document.removeEventListener("visibilitychange", onVisible);
  void unlisten.then((f) => f());
  void shortcutClear(SHORTCUT).catch(() => {});
}
