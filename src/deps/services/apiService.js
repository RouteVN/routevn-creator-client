const DEFAULT_LOCAL_API_BASE_URL = "http://127.0.0.1:8787";
const DEFAULT_REMOTE_API_BASE_URL = "https://127.0.0.1:8787";

const normalizeBaseUrl = (input) => {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }
  return value.replace(/\/+$/, "");
};

const isLocalHostname = (hostname) => {
  return hostname === "localhost" || hostname === "127.0.0.1";
};

export const resolveDefaultApiBaseUrl = () => {
  if (typeof window === "undefined") {
    return DEFAULT_LOCAL_API_BASE_URL;
  }

  const params = new URLSearchParams(window.location.search);
  const queryBaseUrl = normalizeBaseUrl(params.get("apiBaseUrl"));
  if (queryBaseUrl) {
    return queryBaseUrl;
  }

  const host = window.location.hostname || "";
  if (isLocalHostname(host)) {
    return DEFAULT_LOCAL_API_BASE_URL;
  }

  return DEFAULT_REMOTE_API_BASE_URL;
};

const createRpcError = ({
  message = "RPC request failed",
  code = "RPC_ERROR",
  details = {},
  status = null,
  method = "",
} = {}) => {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.status = status;
  error.method = method;
  return error;
};

export const createApiService = ({ baseUrl } = {}) => {
  const resolvedBaseUrl = normalizeBaseUrl(
    baseUrl || resolveDefaultApiBaseUrl(),
  );
  const resolvedRpcUrl = resolvedBaseUrl.endsWith("/rpc")
    ? resolvedBaseUrl
    : `${resolvedBaseUrl}/rpc`;
  let nextRequestId = 1;

  if (!resolvedBaseUrl) {
    throw new Error("API base URL is not configured.");
  }

  const rpcCall = async ({ method, params = {}, headers = {} } = {}) => {
    const response = await fetch(resolvedRpcUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextRequestId++,
        method,
        params,
      }),
    });

    let body = null;
    try {
      body = await response.json();
    } catch (error) {
      throw createRpcError({
        code: "RPC_INVALID_JSON",
        message: "Server returned an invalid JSON response.",
        status: response.status,
        method,
        details: {
          cause: error?.message || String(error),
        },
      });
    }

    if (body?.error) {
      const errorCode =
        body.error?.data?.code || body.error?.code || "RPC_METHOD_ERROR";

      throw createRpcError({
        code: errorCode,
        message: body.error?.message || "RPC method failed.",
        status: response.status,
        method,
        details: body.error?.data?.details || {},
      });
    }

    if (!Object.prototype.hasOwnProperty.call(body || {}, "result")) {
      throw createRpcError({
        code: "RPC_NO_RESULT",
        message: "RPC response is missing result.",
        status: response.status,
        method,
      });
    }

    return body.result;
  };

  const createAuthHeaders = (authToken) => {
    if (typeof authToken !== "string") {
      return {};
    }
    const normalized = authToken.trim();
    if (!normalized) {
      return {};
    }
    return {
      authorization: `Bearer ${normalized}`,
    };
  };

  return {
    getBaseUrl() {
      return resolvedBaseUrl;
    },

    getRpcUrl() {
      return resolvedRpcUrl;
    },

    rpcCall,

    async requestAuthOtp({ email } = {}) {
      return rpcCall({
        method: "user.requestAuthOtp",
        params: { email },
      });
    },

    async authenticate({ email, otp } = {}) {
      return rpcCall({
        method: "user.authenticate",
        params: { email, otp },
      });
    },

    async register({ email, registerCode } = {}) {
      return rpcCall({
        method: "user.register",
        params: { email, registerCode },
      });
    },

    async reissueRegisterToken({ email, registerCode } = {}) {
      return rpcCall({
        method: "user.reissueToken",
        params: { email, registerCode },
      });
    },

    async getProfile({ authToken } = {}) {
      return rpcCall({
        method: "user.getProfile",
        params: {},
        headers: createAuthHeaders(authToken),
      });
    },

    async createProject({ authToken, name, description } = {}) {
      const params = {
        name,
      };

      const normalizedDescription =
        typeof description === "string" ? description.trim() : "";
      if (normalizedDescription) {
        params.description = normalizedDescription;
      }

      return rpcCall({
        method: "project.createProject",
        params,
        headers: createAuthHeaders(authToken),
      });
    },

    async addMembers({ authToken, projectId, memberEmails, role } = {}) {
      const params = {
        projectId,
        memberEmails: Array.isArray(memberEmails) ? memberEmails : [],
      };

      if (typeof role === "string" && role.trim()) {
        params.role = role.trim();
      }

      return rpcCall({
        method: "project.addMembers",
        params,
        headers: createAuthHeaders(authToken),
      });
    },
  };
};
