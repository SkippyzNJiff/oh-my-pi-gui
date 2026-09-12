import { describe, expect, it } from "vitest";
import { createSessionRpcClient } from "./rpc-client";
import type { RpcResponse } from "./rpc-types";

describe("model RPC timeouts", () => {
	it("gives model switches enough time for provider/session reconfiguration", async () => {
		const calls: Array<{ type: string; timeoutMs: number | undefined }> = [];
		const response: RpcResponse = { type: "response", command: "set_model", success: true };
		const rpc = createSessionRpcClient(async (command, timeoutMs) => {
			calls.push({ type: command.type, timeoutMs });
			return response;
		});

		await rpc.setModel("openai", "gpt-test");
		await rpc.cycleModel();

		expect(calls).toEqual([
			{ type: "set_model", timeoutMs: 30_000 },
			{ type: "cycle_model", timeoutMs: 30_000 },
		]);
	});
});
