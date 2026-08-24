import { useMemo } from "react";
import type { ImageContent, RpcResponse, ThinkingLevel, TodoPhase } from "../../shared/rpc-types";
import { activeTabCommand, type TabCommand, useSessionRuntime } from "../stores/session-runtime-context";

export interface TabRpc {
	prompt(message: string, images?: ImageContent[], streamingBehavior?: "steer" | "followUp"): Promise<RpcResponse>;
	steer(message: string, images?: ImageContent[]): Promise<RpcResponse>;
	followUp(message: string, images?: ImageContent[]): Promise<RpcResponse>;
	abort(): Promise<RpcResponse>;
	abortAndPrompt(message: string): Promise<RpcResponse>;
	abortRetry(): Promise<RpcResponse>;
	bash(command: string, excluded?: boolean): Promise<RpcResponse>;
	eval(code: string, language?: "python" | "js" | "ruby" | "julia", excluded?: boolean): Promise<RpcResponse>;
	abortEval(): Promise<RpcResponse>;
	compact(): Promise<RpcResponse>;
	clearContext(): Promise<RpcResponse>;
	branch(entryId: string): Promise<RpcResponse>;
	forkFrom(entryId: string): Promise<RpcResponse>;
	getSessionTree(): Promise<RpcResponse>;
	dequeue(): Promise<RpcResponse>;
	getTranscript(): Promise<RpcResponse>;
	getContextReport(): Promise<RpcResponse>;
	getAvailableCommands(): Promise<RpcResponse>;
	getCommandArgCompletions(command: string, prefix: string): Promise<RpcResponse>;
	writeLocalPaste(content: string): Promise<RpcResponse>;
	queueRemove(queueId: string): Promise<RpcResponse>;
	setPlanMode(enabled: boolean): Promise<RpcResponse>;
	setThinkingLevel(level: ThinkingLevel | "auto"): Promise<RpcResponse>;
	getPlanMode(): Promise<RpcResponse>;
	setAutoCompaction(enabled: boolean): Promise<RpcResponse>;
	setAutoRetry(enabled: boolean): Promise<RpcResponse>;
	setSteeringMode(mode: "all" | "one-at-a-time"): Promise<RpcResponse>;
	setInterruptMode(mode: "immediate" | "wait"): Promise<RpcResponse>;
	setTodos(phases: TodoPhase[]): Promise<RpcResponse>;
	setGoal(args: {
		objective?: string;
		tokenBudget?: number | null;
		action?: "pause" | "resume" | "drop";
	}): Promise<RpcResponse>;
}

export function createTabRpc(command: TabCommand): TabRpc {
	return {
		prompt: (message, images, streamingBehavior) => command({ type: "prompt", message, images, streamingBehavior }),
		steer: (message, images) => command({ type: "steer", message, images }),
		followUp: (message, images) => command({ type: "follow_up", message, images }),
		abort: () => command({ type: "abort" }),
		abortAndPrompt: message => command({ type: "abort_and_prompt", message }),
		abortRetry: () => command({ type: "abort_retry" }),
		bash: (shellCommand, excluded) => command({ type: "bash", command: shellCommand, excluded }),
		eval: (code, language, excluded) => command({ type: "eval", code, language, excluded }),
		abortEval: () => command({ type: "abort_eval" }),
		compact: () => command({ type: "compact" }),
		clearContext: () => command({ type: "clear_context" }),
		branch: entryId => command({ type: "branch", entryId }),
		forkFrom: entryId => command({ type: "fork_from", entryId }),
		getSessionTree: () => command({ type: "get_session_tree" }),
		dequeue: () => command({ type: "dequeue" }),
		getTranscript: () => command({ type: "get_transcript" }),
		getContextReport: () => command({ type: "get_context_report" }),
		getAvailableCommands: () => command({ type: "get_available_commands" }),
		getCommandArgCompletions: (commandName, prefix) =>
			command({ type: "get_command_arg_completions", command: commandName, prefix }),
		writeLocalPaste: content => command({ type: "write_local_paste", content }),
		queueRemove: queueId => command({ type: "queue_remove", queueId }),
		setPlanMode: enabled => command({ type: "set_plan_mode", enabled }),
		setThinkingLevel: level => command({ type: "set_thinking_level", level }),
		getPlanMode: () => command({ type: "get_plan_mode" }),
		setAutoCompaction: enabled => command({ type: "set_auto_compaction", enabled }),
		setAutoRetry: enabled => command({ type: "set_auto_retry", enabled }),
		setSteeringMode: mode => command({ type: "set_steering_mode", mode }),
		setInterruptMode: mode => command({ type: "set_interrupt_mode", mode }),
		setTodos: phases => command({ type: "set_todos", phases }),
		setGoal: args => command({ type: "set_goal", ...args }),
	};
}

export function useTabRpc(): TabRpc {
	const runtime = useSessionRuntime();
	return useMemo(() => {
		if (runtime) return createTabRpc(runtime.command);
		return typeof window !== "undefined" && window.omp?.rpc ? window.omp.rpc : createTabRpc(activeTabCommand);
	}, [runtime]);
}
