import { createBrowserWebSocketTransport } from "insieme/browser";

const resolveLogFn = (logger, level) => {
  if (level === "error" && typeof logger?.error === "function") {
    return logger.error.bind(logger);
  }
  if (level === "warn" && typeof logger?.warn === "function") {
    return logger.warn.bind(logger);
  }
  if (typeof logger?.log === "function") {
    return logger.log.bind(logger);
  }
  return null;
};

const mapTransportEvent = (entry = {}) => {
  const event = entry?.event;
  switch (event) {
    case "connect_attempt":
      return { level: "info", message: "connect attempt", meta: {} };
    case "connected":
      return { level: "info", message: "connected", meta: {} };
    case "connect_failed":
      return { level: "error", message: "connect failed", meta: {} };
    case "connect_skipped_already_open":
      return {
        level: "debug",
        message: "connect skipped; socket already open",
        meta: {},
      };
    case "connect_wait_existing_connecting_socket":
      return {
        level: "debug",
        message: "connect waiting on existing socket",
        meta: {},
      };
    case "message_received":
      return {
        level: "debug",
        message: "message received",
        meta: { eventType: entry?.message_type },
      };
    case "message_sent":
      return {
        level: "debug",
        message: "message sent",
        meta: { eventType: entry?.message_type },
      };
    case "message_parse_failed":
      return {
        level: "warn",
        message: "message parse failed",
        meta: { error: entry?.message || "unknown" },
      };
    case "disconnected":
      return {
        level: "info",
        message: "disconnected",
        meta: {
          code: entry?.code,
          reason: entry?.reason,
          wasClean: entry?.wasClean,
        },
      };
    case "socket_closed": {
      const isAbnormalClose = entry?.code === 1006 || entry?.wasClean === false;
      return {
        level: isAbnormalClose ? "error" : "warn",
        message: "socket closed",
        meta: {
          code: entry?.code,
          reason: entry?.reason,
          wasClean: entry?.wasClean,
        },
      };
    }
    default:
      return {
        level: "debug",
        message: String(event || "transport_event"),
        meta: {},
      };
  }
};

export const createWebSocketTransport = ({
  url,
  protocols,
  WebSocketImpl = WebSocket,
  logger = console,
  label = "routevn.collab.ws",
}) =>
  createBrowserWebSocketTransport({
    url,
    protocols,
    WebSocketImpl,
    logger: (entry) => {
      const mapped = mapTransportEvent(entry);
      const fn = resolveLogFn(logger, mapped.level);
      if (!fn) return;
      fn(`[${label}] ${mapped.message}`, {
        url,
        ...mapped.meta,
      });
    },
    label,
  });
