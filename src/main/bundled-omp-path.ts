import { existsSync } from "node:fs";
import { join } from "node:path";

/** Filename of the bundled omp sidecar on this platform. */
export function bundledOmpFilename(): string {
	return process.platform === "win32" ? "omp.exe" : "omp";
}

/**
 * Resolve a candidate sidecar path. On Windows we prefer .exe but also accept
 * a bare `omp` (dev drop-ins / cross builds).
 */
export function resolveOmpCandidate(...parts: string[]): string | null {
	const dirOrFile = join(...parts);
	if (existsSync(dirOrFile)) return dirOrFile;
	if (process.platform === "win32" && !dirOrFile.toLowerCase().endsWith(".exe")) {
		const withExe = `${dirOrFile}.exe`;
		if (existsSync(withExe)) return withExe;
	}
	return null;
}
