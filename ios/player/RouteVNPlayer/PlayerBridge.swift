import Foundation
import WebKit

// The persistence bridge between the web player and RuntimeKvStore. It gives
// the page the same object as the Android player, RouteVNPlayerIOS: the page
// calls postMessage(text) with a JSON request `{ id, method, payload }`, and
// onmessage({ data }) receives the JSON reply `{ id, ok, value | error }`.
final class PlayerBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "RouteVNPlayerIOS"
    static let installScript = """
    (() => {
      const handler = window.webkit?.messageHandlers?.\(name);
      if (!handler) return;
      const bridge = {
        onmessage: undefined,
        postMessage(data) {
          handler.postMessage(data).then(
            (reply) => bridge.onmessage?.({ data: reply }),
            (error) => console.error("The player bridge refused a request.", error),
          );
        },
      };
      Object.defineProperty(window, "\(name)", { value: bridge });
    })();
    """

    private struct BridgeError: LocalizedError {
        let errorDescription: String?
        init(_ message: String) { errorDescription = message }
    }

    // Every database call, including close, runs on this queue.
    private let queue = DispatchQueue(label: "vn.routevn.player.database", qos: .userInitiated)
    private let store = RuntimeKvStore()
    private let ready: () -> Void

    init(ready: @escaping () -> Void) {
        self.ready = ready
    }

    func close() {
        let store = store
        queue.async { store.close() }
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,
              origin.protocol == PlayerViewController.scheme,
              origin.host == PlayerViewController.host,
              let text = message.body as? String
        else {
            replyHandler(nil, "The player bridge accepts requests only from the game.")
            return
        }
        queue.async {
            let reply = self.respond(to: text)
            DispatchQueue.main.async { replyHandler(reply, nil) }
        }
    }

    private func respond(to text: String) -> String {
        var response: [String: Any] = [:]
        do {
            guard let data = text.data(using: .utf8),
                  let request = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                throw BridgeError("The request must be a JSON object.")
            }
            guard let id = request["id"] as? NSNumber, !Self.isBoolean(id) else {
                throw BridgeError("Request id must be a number")
            }
            response["id"] = id
            guard let method = request["method"] as? String else {
                throw BridgeError("Request method must be a string")
            }
            guard let payload = request["payload"] as? [String: Any] else {
                throw BridgeError("Request payload must be an object")
            }
            response["value"] = try handle(method: method, payload: payload) ?? NSNull()
            response["ok"] = true
        } catch {
            response["ok"] = false
            response["value"] = nil
            response["error"] = error.localizedDescription
        }
        guard let data = try? JSONSerialization.data(withJSONObject: response),
              let reply = String(data: data, encoding: .utf8)
        else {
            return #"{"ok":false,"error":"The player bridge could not encode its reply."}"#
        }
        return reply
    }

    private func handle(method: String, payload: [String: Any]) throws -> Any? {
        switch method {
        case "player.ready":
            DispatchQueue.main.async(execute: ready)
            return nil
        case "kv.init":
            try store.initialize()
            return nil
        case "kv.list":
            var prefix: String?
            if let value = payload["prefix"] {
                guard let value = value as? String else {
                    throw BridgeError("prefix must be a string")
                }
                prefix = value
            }
            return try store.list(prefix: prefix).map { row -> [String: Any] in
                ["key": row.key, "value": row.value ?? NSNull()]
            }
        case "kv.set":
            try store.set(key: try Self.key(payload["key"]), value: try Self.text(payload["value"], name: "value"))
            return nil
        case "kv.applyBatch":
            // Deletes override puts, and a repeated key keeps its last value.
            var order: [String] = []
            var operations: [String: String?] = [:]
            func record(_ key: String, _ value: String?) {
                if operations.updateValue(value, forKey: key) == nil {
                    order.append(key)
                }
            }
            for entry in try Self.array(payload["puts"], name: "puts") {
                guard let entry = entry as? [String: Any] else {
                    throw BridgeError("puts must contain objects")
                }
                record(try Self.key(entry["key"]), try Self.text(entry["value"], name: "value"))
            }
            for key in try Self.array(payload["deletes"], name: "deletes") {
                record(try Self.key(key), nil)
            }
            try store.apply(order.map { ($0, operations[$0] ?? nil) })
            return nil
        case "kv.clear":
            try store.clear()
            return nil
        default:
            throw BridgeError("Unknown player bridge method: \(method)")
        }
    }

    private static func isBoolean(_ value: NSNumber) -> Bool {
        CFGetTypeID(value) == CFBooleanGetTypeID()
    }

    private static func key(_ value: Any?) throws -> String {
        guard let key = value as? String, !key.isEmpty else {
            throw BridgeError("Db key must be a non-empty string")
        }
        return key
    }

    private static func text(_ value: Any?, name: String) throws -> String {
        guard let text = value as? String else {
            throw BridgeError("\(name) must be a string")
        }
        return text
    }

    private static func array(_ value: Any?, name: String) throws -> [Any] {
        guard let value else { return [] }
        guard let array = value as? [Any] else {
            throw BridgeError("\(name) must be an array")
        }
        return array
    }
}
