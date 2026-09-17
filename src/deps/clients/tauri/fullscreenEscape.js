import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  concatMap,
  filter,
  fromEvent,
  map,
  Subscription,
  tap,
  timer,
} from "rxjs";

const CONFIRMATION_MS = 1500;
const OPEN_DIALOG_SELECTOR = "dialog[open], rtgl-dialog[open]";

export const createFullscreenEscapeClient = ({
  appWindow = getCurrentWindow(),
  target = window,
  now = () => performance.now(),
} = {}) => ({
  subscribe({ onArmed, onError }) {
    // Windows' standalone custom chrome already owns this shortcut. Native
    // titlebar platforms (including macOS) do not expose the global Tauri API.
    if (target.__TAURI__?.window?.getCurrentWindow) {
      return () => {};
    }

    const subscriptions = new Subscription();
    const handledEscapes = new WeakSet();
    const dialogEscapes = new WeakSet();
    let generation = 0;
    let lastEscapeAt;
    let lastKeyEvent;
    let exitPending = false;
    const reset = () => {
      generation += 1;
      lastEscapeAt = undefined;
    };

    subscriptions.add(
      fromEvent(target, "keydown", { capture: true }).subscribe((event) => {
        if (
          lastKeyEvent?.key === "Escape" &&
          !handledEscapes.has(lastKeyEvent)
        ) {
          reset();
        }
        lastKeyEvent = event;
        if (event.key !== "Escape") {
          reset();
          return;
        }
        // A dialog may close before the key reaches the bubble listener.
        if (
          event
            .composedPath()
            .some((node) => node.matches?.(OPEN_DIALOG_SELECTOR))
        ) {
          dialogEscapes.add(event);
          reset();
        }
        // Editors can stop propagation. Their Escape must break an existing
        // confirmation pair even when it never reaches our bubble listener.
        subscriptions.add(
          timer(0).subscribe(() => {
            if (lastKeyEvent === event && !handledEscapes.has(event)) reset();
          }),
        );
      }),
    );
    for (const type of ["blur", "resize", "pointerdown", "cancel"]) {
      subscriptions.add(
        fromEvent(target, type, { capture: true }).subscribe(reset),
      );
    }
    subscriptions.add(
      fromEvent(target, "keydown")
        .pipe(
          filter((event) => event.key === "Escape"),
          filter(
            (event) =>
              !event.defaultPrevented &&
              !dialogEscapes.has(event) &&
              !event.isComposing &&
              event.keyCode !== 229 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey &&
              !event.shiftKey &&
              !event
                .composedPath()
                .some((node) => node.matches?.(OPEN_DIALOG_SELECTOR)),
          ),
          tap((event) => {
            // Cancel AppKit's native fullscreen exit synchronously, before
            // querying Tauri. Awaiting the query first is too late.
            event.preventDefault();
            handledEscapes.add(event);
          }),
          filter((event) => !event.repeat && !exitPending),
          map(() => ({ pressedAt: now(), generation })),
          concatMap(async (press) => {
            if (press.generation !== generation) return;
            try {
              const fullscreen = await appWindow.isFullscreen();
              if (press.generation !== generation) return;
              if (!fullscreen) {
                lastEscapeAt = undefined;
                return;
              }
              if (
                lastEscapeAt === undefined ||
                press.pressedAt - lastEscapeAt > CONFIRMATION_MS
              ) {
                lastEscapeAt = press.pressedAt;
                onArmed();
                return;
              }
              reset();
              exitPending = true;
              await appWindow.setFullscreen(false);
            } catch (error) {
              if (subscriptions.closed) return;
              reset();
              onError(error);
            } finally {
              exitPending = false;
            }
          }),
        )
        .subscribe(),
    );
    return () => {
      reset();
      subscriptions.unsubscribe();
    };
  },
});
