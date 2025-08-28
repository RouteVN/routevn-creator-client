// Web-specific setup
import { setupCommon } from "./setup.common";

// Web-specific configuration
const webConfig = {
  platform: "web",
  baseUrl: "http://localhost:8788",
  headers: {
    // Additional web-specific headers if needed
  },
  // Use default IndexedDB storage for web
};

// Initialize with web-specific config
const { h, patch, deps } = await setupCommon(webConfig);

// Export for the application
export { h, patch, deps };