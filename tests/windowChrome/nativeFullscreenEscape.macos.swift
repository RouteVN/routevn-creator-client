// Native regression: node tests/windowChrome/nativeFullscreenEscape.macos.mjs
// Runs the production JS client inside a real fullscreen AppKit/WKWebView window.
import AppKit
import WebKit

@_silgen_name("routevn_install_fullscreen_escape_focus_guard")
func installNativeGuard(_ window: UnsafeMutableRawPointer, _ webView: UnsafeMutableRawPointer)

final class Probe: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate,
  WKScriptMessageHandler
{
  var window: NSWindow!
  var web: WKWebView!
  let scenario = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "web-focus"
  var loaded = false
  var entering = false
  var sentSecondEscape = false
  var confirmedExitRequests = 0
  func applicationDidFinishLaunching(_ notification: Notification) {
    window = NSWindow(
      contentRect: NSRect(x: 100, y: 100, width: 700, height: 450),
      styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false
    )
    window.title = "Fullscreen keyboard test"
    window.delegate = self
    window.collectionBehavior = [.fullScreenPrimary]
    let config = WKWebViewConfiguration()
    config.userContentController.add(self, name: "nativeWindow")
    web = WKWebView(frame: window.contentView!.bounds, configuration: config)
    web.autoresizingMask = [.width, .height]
    web.navigationDelegate = self
    window.contentView = web
    installNativeGuard(
      Unmanaged.passUnretained(window).toOpaque(), Unmanaged.passUnretained(web).toOpaque())
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    let bundle = try! String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
    let script = """
      window.events=[];window.nativeReplies={};let requestId=0;
      const request=(command,value)=>new Promise(resolve=>{const id=++requestId; nativeReplies[id]=result=>{delete nativeReplies[id]; resolve(result);};window.webkit.messageHandlers.nativeWindow.postMessage({command,value,id});});
      window.cleanup=FullscreenEscape.createFullscreenEscapeClient({appWindow:{isFullscreen:()=>request('isFullscreen'),setFullscreen:value=>request('setFullscreen',value)}}).subscribe({onArmed:()=>{events.push('armed');},onError:e=>{events.push(String(e));}});
      window.addEventListener('keydown',event=>events.push({key:event.key,prevented:event.defaultPrevented}));
      """
    web.loadHTMLString(
      "<body><h1>Fullscreen keyboard test</h1><script>" + bundle + script + "</script>",
      baseURL: nil)
    DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
      print(
        "Native fullscreen test did not finish; loaded", self.loaded, "key",
        self.window.isKeyWindow, "entering", self.entering, "fullscreen",
        self.window.styleMask.contains(.fullScreen))
      exit(1)
    }
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    loaded = true
    enterWhenReady()
  }
  func windowDidBecomeKey(_ notification: Notification) {
    enterWhenReady()
  }
  func applicationDidBecomeActive(_ notification: Notification) {
    enterWhenReady()
  }
  func enterWhenReady() {
    guard loaded && NSApp.isActive && window.isKeyWindow && !entering else { return }
    entering = true
    window.makeFirstResponder(web)
    // Start after the key/activation delegate returns to AppKit's run loop.
    DispatchQueue.main.async {
      self.window.toggleFullScreen(nil)
    }
  }
  func windowDidFailToEnterFullScreen(_ window: NSWindow) {
    print("Native test window could not enter fullscreen.")
    exit(1)
  }
  func windowDidEnterFullScreen(_ notification: Notification) {
    // Let WKWebView receive the completed fullscreen resize/focus notifications
    // before starting the key pair. Their resets are part of the real contract.
    web.evaluateJavaScript(
      "requestAnimationFrame(() => requestAnimationFrame(() => window.webkit.messageHandlers.nativeWindow.postMessage({command:'ready'})))"
    )
  }
  func startScenario() {
    if scenario == "window-focus" {
      window.makeFirstResponder(window)
      pressEscape()
    } else {
      window.makeFirstResponder(web)
      pressEscape()
    }
  }
  func windowDidExitFullScreen(_ notification: Notification) {
    guard sentSecondEscape && confirmedExitRequests == 1 else {
      print("Fullscreen exited without a confirmed second Escape.")
      exit(1)
    }
    print("after second Escape", window.styleMask.contains(.fullScreen))
    if window.styleMask.contains(.fullScreen) { exit(1) }
    web.evaluateJavaScript("JSON.stringify(events)") { result, error in
      print("events", result ?? "nil", error as Any)
      if error != nil { exit(1) }
      NSApp.terminate(nil)
    }
  }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    let body = message.body as! [String: Any]
    let command = body["command"] as! String
    if command == "ready" {
      startScenario()
      return
    }
    let id = body["id"] as! Int
    if command == "setFullscreen", let value = body["value"] as? Bool,
      window.styleMask.contains(.fullScreen) != value
    {
      confirmedExitRequests += 1
      window.toggleFullScreen(nil)
    }
    let value = window.styleMask.contains(.fullScreen) ? "true" : "false"
    web.evaluateJavaScript("window.nativeReplies[\(id)](\(value))")
  }
  func sendEscape() {
    for kind in [NSEvent.EventType.keyDown, .keyUp] {
      let event = NSEvent.keyEvent(
        with: kind, location: .zero, modifierFlags: [],
        timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: window.windowNumber,
        context: nil, characters: "\u{1b}", charactersIgnoringModifiers: "\u{1b}", isARepeat: false,
        keyCode: 53)!
      NSApp.sendEvent(event)
    }
  }
  func pressEscape() {
    print("initial fullscreen", window.styleMask.contains(.fullScreen))
    sendEscape()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
      self.web.evaluateJavaScript("events.includes('armed')") { armed, error in
        print(
          "after first Escape", self.window.styleMask.contains(.fullScreen), "armed", armed ?? false
        )
        // Fullscreen exit is animated: checking styleMask alone can falsely pass
        // while a single Escape has already started the native exit transition.
        guard error == nil, armed as? Bool == true, self.window.styleMask.contains(.fullScreen)
        else {
          print("The first Escape bypassed the app confirmation handler.")
          exit(1)
        }
        self.sentSecondEscape = true
        self.sendEscape()
      }
    }
  }
}
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let probe = Probe()
app.delegate = probe
app.run()
