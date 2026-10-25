# Overlayy

A small always-on-top window for viewing a **PDF or image** that stays **hidden from screen recording and screen sharing**. You can see it on your monitor, but OBS, Zoom, Teams, Meet, and other capture tools don't.

## Features

- Open PDFs (all pages, scrollable) and images (PNG, JPG, GIF, WebP, BMP, SVG, AVIF)
- **Drag**: grab the toolbar to move the window
- **Resize**: drag any window edge, or the grip in the bottom-right corner
- **Opacity**: use the slider in the toolbar (10–100%)
- Zoom and fit-to-width, plus page navigation for PDFs
- Click-through mode, so you can use the apps underneath while the overlay stays visible
- Stays on top of fullscreen apps and isn't shown in the taskbar

## Run it

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install
npm start
```

To build a standalone app (a portable `.exe` on Windows, a `.dmg` on macOS, an AppImage on Linux), run:

```bash
npm run dist
```

The output goes to `dist/`.

## Controls

| Action | How |
| --- | --- |
| Open a file | **Open** button, `Ctrl+O`, or drag and drop a file onto the window |
| Move | Drag the toolbar |
| Resize | Drag a window edge or the bottom-right grip |
| Opacity | Toolbar slider, or `Ctrl+Alt+[` / `Ctrl+Alt+]` |
| Zoom | `−` / `+` buttons, `Ctrl+-` / `Ctrl+=`, or `Ctrl`+mouse wheel |
| Fit to width | Click the `%` button, or `Ctrl+0` |
| Next/previous PDF page | `‹` / `›` buttons, or `PageUp` / `PageDown` |
| Show/hide overlay | `Ctrl+Alt+O` (works from any app) |
| Toggle click-through | `Ctrl+Alt+L` (works from any app) |
| Quit | `×` button, or `Ctrl+Alt+Q` |

On macOS, use `Cmd` in place of `Ctrl`.

The overlay doesn't appear in the taskbar. After you hide it with `–`, bring it back with `Ctrl+Alt+O`.

## How the hiding works

The window calls Electron's [`setContentProtection(true)`](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows):

- **Windows** uses `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`. On Windows 10 version 2004 or later, the window is left out of captures entirely. Older versions show a black box in its place.
- **macOS** sets `NSWindow.sharingType = .none`. Some newer recorders built on ScreenCaptureKit, on recent macOS versions, may not respect this.
- **Linux** has no system support for this, so the window **will** show up in recordings. Opacity also may not work on Linux.

**Always test with the exact recorder or meeting app you plan to use before you rely on it.** A phone camera pointed at your screen will still see the overlay.

The file-open dialog is a normal system window, so it *does* show up in recordings. To keep everything hidden, drag and drop the file onto the overlay instead.
