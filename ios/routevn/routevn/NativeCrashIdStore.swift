import Foundation

/// Random per-install crash ID (UUID v4, lowercase), generated and persisted by
/// the native shell before Sentry initializes. Separate from the update-check
/// device ID and never sent anywhere but the crash reporter's user.id. Used
/// only to count distinct crashing installs per version.
/// See docs/mobile-crash-reporting.md.
enum NativeCrashIdStore {
    static let defaultsKey = "RouteVNCrashId"
    private static var inMemoryId: String?

    static func isCrashId(_ value: String?) -> Bool {
        guard let value, value.count == 36 else { return false }
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 5, parts.map(\.count) == [8, 4, 4, 4, 12] else {
            return false
        }
        let allowed = CharacterSet(charactersIn: "0123456789abcdef")
        let hex = parts.joined()
        guard hex.unicodeScalars.allSatisfy(allowed.contains) else { return false }
        let versionNibble = hex[hex.index(hex.startIndex, offsetBy: 12)]
        let variantNibble = hex[hex.index(hex.startIndex, offsetBy: 16)]
        let variant: Set<Character> = ["8", "9", "a", "b"]
        return versionNibble == "4" && variant.contains(variantNibble)
    }

    /// Load the persisted crash ID, creating a fresh one when it is missing or
    /// corrupt. Storage failures never block startup; the ID is then random for
    /// this run only.
    static func loadOrCreate(defaults: UserDefaults = .standard) -> String {
        if let stored = defaults.string(forKey: defaultsKey), isCrashId(stored) {
            return stored
        }
        if let inMemoryId { return inMemoryId }
        let next = UUID().uuidString.lowercased()
        defaults.set(next, forKey: defaultsKey)
        if defaults.string(forKey: defaultsKey) != next {
            inMemoryId = next
        }
        return next
    }
}
