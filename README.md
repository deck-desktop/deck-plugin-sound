# Sound for Deck

Your PC's sound from Deck's footer: the volume, which speakers and microphone are in use, each
app's own level, and a shortcut that mutes the microphone from any app. It adds a speaker (and a
microphone) to the footer; there is no tab to open.

## What it does

- **The speaker in the footer** shows the volume. Scroll on it to turn it up or down (1, 2 or 5%
  a notch, as you choose); click it for the rest.
- **Output and Input.** The device in use for each, with its level and a mute button. Click the
  device to pick another: it becomes the default for everything, calls included. The microphone
  has a live level meter, so you can see it hears you.
- **Apps.** Every app playing through your output, with its icon, its own slider and a mute
  button: turn a call down without touching your music.
- **The microphone in the footer** shows when it is muted, and a click mutes or unmutes it.
- **A microphone mute shortcut** (Ctrl+Shift+M unless you change it) that works in every app,
  with Deck in the background. While Deck is not in front, a Windows notification says what it did.

## Settings

Settings > Plugins > Sound, also reached from the gear in the footer popover:

- the microphone shortcut, and whether it shows a Windows notification;
- the scroll step, and whether the footer shows the volume as a number and the microphone icon;
- **Devices**: give a device your own name, switch one off to leave it out of the lists (the one
  in use always shows), or drag them into your own order.

Settings are kept in `data\sound\settings.json` in Deck's config folder.

Needs the `system` permission: it changes the PC's sound settings and holds a shortcut in every
app.
