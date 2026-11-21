# Windows Application Audio Capture

This document explains why the Windows desktop app and exported Windows players
pass a WebView2 browser argument that moves audio playback into the main
WebView2 process.

## Problem

Screen-sharing tools can capture one application window together with its
sound. Discord's application share is the case this was found and verified
with. Sharing RouteVN Creator or an exported Windows player this way sent the
picture but no sound, while sharing the full screen sent both.

The cause is the WebView2 process layout. The window belongs to the app
executable, but the sound does not come from it:

```text
app.exe                              owns the window
└─ msedgewebview2.exe                WebView2 browser process
   ├─ msedgewebview2.exe             renderer
   ├─ msedgewebview2.exe             GPU process
   └─ msedgewebview2.exe             audio service: plays the sound
```

Chromium runs audio in a dedicated utility process
(`audio.mojom.AudioService`). That process is a grandchild of the app
executable. Application capture followed the window's process and its direct
child, and did not reach the grandchild, so the shared stream was silent.

## Fix

Every Windows window is created with this WebView2 browser argument:

```text
--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,AudioServiceOutOfProcess
```

Disabling the Chromium feature `AudioServiceOutOfProcess` makes the WebView2
browser process play the audio itself. That process is a direct child of the
app executable, and application capture includes it.

The other three entries are the defaults that Tauri passes on its own. Setting
`additionalBrowserArgs` replaces Tauri's default argument string instead of
adding to it, so the defaults are repeated to keep the previous behavior.

The argument is set in three places, and they must stay the same:

| Location | Applies to |
| --- | --- |
| `src-tauri/tauri.windows.conf.json` | RouteVN Creator on Windows |
| `crates/routevn-packager/tauri-shell/src-tauri/tauri.conf.json` | The prebuilt Windows player template used by Creator exports |
| `WINDOWS_BROWSER_ARGS` in `crates/routevn-packager/src/tauri.rs` | Players built from source by the packager, whose generated config replaces the shell's window list |

`additionalBrowserArgs` is a Windows-only option. Other platforms ignore it.

A change to the shell config only reaches exported games after the checked-in
template is rebuilt with `bun run player-template:build:win:docker`. Games
exported before the rebuild keep the old behavior until they are exported
again.

## Trade-offs

- `AudioServiceOutOfProcess` is an internal Chromium feature switch, not a
  documented WebView2 setting. The WebView2 runtime updates itself on user
  machines, so a future runtime can remove the switch. If that happens the
  window still works and plays sound; only application capture goes silent
  again.
- Audio shares the WebView2 browser process. A crash or hang in audio playback
  affects the whole webview instead of only the sound.

## Verifying

The process layout can be checked without a screen-sharing tool. With the
argument applied, the app's WebView2 process tree has no process whose command
line contains `--utility-sub-type=audio.mojom.AudioService`, and while sound is
playing the active Windows audio session belongs to the WebView2 browser
process, the direct child of the app executable.

For a one-off check of an existing build, the same argument can be supplied
through the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` environment variable
before starting the app.

The end-to-end check is to share the app window as an application in a call
and confirm that a viewer hears the sound.

If application capture goes silent again after a WebView2 runtime update,
check the process tree first. If the audio service process is back, the switch
was removed, and the remaining option is to play audio from the app executable
itself through a native audio backend.
