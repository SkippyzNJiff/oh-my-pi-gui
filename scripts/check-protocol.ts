import * as path from "node:path";
import { $ } from "bun";

const root = path.resolve(import.meta.dir, "../../..");
if (!(await Bun.file(path.join(root, "packages/coding-agent/src/modes/rpc/rpc-types.ts")).exists())) {
	throw new Error(
		"Protocol verification requires the adjacent coding-agent source used to build the bundled sidecar.",
	);
}
const result =
	await $`${path.join(root, "node_modules/.bin/tsgo")} -p ${path.join(import.meta.dir, "protocol/tsconfig.json")} --noEmit`.nothrow();
process.exitCode = result.exitCode;
