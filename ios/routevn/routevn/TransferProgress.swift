import Foundation

/**
 Sends { current, total } to the delivery closure: the first event is sent by
 start (current 0), events in between at most once per 100 ms, and finish
 always sends. Delivery is fire and forget, so it can never fail an import.
 */
final class TransferProgress {
    private let deliver: (_ current: UInt64, _ total: UInt64) -> Void
    private let lock = NSLock()
    private var total: UInt64 = 0
    private var lastEventAt: TimeInterval = 0

    init(deliver: @escaping (_ current: UInt64, _ total: UInt64) -> Void) {
        self.deliver = deliver
    }

    func start(total: UInt64 = 0) {
        send(current: 0, total: total, force: true)
    }

    func update(current: UInt64) {
        send(current: current, total: nil, force: false)
    }

    func finish(current: UInt64) {
        send(current: current, total: nil, force: true)
    }

    private func send(current: UInt64, total newTotal: UInt64?, force: Bool) {
        lock.lock()
        defer { lock.unlock() }
        if let newTotal {
            total = newTotal
        }
        let now = ProcessInfo.processInfo.systemUptime
        guard force || now - lastEventAt >= 0.1 else {
            return
        }
        lastEventAt = now
        deliver(current, total)
    }
}
