#!/usr/bin/env node
// ============================================================================
// SCRIPT: generate-icons.js
//
// PURPOSE:
// Generates all required icon formats for VEYRA Desktop from a source SVG.
// Requires: sharp (npm install sharp) and optionally rsvg-convert for SVG->PNG.
//
// Usage: node scripts/generate-icons.js
// ============================================================================

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ICON_SIZES = {
  ico: [16, 24, 32, 48, 64, 128, 256],
  icns: [16, 32, 64, 128, 256, 512, 1024],
  png: [16, 32, 48, 64, 96, 128, 256, 512, 1024],
};

const SOURCE_SVG = resolve(__dirname, "../build/icon.svg");
const BUILD_DIR = resolve(__dirname, "../build");
const ICON_DIR = resolve(BUILD_DIR, "icons");

async function generateIcons() {
  console.log("[VEYRA] Generating icons...");

  if (!existsSync(SOURCE_SVG)) {
    throw new Error(`Source SVG not found: ${SOURCE_SVG}`);
  }

  mkdirSync(ICON_DIR, { recursive: true });

  // Generate PNGs for all sizes
  for (const size of ICON_SIZES.png) {
    const outputPath = resolve(ICON_DIR, `icon-${size}x${size}.png`);
    await sharp(SOURCE_SVG)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`  Generated ${outputPath}`);
  }

  // Generate ICO (Windows)
  const icoBuffers = await Promise.all(
    ICON_SIZES.ico.map((size) =>
      sharp(SOURCE_SVG)
        .resize(size, size)
        .png()
        .toBuffer()
    )
  );

  // Note: sharp doesn't directly support ICO output, so we write the largest PNG as icon.png
  // and the build process will need to convert it. For production, use a proper ICO tool.
  const largestIco = await sharp(SOURCE_SVG).resize(256, 256).png().toBuffer();
  writeFileSync(resolve(BUILD_DIR, "icon.png"), largestIco);
  console.log(`  Generated ${resolve(BUILD_DIR, "icon.png")} (largest for ICO conversion)`);

  // Generate ICNS (macOS) - we create the iconset directory
  const iconsetDir = resolve(ICON_DIR, "icon.iconset");
  mkdirSync(iconsetDir, { recursive: true });

  for (const size of ICON_SIZES.icns) {
    const outputPath = resolve(iconsetDir, `icon_${size}x${size}.png`);
    await sharp(SOURCE_SVG)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`  Generated ${outputPath}`);
  }

  // For @2x variants
  for (const size of [16, 32, 64, 128, 256, 512]) {
    const doubleSize = size * 2;
    if (ICON_SIZES.icns.includes(doubleSize)) {
      const outputPath = resolve(iconsetDir, `icon_${size}x${size}@2x.png`);
      await sharp(SOURCE_SVG)
        .resize(doubleSize, doubleSize)
        .png()
        .toFile(outputPath);
      console.log(`  Generated ${outputPath}`);
    }
  }

  console.log("[VEYRA] Icon generation complete!");
  console.log("");
  console.log("Next steps:");
  console.log("  1. For Windows ICO: Use a tool like 'png2ico' or 'icotool' to convert PNGs to .ico");
  console.log("  2. For macOS ICNS: Run 'iconutil -c icns build/icons/icon.iconset' on macOS");
  console.log("  3. For Linux: Use the PNG files directly");
}

generateIcons().catch((error) => {
  console.error("[VEYRA] Icon generation failed:", error);
  process.exit(1);
});