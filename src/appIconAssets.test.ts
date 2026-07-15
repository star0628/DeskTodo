import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("DeskTodo application icon assets", () => {
  it.each([
    ["assets/branding/desktodo-logo-master.png", 1254],
    ["src-tauri/icons/icon.png", 512],
    ["src-tauri/icons/32x32.png", 32],
    ["src-tauri/icons/128x128.png", 128],
    ["src-tauri/icons/128x128@2x.png", 256],
    ["public/favicon.png", 64]
  ] as const)("keeps %s square, RGBA, and at the expected size", (relativePath, size) => {
    const metadata = readPngMetadata(relativePath);

    expect(metadata).toEqual({ width: size, height: size, colorType: 6 });
  });

  it("keeps a complete Windows multi-resolution ICO", () => {
    const icon = readFileSync(join(root, "src-tauri/icons/icon.ico"));
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);

    const entryCount = icon.readUInt16LE(4);
    const sizes = Array.from({ length: entryCount }, (_, index) => {
      const offset = 6 + index * 16;
      return icon[offset] || 256;
    });

    expect(sizes).toEqual(expect.arrayContaining([16, 24, 32, 48, 64, 256]));
  });

  it("routes bundle, tray, and browser surfaces to the new icon family", () => {
    const config = JSON.parse(
      readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")
    ) as { bundle?: { icon?: string[] } };
    const rustSource = readFileSync(join(root, "src-tauri/src/lib.rs"), "utf8");
    const html = readFileSync(join(root, "index.html"), "utf8");

    expect(config.bundle?.icon).toEqual([
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.ico"
    ]);
    expect(rustSource).toContain('include_bytes!("../icons/32x32.png")');
    expect(html).toContain('href="/favicon.png"');
    expect(html).not.toContain('href="data:,"');
  });
});

function readPngMetadata(relativePath: string) {
  const image = readFileSync(join(root, relativePath));
  expect(image.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
    colorType: image[25]
  };
}
