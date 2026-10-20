import Foundation

@main
struct RendererLossGuardNativeTests {
    static func main() {
        // A single rapid loss reloads.
        var guardOne = RendererLossGuard()
        guardOne.pageLoadStarted(at: 100)
        precondition(!guardOne.lossMeansPageCannotStart(at: 102))

        // A page that cannot start, with the app active throughout.
        var cannotStart = RendererLossGuard()
        cannotStart.pageLoadStarted(at: 100)
        precondition(!cannotStart.lossMeansPageCannotStart(at: 102))
        cannotStart.pageLoadStarted(at: 102)
        precondition(cannotStart.lossMeansPageCannotStart(at: 104))

        // The crash in the field: the system ends the content process each
        // time the app leaves the foreground soon after the page loads, and the
        // page loads again when the app is active.
        var reclaimed = RendererLossGuard()
        var now: TimeInterval = 100
        for _ in 0..<5 {
            reclaimed.pageLoadStarted(at: now)
            reclaimed.appLeftForeground()
            now += 5
            precondition(!reclaimed.lossMeansPageCannotStart(at: now))
            now += 5
        }

        // A page that left the foreground stays excluded after it returns.
        var returned = RendererLossGuard()
        returned.pageLoadStarted(at: 100)
        precondition(!returned.lossMeansPageCannotStart(at: 101))
        returned.pageLoadStarted(at: 101)
        returned.appLeftForeground()
        precondition(!returned.lossMeansPageCannotStart(at: 110))

        // A loss after the app left the foreground breaks the row.
        var broken = RendererLossGuard()
        broken.pageLoadStarted(at: 100)
        precondition(!broken.lossMeansPageCannotStart(at: 101))
        broken.pageLoadStarted(at: 101)
        broken.appLeftForeground()
        precondition(!broken.lossMeansPageCannotStart(at: 102))
        broken.pageLoadStarted(at: 200)
        precondition(!broken.lossMeansPageCannotStart(at: 201))
        broken.pageLoadStarted(at: 201)
        precondition(broken.lossMeansPageCannotStart(at: 202))

        // A loss 30 seconds after the load is not rapid and breaks the row.
        var slow = RendererLossGuard()
        slow.pageLoadStarted(at: 100)
        precondition(!slow.lossMeansPageCannotStart(at: 101))
        slow.pageLoadStarted(at: 101)
        precondition(!slow.lossMeansPageCannotStart(at: 101 + RendererLossGuard.rapidLossSeconds))
        slow.pageLoadStarted(at: 200)
        precondition(!slow.lossMeansPageCannotStart(at: 201))

        // A loss before any page load is not rapid.
        var unloaded = RendererLossGuard()
        precondition(!unloaded.lossMeansPageCannotStart(at: 1))
        unloaded.pageLoadStarted(at: 2)
        precondition(!unloaded.lossMeansPageCannotStart(at: 3))

        print("RendererLossGuard native tests passed")
    }
}
