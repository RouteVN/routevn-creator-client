import Foundation
import Sentry

/// Starts native crash reporting: signals, Mach exceptions, uncaught
/// NSExceptions and Swift runtime traps. Reports are saved at crash time and
/// sent on the next launch. See docs/mobile-crash-reporting.md.
enum NativeCrashReporting {
    static func start(bundle: Bundle = .main) {
        guard let dsn = bundle.object(forInfoDictionaryKey: "RouteVNSentryDSN") as? String,
              !dsn.isEmpty else { return }
        let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        let environment = bundle.object(forInfoDictionaryKey: "RouteVNSentryEnvironment") as? String
        // Read the existing device ID before the SDK starts; it may be absent.
        let deviceId = NativeDeviceIdReader.read()

        SentrySDK.start { options in
            options.dsn = dsn
            options.releaseName = "routevn-creator@\(version ?? "unknown")"
            options.dist = build
            options.environment = environment ?? "production"
            options.sendDefaultPii = false
            options.sendClientReports = false
            options.maxBreadcrumbs = 0
            options.maxCacheItems = 10
            options.maxAttachmentSize = 0
            options.enableLogs = false
            options.enableMetrics = false

            // Crashes only.
            options.enableCrashHandler = true
            options.enableAutoSessionTracking = false
            options.enableWatchdogTerminationTracking = false
            options.enableAppHangTracking = false
            options.enableMetricKit = false

            // No swizzling, breadcrumbs, attachments or tracing.
            options.enableSwizzling = false
            options.enableAutoBreadcrumbTracking = false
            options.enableNetworkBreadcrumbs = false
            options.enableNetworkTracking = false
            options.enableCaptureFailedRequests = false
            options.enableAutoPerformanceTracing = false
            options.enableUIViewControllerTracing = false
            options.enableUserInteractionTracing = false
            options.enableFileIOTracing = false
            options.enableDataSwizzling = false
            options.enableCoreDataTracing = false
            options.attachScreenshot = false
            options.attachViewHierarchy = false

            options.beforeSend = { event in NativeCrashScrubber.scrub(event, deviceId: deviceId) }
        }
    }
}

/// Keeps a crash report to the crash type, stack locations, the debug images
/// those frames point into, app version, device model, OS version and the
/// device ID as user.id. Message text, other user data, paths,
/// variables and other context are dropped.
enum NativeCrashScrubber {
    static let message = "App crash"

    static func scrub(_ event: Event, deviceId: String?) -> Event {
        event.message = nil
        event.error = nil
        event.user = keptUser(deviceId)
        event.request = nil
        event.breadcrumbs = nil
        event.serverName = nil
        event.transaction = nil
        event.modules = nil
        event.tags = nil
        event.extra = nil
        event.context = scrubContext(event.context)

        var addresses: [UInt64] = []
        scrub(event.stacktrace, addresses: &addresses)
        for exception in event.exceptions ?? [] {
            exception.value = message
            if let mechanism = exception.mechanism {
                mechanism.desc = nil
                mechanism.data = nil
                mechanism.helpLink = nil
            }
            scrub(exception.stacktrace, addresses: &addresses)
        }
        for thread in event.threads ?? [] {
            scrub(thread.stacktrace, addresses: &addresses)
        }

        // Crash reports list every loaded image. Keep only the images the
        // frames point into, which is enough to decode them and keeps the
        // event under the collector's size limit.
        event.debugMeta = event.debugMeta?.filter { image in
            let size = image.imageSize?.uint64Value ?? 0
            return addresses.contains { address in
                address >= image.imageAddressRaw && address - image.imageAddressRaw < size
            }
        }
        for image in event.debugMeta ?? [] {
            image.codeFile = basename(image.codeFile)
        }
        return event
    }

    // Keep only the device ID as user.id; any other user data on the
    // incoming event is dropped.
    private static func keptUser(_ deviceId: String?) -> User? {
        guard let deviceId, NativeDeviceIdReader.isDeviceId(deviceId) else { return nil }
        let user = User()
        user.userId = deviceId
        return user
    }

    private static func scrubContext(
        _ context: [String: [String: Any]]?
    ) -> [String: [String: Any]]? {
        guard let context else { return nil }
        var kept: [String: [String: Any]] = [:]
        if let device = context["device"] {
            kept["device"] = device.filter { ["model", "family", "arch", "simulator"].contains($0.key) }
        }
        if let os = context["os"] {
            kept["os"] = os.filter { ["name", "version"].contains($0.key) }
        }
        return kept
    }

    private static func scrub(_ stacktrace: SentryStacktrace?, addresses: inout [UInt64]) {
        guard let stacktrace else { return }
        stacktrace.registers = [:]
        for frame in stacktrace.frames {
            frame.fileName = basename(frame.fileName)
            frame.package = basename(frame.package)
            frame.vars = nil
            frame.contextLine = nil
            frame.preContext = nil
            frame.postContext = nil
            if let address = parseAddress(frame.instructionAddress) {
                addresses.append(address)
            }
        }
    }

    private static func parseAddress(_ value: String?) -> UInt64? {
        guard let value, value.hasPrefix("0x") else { return nil }
        return UInt64(value.dropFirst(2), radix: 16)
    }

    private static func basename(_ path: String?) -> String? {
        guard let path else { return nil }
        return path.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? path
    }
}
