class Request {
  _authToken;

  constructor(baseUrl, authToken, headers) {
    this._baseUrl = baseUrl;
    this._authToken = authToken;
    this._headers = headers;
  }

  setAuthToken(token) {
    this._authToken = token;
  }

  async request(name, payload, options) {
    const headers = {
      "Content-Type": "application/json",
      ...this._headers,
    };
    if (this._authToken) {
      headers.Authorization = `Bearer ${this._authToken}`;
    }

    const response = await fetch(`${this._baseUrl}/${name}`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers,
      credentials: options?.includeCredentials ? "include" : undefined,
    });

    return response.json();
  }
}

/**
 * @typedef {Object} ApiEndpointConfig
 * @property {boolean} [includeCredentials] - Whether to include credentials in the request
 */

/**
 * Creates an HTTP client with a flexible JSON configuration.
 * The generated client provides typed methods for each API endpoint based on the configuration.
 *
 * @param {Object} config - The client configuration
 * @param {string} config.baseUrl - Base URL for all API requests
 * @param {Object} [config.headers={}] - Default headers for all requests
 * @param {Object.<string, Object.<string, ApiEndpointConfig>>} [config.apis={}] - API configuration object
 * @returns {Object} The configured HTTP client with API methods
 */
export function createHttpClient(config) {
  const { baseUrl, apis = {}, headers = {} } = config;
  const requests = new Map();

  const httpClient = {};

  // Create request instances and client structure from configuration
  Object.entries(apis).forEach(([apiName, endpoints]) => {
    const apiBaseUrl = `${baseUrl}/${apiName}`;
    const request = new Request(apiBaseUrl, undefined, headers);
    requests.set(apiName, request);

    // Create API namespace on the client
    httpClient[apiName] = {};

    // Create methods for each endpoint
    Object.entries(endpoints).forEach(([endpointName, options]) => {
      httpClient[apiName][endpointName] = (body) => {
        return request.request(endpointName, body, options);
      };
    });
  });

  // Add setAuthToken method to the client
  httpClient.setAuthToken = (token) => {
    for (const request of requests.values()) {
      request.setAuthToken(token);
    }
  };

  return httpClient;
}

/**
 * @typedef {Object} HttpClient
 * @property {Object} creator - Creatorendpoints
 * @property {function(string): Promise<string>} creator.uploadFile - Upload file
 * @property {function(string): Promise<string>} creator.getFileContent - Get file content
 * @property {function(string): void} setAuthToken - Set auth token
 */
export default ({ baseUrl, headers }) => {
  /**
   * @type {HttpClient}
   */
  const httpClient = createHttpClient({
    baseUrl,
    headers,
    apis: {
      creator: {
        uploadFile: {},
        getFileContent: {},
      },
    },
  });

  return httpClient;
};
