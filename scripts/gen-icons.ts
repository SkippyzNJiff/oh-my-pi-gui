/**
 * Generate app icons from resources/icon-source.svg:
 * - icon.png (1024)
 * - icon.icns (mac only, via iconutil)
 * - icon.ico (windows)
 * - resources/icons/*.png (linux)
 *
 * Run: `bun run scripts/gen-icons.ts`
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import sharp from "sharp";

const resources = path.join(import.meta.dir, "..", "resources");
const svgPath = path.join(resources, "icon-source.svg");
const iconset = path.join(resources, "icon.iconset");

const ICONSET: [string, number][] = [
	["icon_16x16.png", 16],
	["icon_16x16@2x.png", 32],
	["icon_32x32.png", 32],
	["icon_32x32@2x.png", 64],
	["icon_128x128.png", 128],
	["icon_128x128@2x.png", 256],
	["icon_256x256.png", 256],
	["icon_256x256@2x.png", 512],
	["icon_512x512.png", 512],
	["icon_512x512@2x.png", 1024],
];
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

async function render(svg: Buffer, size: number): Promise<Buffer> {
	return sharp(svg, { density: 384 })
		.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toBuffer();
}

function writeIco(frames: { size: number; data: Buffer }[], outPath: string): void {
	const count = frames.length;
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(count, 4);
	const entries = Buffer.alloc(16 * count);
	const blobs: Buffer[] = [];
	let offset = 6 + 16 * count;
	frames.forEach((frame, i) => {
		const w = frame.size >= 256 ? 0 : frame.size;
		entries.writeUInt8(w, i * 16);
		entries.writeUInt8(w, i * 16 + 1);
		entries.writeUInt8(0, i * 16 + 2);
		entries.writeUInt8(0, i * 16 + 3);
		entries.writeUInt16LE(1, i * 16 + 4);
		entries.writeUInt16LE(32, i * 16 + 6);
		entries.writeUInt32LE(frame.data.length, i * 16 + 8);
		entries.writeUInt32LE(offset, i * 16 + 12);
		blobs.push(frame.data);
		offset += frame.data.length;
	});
	writeFileSync(outPath, Buffer.concat([header, entries, ...blobs]));
}

async function main(): Promise<void> {
	const svg = await fs.readFile(svgPath);

	await Bun.write(path.join(resources, "icon.png"), await render(svg, 1024));

	await fs.rm(iconset, { recursive: true, force: true });
	await fs.mkdir(iconset, { recursive: true });
	for (const [name, px] of ICONSET) {
		await Bun.write(path.join(iconset, name), await render(svg, px));
	}
	if (process.platform === "darwin") {
		execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(resources, "icon.icns")], {
			stdio: "inherit",
		});
	} else {
		console.warn("skipping icon.icns (iconutil is mac-only)");
	}
	await fs.rm(iconset, { recursive: true, force: true });

	const linuxDir = path.join(resources, "icons");
	await fs.mkdir(linuxDir, { recursive: true });
	for (const px of LINUX_SIZES) {
		await Bun.write(path.join(linuxDir, `${px}x${px}.png`), await render(svg, px));
	}

	const icoFrames: { size: number; data: Buffer }[] = [];
	for (const size of ICO_SIZES) {
		icoFrames.push({ size, data: Buffer.from(await render(svg, size)) });
	}
	writeIco(icoFrames, path.join(resources, "icon.ico"));

	console.log("Generated icon.png, icon.icns (mac), icon.ico, and resources/icons/*.png");
}

await main();
