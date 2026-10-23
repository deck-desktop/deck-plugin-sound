# Sound

Your PC's sound from Deck's footer: the volume, which speakers and microphone are in use, each
app's own level, and a shortcut that mutes the microphone from any app.

## What it does

- **The speaker in the footer** shows the volume. Scroll on it to turn it up or down (1, 2 or 5%
  a notch, as you choose); click it for the rest.
- **Output and Input.** The device in use for each, with its level and a mute button. Click the
  device to pick another: it becomes the default for everything, calls included. The microphone
  has a live level meter, so you can see it hears you.
- **Apps.** Every app playing through your output, each with its own slider and mute: turn a
  call down without touching your music.
- **The microphone in the footer** shows when it is muted, and a click mutes or unmutes it.
- **A microphone mute shortcut** (Ctrl+Shift+M unless you change it) that works in every app,
  with Deck in the background. While Deck is not in front, a Windows notification says what it did.

Settings › Plugins › Sound has the shortcut, the scroll step, and whether the footer shows the
number and the microphone.

## What it needs

The `system` permission: it changes the PC's sound settings and holds a shortcut in every app.
Deck 1.11.0 or later, which has the sound and shortcut capabilities it uses.

## Developing

```sh
npm run dev            # rebuild as you edit; each save shows in your test Deck
npm run install-local  # when it is done: install it into your real Deck
```

`src/store.ts` holds the devices, the apps and the settings, and the shortcut; `src/plugin.tsx`
draws the footer readout, its popover and the settings panel.
