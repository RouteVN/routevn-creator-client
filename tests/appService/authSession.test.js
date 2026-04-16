import { describe, expect, it, vi } from "vitest";
import {
  clearAuthenticatedSession,
  persistAuthenticatedSession,
} from "../../src/deps/services/shared/authSession.js";

describe("authSession", () => {
  it("persists the authenticated session and user under userConfig", () => {
    const appService = {
      setUserConfig: vi.fn(),
    };

    persistAuthenticatedSession(appService, {
      authToken: "auth-token-1",
      refreshToken: "refresh-token-1",
      user: {
        id: "user-1",
        email: "user@example.com",
        creatorDisplayName: "Creator",
      },
    });

    expect(appService.setUserConfig).toHaveBeenCalledWith("auth.session", {
      authToken: "auth-token-1",
      refreshToken: "refresh-token-1",
    });
    expect(appService.setUserConfig).toHaveBeenCalledWith("auth.user", {
      id: "user-1",
      email: "user@example.com",
      name: "Creator",
      displayColor: "#E2E8F0",
      avatar: "",
      registered: true,
    });
  });

  it("clears auth keys by removing them from userConfig", () => {
    const appService = {
      setUserConfig: vi.fn(),
    };

    clearAuthenticatedSession(appService);

    expect(appService.setUserConfig).toHaveBeenCalledWith(
      "auth.session",
      undefined,
    );
    expect(appService.setUserConfig).toHaveBeenCalledWith(
      "auth.user",
      undefined,
    );
  });
});
