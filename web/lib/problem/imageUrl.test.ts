import { describe, expect, it } from "vitest";
import { checkImageUrl, IMAGE_URL_PREFIX } from "./imageUrl";

describe("checkImageUrl", () => {
  it("passes empty/blank values", () => {
    expect(checkImageUrl(null)).toBe("VALID");
    expect(checkImageUrl(undefined)).toBe("VALID");
    expect(checkImageUrl("   ")).toBe("VALID");
  });
  it("passes the upload-API prefix", () => {
    expect(checkImageUrl(`${IMAGE_URL_PREFIX}abc.png`)).toBe("VALID");
  });
  it("rejects external URLs", () => {
    expect(checkImageUrl("https://evil.example/x.png")).toBe("BAD_PREFIX");
    expect(checkImageUrl("//evil.example/x.png")).toBe("BAD_PREFIX");
    expect(checkImageUrl("/other/x.png")).toBe("BAD_PREFIX");
  });
  it("rejects .. path traversal even with a matching prefix", () => {
    // A matching prefix can still point above the upload directory.
    expect(checkImageUrl(`${IMAGE_URL_PREFIX}../../etc/passwd`)).toBe("BAD_PREFIX");
  });
  it("rejects a URL over 500 characters as TOO_LONG", () => {
    expect(checkImageUrl(IMAGE_URL_PREFIX + "a".repeat(500))).toBe("TOO_LONG");
  });
});
