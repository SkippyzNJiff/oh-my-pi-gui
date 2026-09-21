import { describe, expect, it } from "vitest";
import { bundledOmpFilename } from "./bundled-omp-path";

describe("bundledOmpFilename", () => {
	it("returns omp.exe on win32 and omp elsewhere", () => {
		// we can't flip process.platform easily without stubs; just assert current host
		const name = bundledOmpFilename();
		if (process.platform === "win32") expect(name).toBe("omp.exe");
		else expect(name).toBe("omp");
	});
});
