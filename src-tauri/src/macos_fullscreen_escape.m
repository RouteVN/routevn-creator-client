#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

// Clicking a native titlebar control can leave NSWindow as first responder.
// Route Escape back through WKWebView so the app's existing confirmation and
// editor/dialog handlers get the real keyboard event before AppKit exits.
void routevn_install_fullscreen_escape_focus_guard(void *windowPointer,
                                                  void *webViewPointer) {
  NSWindow *window = (__bridge NSWindow *)windowPointer;
  __weak NSWindow *weakWindow = window;
  __weak WKWebView *weakWebView = (__bridge WKWebView *)webViewPointer;
  NSEvent *(^handleEscape)(NSEvent *) = ^NSEvent *(NSEvent *event) {
    NSWindow *target = weakWindow;
    if (!target || event.window != target || event.keyCode != 53 ||
        !(target.styleMask & NSWindowStyleMaskFullScreen) ||
        target.attachedSheet ||
        (target.firstResponder && target.firstResponder != target)) {
      return event;
    }
    WKWebView *webView = weakWebView;
    if (webView) {
      [target makeFirstResponder:webView];
    }
    return event;
  };
  id monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
                                                   handler:handleEscape];
  __block id observer;
  observer = [[NSNotificationCenter defaultCenter]
      addObserverForName:NSWindowWillCloseNotification
                  object:window
                   queue:nil
              usingBlock:^(NSNotification *notification) {
                (void)notification;
                [NSEvent removeMonitor:monitor];
                [[NSNotificationCenter defaultCenter] removeObserver:observer];
                observer = nil;
              }];
}
