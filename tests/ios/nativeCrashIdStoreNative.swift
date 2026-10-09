import Foundation

@main
struct NativeCrashIdStoreNativeTests {
    static func main() throws {
        try validation()
        try lifecycle()
        print("PASS: crash ID validation, creation, reuse and corruption regeneration")
    }

    static func validation() throws {
        precondition(NativeCrashIdStore.isCrashId("0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f"))
        precondition(NativeCrashIdStore.isCrashId("11111111-2222-4333-8444-555555555555"))
        for invalid in [
            nil,
            "",
            "0F6B1C3E-2A4D-4C8B-9E7F-1A2B3C4D5E6F",
            "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6f ",
            "0f6b1c3e-2a4d-4c8b-9e7f-1a2b3c4d5e6",
            "0f6b1c3e2a4d4c8b9e7f1a2b3c4d5e6f",
            // Wrong version nibble.
            "0f6b1c3e-2a4d-5c8b-9e7f-1a2b3c4d5e6f",
            // Wrong variant nibble.
            "0f6b1c3e-2a4d-4c8b-ce7f-1a2b3c4d5e6f",
        ] {
            precondition(!NativeCrashIdStore.isCrashId(invalid), "accepted \(invalid ?? "nil")")
        }
    }

    static func lifecycle() throws {
        let suiteName = "routevn-crash-id-test-\(UUID().uuidString)"
        guard let defaults = UserDefaults(suiteName: suiteName) else {
            preconditionFailure("Could not create the test defaults suite")
        }
        defer { defaults.removePersistentDomain(forName: suiteName) }

        // A fresh install creates a valid ID and keeps returning it.
        let first = NativeCrashIdStore.loadOrCreate(defaults: defaults)
        precondition(NativeCrashIdStore.isCrashId(first))
        precondition(defaults.string(forKey: NativeCrashIdStore.defaultsKey) == first)
        precondition(NativeCrashIdStore.loadOrCreate(defaults: defaults) == first)

        // Corrupt stored values are replaced by a fresh valid, persisted ID.
        for corrupt in [
            "not-a-uuid",
            "",
            "0F6B1C3E-2A4D-4C8B-9E7F-1A2B3C4D5E6F",
            "0f6b1c3e-2a4d-5c8b-9e7f-1a2b3c4d5e6f",
        ] {
            defaults.set(corrupt, forKey: NativeCrashIdStore.defaultsKey)
            let regenerated = NativeCrashIdStore.loadOrCreate(defaults: defaults)
            precondition(NativeCrashIdStore.isCrashId(regenerated), "kept \(corrupt)")
            precondition(regenerated != corrupt)
            precondition(defaults.string(forKey: NativeCrashIdStore.defaultsKey) == regenerated)
            precondition(NativeCrashIdStore.loadOrCreate(defaults: defaults) == regenerated)
        }
    }
}
