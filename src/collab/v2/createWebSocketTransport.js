export const createWebSocketTransport = ({
  url,
  protocols,
  WebSocketImpl = WebSocket,
  logger = console,
  label = "routevn.collab.ws",
}) => {
  let socket = null;
  let messageHandler = null;

  const log = (level, message, meta = {}) => {
    const fn =
      level === "error" && typeof logger?.error === "function"
        ? logger.error.bind(logger)
        : level === "warn" && typeof logger?.warn === "function"
          ? logger.warn.bind(logger)
          : typeof logger?.log === "function"
            ? logger.log.bind(logger)
            : null;
    if (!fn) return;
    fn(`[${label}] ${message}`, {
      url,
      ...meta,
    });
  };

  const ensureOpen = () => {
    if (!socket || socket.readyState !== WebSocketImpl.OPEN) {
      const error = new Error("websocket is not connected");
      error.code = "transport_disconnected";
      throw error;
    }
  };

  return {
    async connect() {
      if (socket && socket.readyState === WebSocketImpl.OPEN) {
        log("debug", "connect skipped; socket already open");
        return;
      }

      log("info", "connect attempt");
      await new Promise((resolve, reject) => {
        socket = new WebSocketImpl(url, protocols);
        socket.onopen = () => {
          log("info", "connected");
          resolve();
        };
        socket.onerror = (event) => {
          log("error", "connect failed", { eventType: event?.type || "error" });
          reject(new Error("websocket connect failed"));
        };
        socket.onmessage = (event) => {
          if (!messageHandler) return;
          try {
            const parsed = JSON.parse(event.data);
            log("debug", "message received", {
              eventType: parsed?.type,
            });
            messageHandler(parsed);
          } catch (error) {
            log("warn", "message parse failed", {
              error: error?.message || "unknown",
            });
          }
        };
        socket.onclose = (event) => {
          const isAbnormalClose =
            event?.code === 1006 || event?.wasClean === false;
          const closeLevel = isAbnormalClose ? "error" : "warn";
          log(closeLevel, "socket closed", {
            code: event?.code,
            reason: event?.reason,
            wasClean: event?.wasClean,
          });
        };
      });
    },

    async disconnect() {
      if (!socket) return;
      log("info", "disconnect requested");
      await new Promise((resolve) => {
        const current = socket;
        current.onclose = (event) => {
          log("info", "disconnected", {
            code: event?.code,
            reason: event?.reason,
          });
          resolve();
        };
        current.close();
        if (current.readyState === WebSocketImpl.CLOSED) {
          resolve();
        }
      });
      socket = null;
    },

    async send(message) {
      ensureOpen();
      log("debug", "message sent", {
        eventType: message?.type,
      });
      socket.send(JSON.stringify(message));
    },

    onMessage(handler) {
      log("debug", "message handler attached");
      messageHandler = handler;
      return () => {
        if (messageHandler === handler) {
          messageHandler = null;
          log("debug", "message handler detached");
        }
      };
    },
  };
};
