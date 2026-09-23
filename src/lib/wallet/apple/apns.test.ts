import { describe, it, expect } from "vitest";
import { classifyApnsResponse } from "./apns";

describe("classifyApnsResponse", () => {
  it("200 es éxito", () => {
    expect(classifyApnsResponse(200)).toBe("ok");
  });

  it("410 y tokens inválidos significan que el dispositivo ya no está", () => {
    expect(classifyApnsResponse(410, "Unregistered")).toBe("gone");
    expect(classifyApnsResponse(400, "BadDeviceToken")).toBe("gone");
    expect(classifyApnsResponse(400, "DeviceTokenNotForTopic")).toBe("gone");
  });

  it("otros errores no desactivan el token (pueden ser temporales)", () => {
    expect(classifyApnsResponse(400, "BadTopic")).toBe("error");
    expect(classifyApnsResponse(403, "InvalidProviderToken")).toBe("error");
    expect(classifyApnsResponse(429, "TooManyRequests")).toBe("error");
    expect(classifyApnsResponse(503)).toBe("error");
  });
});
