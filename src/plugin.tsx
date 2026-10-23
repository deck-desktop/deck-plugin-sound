// Sound — the PC's volume, devices and apps, from Deck's footer.
//
// No tab: a footer readout (the speaker, and the microphone beside it) whose popover holds the
// output and input devices with their levels and the apps playing sound, a settings panel, and a
// microphone mute shortcut that works in every app. Deck's sound capability does the work
// (audioDevices and the rest, Core Audio underneath); this is the UI and the settings.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, GripVertical, Headphones, Mic, MicOff, Settings2, Volume1, Volume2, VolumeX } from "lucide-react";
import { PanelHead, Row, Segmented, StatusItem, StatusPopover, tone } from "deck-plugin-sdk/ui";
import type { AudioDevice } from "deck-plugin-sdk/bridge";
import {
  defaultIn, defaultOut, get, getVersion, makeDefault, nudge, ordered, setAppMuted, setAppVolume, setMuted, setVolume,
  start, stop, subscribe, toggleMic, update, watchPopover, type App,
} from "./store";

start();
/** Called by Deck before a reload re-imports this plugin: the poll, the listener and the shortcut go. */
export const dispose = stop;

const RED = tone("red");
const pct = (v: number) => Math.round(v * 100);
/** "Speakers (Logitech PRO X Wireless Gaming Headset)" -> "Logitech PRO X Wireless Gaming Headset":
 *  Windows calls nearly every output "Speakers", so the part in brackets is what tells them apart. */
const short = (name: string) => split(name)[1];
/** The part before the brackets ("Speakers", "Microphone Array"): what kind of device it is. */
const kind = (name: string) => split(name)[0];
/** A device as the popover names it: the name chosen in Settings, else the part in brackets. */
const nameOf = (d: AudioDevice) => get().settings.names[d.id]?.trim() || short(d.name);
/** A name as [kind, device] at its last bracket group, which may hold brackets of its own:
 *  "Speakers (Realtek(R) Audio)" is ["Speakers", "Realtek(R) Audio"]. No group: ["", name]. */
function split(name: string): [string, string] {
  const n = name.trimEnd();
  if (!n.endsWith(")")) return ["", name];
  let depth = 0;
  for (let i = n.length - 1; i >= 0; i--) {
    if (n[i] === ")") depth++;
    else if (n[i] === "(" && --depth === 0) return i > 0 ? [n.slice(0, i).trim(), n.slice(i + 1, -1)] : ["", name];
  }
  return ["", name];
}
/** "ctrl+shift+m" as people write it: "Ctrl+Shift+M". */
const chordLabel = (c: string) => c.split("+").map((p) => (p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join("+");

function useSound() {
  useSyncExternalStore(subscribe, getVersion);
  return get();
}

/** The footer: the speaker (click for the popover, wheel for the volume) and the microphone. */
export function Status() {
  const { settings } = useSound();
  const [open, setOpen] = useState(false);
  useEffect(() => { watchPopover(open); return () => watchPopover(false); }, [open]);
  const out = defaultOut(), mic = defaultIn();
  const silent = !out || out.muted || out.volume === 0;
  const Icon = silent ? VolumeX : out.volume < 0.5 ? Volume1 : Volume2;
  const label = !out ? "No output" : settings.showNumber ? (out.muted ? "Muted" : `${pct(out.volume)}%`) : "";

  // The speaker and the microphone are one item, and the popover opens over both: anchored to the
  // pair's edge, it stays put when either one's label changes ("Muted").
  return (
    <StatusPopover open={open} onToggle={() => setOpen((v) => !v)} onClose={() => setOpen(false)} width="w-[360px]"
      item={
        <div className={"flex items-center rounded-[4px]" + (open ? " bg-white/[0.08]" : "")}>
          {/* The wheel over the speaker itself. */}
          <span onWheel={(e) => { if (e.deltaY) nudge(e.deltaY < 0 ? 1 : -1); }}>
            <StatusItem icon={<Icon />} color={out?.muted ? RED : "var(--text-secondary)"} label={label}
              title={out ? `${out.name}: ${out.muted ? "muted" : `${pct(out.volume)}%`}. Scroll to change the volume` : "No output device"} />
          </span>
          {settings.showMic && mic && (
            // A click on the microphone mutes it rather than opening the popover.
            <span onClick={(e) => e.stopPropagation()}>
              <StatusItem icon={mic.muted ? <MicOff /> : <Mic />} color={mic.muted ? RED : "var(--text-secondary)"}
                label={mic.muted ? "Muted" : ""}
                title={`${mic.name}: ${mic.muted ? "muted" : "on"}. Click to ${mic.muted ? "unmute" : "mute"}${settings.chord ? ` (${chordLabel(settings.chord)})` : ""}`}
                onClick={() => void toggleMic()} />
            </span>
          )}
        </div>
      }>
      <Panel />
    </StatusPopover>
  );
}

function Panel() {
  const { devices, apps, inPeak, settings } = useSound();
  return (
    <div className="pb-1">
      <style>{LEVEL_CSS}</style>
      <div className="relative">
        <PanelHead label="Sound" />
        <button onClick={() => window.dispatchEvent(new CustomEvent("deck-navigate", { detail: "settings:plugin:sound" }))}
          title="Sound settings" aria-label="Sound settings"
          className="absolute right-2 top-2 grid size-6 place-items-center rounded text-text-muted transition-colors hover:bg-white/10 hover:text-text-primary">
          <Settings2 size={13} />
        </button>
      </div>
      <Section title="Output" list={devices.filter((d) => d.flow === "out")} icon={<Headphones size={14} />} />
      <Section title="Input" list={devices.filter((d) => d.flow === "in")} icon={<Mic size={14} />} peak={inPeak} />
      {apps.length > 0 && (
        <div className="mt-1 border-t border-subtle px-3.5 pb-1 pt-1.5">
          {apps.map((a) => <AppRow key={a.name} a={a} />)}
        </div>
      )}
      <p className="mt-1.5 truncate border-t border-subtle px-3.5 pb-1 pt-2 text-[11px] text-text-muted">
        Scroll the speaker for volume.
        {settings.chord && <> <span className="font-mono text-text-secondary">{chordLabel(settings.chord)}</span> mutes the mic.</>}
      </p>
    </div>
  );
}

/** One direction: the default device (a click lists the others), its mute and its level. */
function Section({ title, list, icon, peak }: { title: string; list: AudioDevice[]; icon: React.ReactNode; peak?: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // A click anywhere else closes the list (Escape closes the whole popover).
  useEffect(() => {
    if (!open) return;
    const doc = box.current?.ownerDocument ?? document;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    doc.addEventListener("mousedown", onDown);
    return () => doc.removeEventListener("mousedown", onDown);
  }, [open]);
  const d = list.find((x) => x.default);
  const what = title.toLowerCase();
  // The list leaves out the devices hidden in Settings, unless one is the one in use.
  const { hidden } = get().settings;
  const choices = ordered(list).filter((x) => x.default || !hidden.includes(x.id));
  const MuteIcon = title === "Input" ? (d?.muted ? MicOff : Mic) : d?.muted ? VolumeX : Volume2;
  return (
    <div className="flex flex-col gap-1.5 px-3.5 pb-2.5 pt-1">
      <span className="text-[12px] font-medium text-text-secondary">{title}</span>
      <div ref={box} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="listbox" disabled={!list.length}
        className="flex h-8 w-full items-center gap-2 rounded-lg border bg-elev px-2.5 text-left text-[12.5px] text-text-secondary transition-colors hover:border-strong hover:text-text-primary"
        style={{ borderColor: open ? "var(--accent)" : "var(--border-subtle)" }}>
        <span className="shrink-0 text-text-muted">{icon}</span>
        <span className="min-w-0 flex-1 truncate" title={d?.name}>{d ? nameOf(d) : list.length ? "None chosen" : `No ${what} device`}</span>
        <ChevronDown size={13} className="shrink-0 text-text-muted transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
      {open && (
        <div role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 flex flex-col gap-px rounded-[10px] border border-subtle bg-card p-1 shadow-2xl animate-[menu-in_110ms_ease-out]">
          {choices.map((x) => (
            <button key={x.id} role="option" aria-selected={x.default} onClick={() => { setOpen(false); if (!x.default) void makeDefault(x); }}
              className="flex h-[30px] items-center gap-2 rounded-[6px] px-2 text-left text-[12.5px] transition-colors hover:bg-white/5"
              style={x.default ? { background: "var(--accent-soft)", color: "var(--text-primary)" } : { color: "var(--text-secondary)" }}>
              <span className="min-w-0 flex-1 truncate" title={x.name}>{nameOf(x)}</span>
              <span className="shrink-0 text-[11px] text-text-muted">{kind(x.name)}</span>
              {/* A slot whether ticked or not, so the types line up. */}
              <span className="grid w-[13px] shrink-0 place-items-center">{x.default && <Check size={13} />}</span>
            </button>
          ))}
        </div>
      )}
      </div>
      {d && (
        <div className="flex h-7 items-center gap-2">
          <button onClick={() => setMuted(d, !d.muted)} title={d.muted ? `Unmute ${what}` : `Mute ${what}`}
            aria-label={d.muted ? `Unmute ${what}` : `Mute ${what}`} aria-pressed={d.muted}
            className="grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10"
            style={d.muted ? { color: RED, background: `color-mix(in srgb, ${RED} 14%, transparent)` } : { color: "var(--text-secondary)" }}>
            <MuteIcon size={15} />
          </button>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <Level value={d.volume} muted={d.muted} label={`${title} volume`} onChange={(v) => setVolume(d, v)} />
            {peak !== undefined && (
              <span className="block h-[3px] overflow-hidden rounded-full bg-elev" role="img" aria-label="Microphone level">
                <span className="block h-full rounded-full transition-[width] duration-150" style={{ width: `${d.muted ? 0 : Math.min(100, peak * 140)}%`, background: tone("emerald") }} />
              </span>
            )}
          </div>
          <span className="w-9 shrink-0 text-right font-mono text-[11px] text-text-secondary">{pct(d.volume)}%</span>
        </div>
      )}
    </div>
  );
}

function AppRow({ a }: { a: App }) {
  return (
    <div className="flex h-7 items-center gap-2">
      {/* The app's own icon is its mute: a click mutes it, and a muted one carries a small badge in
          its corner. The button is the size of the device rows' mute, so every slider lines up. */}
      <button onClick={() => setAppMuted(a, !a.muted)} title={a.muted ? `${a.name}: muted. Click to unmute` : `${a.name}. Click to mute`}
        aria-label={a.muted ? `Unmute ${a.name}` : `Mute ${a.name}`} aria-pressed={a.muted}
        className="relative grid size-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-white/10">
        {a.icon
          ? <img src={a.icon} alt="" className="size-[18px]" draggable={false} style={{ opacity: a.muted ? 0.45 : 1 }} />
          : <span className="grid size-[18px] place-items-center rounded-[5px] bg-elev text-[10px] font-semibold text-text-secondary" style={{ opacity: a.muted ? 0.45 : 1 }}>{a.name[0]?.toUpperCase()}</span>}
        {a.muted && (
          <span className="absolute bottom-0.5 right-0.5 grid size-3 place-items-center rounded-full" style={{ background: RED, color: "#fff" }}>
            <VolumeX size={8} strokeWidth={3} />
          </span>
        )}
      </button>
      <Level value={a.volume} muted={a.muted} label={`${a.name} volume`} onChange={(v) => setAppVolume(a, v)} />
      <span className="w-9 shrink-0 text-right font-mono text-[11px] text-text-secondary">{pct(a.volume)}%</span>
    </div>
  );
}

/** The slider's look: a thin track filled in the accent up to the value, a small white thumb. A
 *  stylesheet of the plugin's own rather than Tailwind classes, which only exist in a Deck built
 *  after they were written. */
const LEVEL_CSS = `
.snd-level{-webkit-appearance:none;appearance:none;height:12px;margin:0;cursor:pointer;outline:none;background:transparent}
.snd-level::-webkit-slider-runnable-track{height:4px;border-radius:999px;
  background:linear-gradient(to right,var(--accent) var(--fill),rgb(var(--overlay-rgb) / .12) var(--fill))}
.snd-level::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;margin-top:-4px;border-radius:50%;
  background:#f8fafc;box-shadow:0 0 0 3px rgb(0 0 0 / .35);transition:transform .1s}
.snd-level:hover::-webkit-slider-thumb{transform:scale(1.15)}
.snd-level:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 3px var(--accent)}`;

/** A level slider, 0 to 100, in the accent; dimmed while muted. */
function Level({ value, muted, label, onChange }: { value: number; muted: boolean; label: string; onChange: (v: number) => void }) {
  return (
    <input type="range" min={0} max={100} value={pct(value)} aria-label={label}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      // The wheel over a slider moves that slider, by the same step as over the speaker.
      onWheel={(e) => {
        if (!e.deltaY) return;
        const step = get().settings.step;
        onChange((Math.round(pct(value) / step) * step + (e.deltaY < 0 ? step : -step)) / 100);
      }}
      className="snd-level min-w-0 flex-1" style={{ ["--fill" as string]: `${pct(value)}%`, opacity: muted ? 0.4 : 1 }} />
  );
}

/** The settings panel, in this plugin's row in Settings › Plugins. */
export function Settings() {
  const { settings, shortcutError } = useSound();
  const [recording, setRecording] = useState(false);

  // While recording, the next chord with Ctrl or Alt is the shortcut; Escape cancels. Taken in the
  // capture phase, before Deck's own keys see it.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRecording(false); return; }
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      if (!e.ctrlKey && !e.altKey) return;   // without Ctrl or Alt it would be typed into every app
      const key = e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : e.code.startsWith("Digit") ? e.code.slice(5) : e.key.toLowerCase();
      const chord = [e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && "shift", key].filter(Boolean).join("+");
      setRecording(false);
      void update({ chord });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  const secondary = "h-8 rounded-lg border border-subtle bg-elev px-3 text-[12px] text-text-secondary transition-colors hover:border-strong hover:text-text-primary";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-text-primary">Microphone mute shortcut</div>
          <div className="text-[11.5px] text-text-muted">Works in every app, with Deck in the background too.</div>
          {shortcutError && <div className="mt-0.5 text-[11.5px]" style={{ color: RED }}>{shortcutError}</div>}
        </div>
        <span className="inline-flex h-8 items-center rounded-lg border bg-elev px-3 font-mono text-[11.5px] text-text-primary"
          style={{ borderColor: recording ? "var(--accent)" : "var(--border-subtle)" }}>
          {recording ? "Press a shortcut…" : settings.chord ? chordLabel(settings.chord) : "None"}
        </span>
        <button onClick={() => setRecording((v) => !v)} className={secondary}>{recording ? "Cancel" : "Change"}</button>
        {settings.chord && !recording && <button onClick={() => void update({ chord: "" })} className={secondary}>Remove</button>}
      </div>
      <Row title="Say when the shortcut mutes it" desc="A Windows notification while Deck is not in front. The footer shows it either way."
        on={settings.notify} onChange={(v) => void update({ notify: v })} />
      <Row title="Show the volume as a number" desc="Off, the speaker icon alone."
        on={settings.showNumber} onChange={(v) => void update({ showNumber: v })} />
      <Row title="Show the microphone" desc="Its own icon beside the speaker; a click mutes it."
        on={settings.showMic} onChange={(v) => void update({ showMic: v })} />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-text-primary">Scroll step</div>
          <div className="text-[11.5px] text-text-muted">How much one notch of the wheel over the speaker changes.</div>
        </div>
        <Segmented value={String(settings.step)} onChange={(v) => void update({ step: Number(v) as 1 | 2 | 5 })}
          options={[{ value: "1", label: "1%" }, { value: "2", label: "2%" }, { value: "5", label: "5%" }]} layoutId="sound-step" />
      </div>
      <p className="text-[11px] text-text-muted">Picking a device in the footer makes it the default for everything, calls included.</p>
      <Devices />
    </div>
  );
}

/** Each device: a name of your own for it, whether the footer's list offers it, and where in that
 *  list it comes (dragged by its handle). */
function Devices() {
  const { devices, settings } = useSound();
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  /** `id` moved to where `over` is, within its own direction; the rest keep their order. */
  const drop = (flow: "out" | "in", id: string, over: string) => {
    if (id === over) return;
    const ids = ordered(devices.filter((d) => d.flow === flow)).map((d) => d.id).filter((x) => x !== id);
    ids.splice(ids.indexOf(over) + (ordered(devices).findIndex((d) => d.id === id) < ordered(devices).findIndex((d) => d.id === over) ? 1 : 0), 0, id);
    const other = settings.order.filter((x) => !ids.includes(x));
    void update({ order: [...other, ...ids] });
  };
  return (
    <div className="space-y-3 border-t border-subtle pt-3">
      <div>
        <div className="text-[12.5px] text-text-primary">Devices</div>
        <div className="text-[11.5px] text-text-muted">Name a device your way, switch it off to leave it out of the list (the one in use always shows), or drag it into your own order.</div>
      </div>
      {(["out", "in"] as const).map((flow) => {
        const list = ordered(devices.filter((d) => d.flow === flow));
        return list.length > 0 && (
          <div key={flow} className="space-y-1.5">
            <div className="text-[12px] font-medium text-text-secondary">{flow === "out" ? "Output" : "Input"}</div>
            {list.map((d) => (
              <div key={d.id}
                onDragOver={(e) => { if (drag && list.some((x) => x.id === drag.id)) { e.preventDefault(); if (drag.over !== d.id) setDrag({ ...drag, over: d.id }); } }}
                onDrop={(e) => { e.preventDefault(); if (drag) drop(flow, drag.id, d.id); setDrag(null); }}
                className="rounded-lg transition-shadow"
                style={drag?.over === d.id && drag.id !== d.id ? { boxShadow: "0 0 0 1px var(--accent)" } : undefined}>
                <DeviceRow d={d} dragging={drag?.id === d.id}
                  onDragStart={() => setDrag({ id: d.id, over: null })} onDragEnd={() => setDrag(null)} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DeviceRow({ d, dragging, onDragStart, onDragEnd }: { d: AudioDevice; dragging: boolean; onDragStart: () => void; onDragEnd: () => void }) {
  const { settings } = useSound();
  // Typed into here, saved when the field is left or Enter is pressed: a save per keystroke would
  // write the settings file for every letter.
  const [name, setName] = useState(settings.names[d.id] ?? "");
  const save = () => {
    const names = { ...settings.names };
    if (name.trim()) names[d.id] = name.trim(); else delete names[d.id];
    if ((settings.names[d.id] ?? "") !== (names[d.id] ?? "")) void update({ names });
  };
  const shown = !settings.hidden.includes(d.id);
  const [hover, setHover] = useState(false);
  const toggle =() => void update({ hidden: shown ? [...settings.hidden, d.id] : settings.hidden.filter((x) => x !== d.id) });
  return (
    <div className="flex items-center gap-1.5" title={d.name} style={{ opacity: dragging ? 0.4 : 1 }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }} onDragEnd={onDragEnd}
        title="Drag to reorder" aria-hidden className="grid h-8 w-4 shrink-0 cursor-grab place-items-center text-text-muted hover:text-text-primary">
        <GripVertical size={13} />
      </span>
      {/* One field: the name, then the device's type and its switch inside it. */}
      <div className="flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-subtle bg-elev pl-2.5 pr-2 transition-colors focus-within:border-[var(--accent)]">
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder={short(d.name)} aria-label={`Name for ${d.name}`} spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-text-primary outline-none placeholder:text-text-muted"
          style={{ opacity: shown ? 1 : 0.5 }} />
        {/* Its type, and the way to use it: "Use" under the pointer, as picking it in the popover does. */}
        {d.default
          ? <span className="shrink-0 text-[11px] font-medium" style={{ color: "var(--accent)" }}>In use</span>
          : <button onClick={() => void makeDefault(d)} title={`Use ${d.name} for apps and calls`}
              className="shrink-0 rounded px-1 text-[11px] transition-colors hover:bg-white/10"
              style={{ color: hover ? "var(--accent)" : "var(--text-muted)" }}>
              {hover ? "Use" : kind(d.name)}
            </button>}
        <button role="switch" aria-checked={shown} aria-label={shown ? `Leave ${d.name} out of the list` : `Show ${d.name} in the list`}
          title={shown ? "Shown in the list" : "Left out of the list"} onClick={toggle}
          className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
          style={{ background: shown ? "var(--accent)" : "rgb(var(--overlay-rgb) / 0.2)" }}>
          <span className="absolute top-0.5 size-3 rounded-full bg-white transition-[left] duration-150" style={{ left: shown ? 14 : 2 }} />
        </button>
      </div>
    </div>
  );
}

/** Command palette entries. */
export function commands() {
  return [
    { id: "mic", title: "Sound: mute or unmute the microphone", run: () => void toggleMic() },
    { id: "mute", title: "Sound: mute or unmute the output", run: () => { const d = defaultOut(); if (d) setMuted(d, !d.muted); } },
  ];
}
