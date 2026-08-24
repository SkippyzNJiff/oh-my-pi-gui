import type { RpcCommand } from "../../shared/rpc-types";
import { createComposerStore } from "./composer";
import { createExtensionUiStore } from "./extension-ui";
import { createMessagesStore } from "./messages";
import { createModelStore } from "./model";
import { createPlanApprovalStore } from "./plan-approval";
import { createQueueStore } from "./queue";
import { createSessionStore } from "./session";
import {
	activeTabCommand,
	addRuntimeStore,
	registerSessionRuntime,
	type SessionRuntime,
	sessionRuntime,
} from "./session-runtime-context";
import { createSettingsStore } from "./settings";
import { createSubagentsStore } from "./subagents";
import { createTodoStore } from "./todo";
import { createToolsStore } from "./tools";

export function createTabRuntime(tabId: string): SessionRuntime {
	const command = (rpcCommand: RpcCommand, timeoutMs?: number) =>
		typeof window.omp.rpc.commandForTab === "function"
			? window.omp.rpc.commandForTab(tabId, rpcCommand, timeoutMs)
			: activeTabCommand(rpcCommand, timeoutMs);
	const runtime: SessionRuntime = { tabId, command, stores: new Map() };
	addRuntimeStore(runtime, "composer", createComposerStore());
	addRuntimeStore(runtime, "extensionUi", createExtensionUiStore());
	addRuntimeStore(runtime, "messages", createMessagesStore());
	addRuntimeStore(runtime, "model", createModelStore(command));
	addRuntimeStore(runtime, "planApproval", createPlanApprovalStore());
	addRuntimeStore(runtime, "queue", createQueueStore(command));
	addRuntimeStore(runtime, "session", createSessionStore());
	addRuntimeStore(runtime, "settings", createSettingsStore(command));
	addRuntimeStore(runtime, "subagents", createSubagentsStore(command));
	addRuntimeStore(runtime, "todo", createTodoStore());
	addRuntimeStore(runtime, "tools", createToolsStore());
	return registerSessionRuntime(runtime);
}

export function ensureTabRuntime(tabId: string): SessionRuntime {
	return sessionRuntime(tabId) ?? createTabRuntime(tabId);
}
