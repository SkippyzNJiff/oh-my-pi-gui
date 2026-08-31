import { beforeEach, describe, expect, it } from "vitest";
import type { AgentMessage, AgentSessionEvent } from "../../shared/rpc-types";
import { mergeFetchedTranscript, useMessagesStore } from "./messages";

const streamingMessage: AgentMessage = {
	role: "assistant",
	content: [],
	timestamp: 1,
};

function delta(text: string): AgentSessionEvent {
	return {
		type: "message_update",
		message: streamingMessage,
		assistantMessageEvent: {
			type: "text_delta",
			contentIndex: 0,
			delta: text,
			partial: streamingMessage,
		},
	};
}

function userMessage(entryId: string): AgentMessage {
	return { role: "user", content: entryId, timestamp: Number(entryId.length), entryId };
}

beforeEach(() => useMessagesStore.getState().reset());

describe("messages streaming snapshots", () => {
	it("resumes the accumulated prefix after switching away and back", () => {
		useMessagesStore.getState().applyEvents([{ type: "message_start", message: streamingMessage }, delta("hel")]);
		const snapshot = useMessagesStore.getState().snapshot();

		useMessagesStore.getState().applyEvents([delta("discarded")]);
		useMessagesStore.getState().restoreSnapshot(snapshot);
		useMessagesStore.getState().applyEvents([delta("lo")]);

		expect(useMessagesStore.getState().streamingText).toBe("hello");
	});

	it("starts a new stream from an empty buffer even when the start and delta share a batch", () => {
		useMessagesStore.setState({ streamingText: "old stream" });

		useMessagesStore.getState().applyEvents([{ type: "message_start", message: streamingMessage }, delta("new")]);

		expect(useMessagesStore.getState().streamingText).toBe("new");
	});

	it("clears partial assistant buffers without deleting an optimistic user prompt", () => {
		const optimistic: AgentMessage = { role: "user", content: "send now", timestamp: 2, optimistic: true };
		useMessagesStore.getState().appendLiveMessage(optimistic);
		useMessagesStore.setState({
			streamingMessage,
			streamingText: "partial",
			streamingThinking: "thinking",
		});

		useMessagesStore.getState().clearStreaming();

		expect(useMessagesStore.getState().liveMessages).toEqual([optimistic]);
		expect(useMessagesStore.getState().streamingMessage).toBeNull();
	});
});

describe("committed transcript ownership", () => {
	it("keeps message_end deliveries temporary and commits the turn once by entry id", () => {
		const optimistic: AgentMessage = {
			role: "user",
			content: "question",
			timestamp: 10,
			optimistic: true,
			optimisticAfterEntryId: null,
		};
		const user: AgentMessage = { role: "user", content: "question", timestamp: 10 };
		const assistant: AgentMessage = { role: "assistant", content: "answer", timestamp: 11 };
		useMessagesStore.getState().appendLiveMessage(optimistic);

		useMessagesStore.getState().applyEvents([{ type: "message_end", message: user }]);
		useMessagesStore.getState().applyEvents([{ type: "message_end", message: assistant }]);
		expect(useMessagesStore.getState().messages).toEqual([]);
		expect(useMessagesStore.getState().liveMessages).toEqual([
			{ ...user, optimistic: true, optimisticAfterEntryId: null },
			assistant,
		]);

		useMessagesStore.getState().applyEvents([
			{
				type: "agent_end",
				messages: [
					{ ...user, entryId: "user-entry" },
					{ ...assistant, entryId: "assistant-entry" },
				],
			},
		]);

		expect(useMessagesStore.getState().messages).toEqual([
			{ ...user, entryId: "user-entry" },
			{ ...assistant, entryId: "assistant-entry" },
		]);
		expect(useMessagesStore.getState().liveMessages).toEqual([]);
	});

	it("upserts repeated or maintenance-rewritten settlements by entry id", () => {
		const first = userMessage("entry-1");
		useMessagesStore.getState().applyEvents([{ type: "agent_end", messages: [first] }]);
		const rewritten = { ...first, content: "rewritten" };
		useMessagesStore.getState().applyEvents([{ type: "agent_end", messages: [rewritten] }]);

		expect(useMessagesStore.getState().messages).toEqual([rewritten]);
		expect(useMessagesStore.getState().totalMessages).toBe(1);
	});

	it("does not erase a live response without a persisted replacement", () => {
		const transient: AgentMessage = { role: "custom", customType: "notice", content: "temporary", timestamp: 1 };
		useMessagesStore.getState().applyEvents([{ type: "message_end", message: transient }]);
		useMessagesStore.getState().applyEvents([{ type: "agent_end", messages: [transient] }]);

		expect(useMessagesStore.getState().messages).toEqual([]);
		expect(useMessagesStore.getState().liveMessages).toEqual([transient]);
	});
});

describe("transcript hydration", () => {
	it("preserves a committed tail that arrived while the snapshot was in flight", () => {
		const a = userMessage("a");
		const before = [a];
		const b = userMessage("b");
		const current = [a, b];

		useMessagesStore.getState().reconcileFetched(mergeFetchedTranscript([a], before, current));
		expect(useMessagesStore.getState().messages).toEqual([a, b]);
	});

	it("preserves the tail when an existing committed row was replaced by the same entry id", () => {
		const a = userMessage("a");
		const b = userMessage("b");
		const refreshedA = { ...a, content: "refreshed" };
		const fetchedA = { ...a, content: "fetched" };

		expect(mergeFetchedTranscript([fetchedA], [a], [refreshedA, b])).toEqual([fetchedA, b]);
	});

	it("clears delivered live rows after idle hydration but preserves local echo", () => {
		const optimistic: AgentMessage = { role: "user", content: "pending", timestamp: 1, optimistic: true };
		const delivered: AgentMessage = { role: "assistant", content: "stale", timestamp: 2 };
		useMessagesStore.setState({ liveMessages: [optimistic, delivered] });

		useMessagesStore.getState().clearDeliveredLiveMessages();

		expect(useMessagesStore.getState().liveMessages).toEqual([optimistic]);
	});

	it("retires the live user echo when streaming hydration persists that turn", () => {
		const previous = userMessage("previous-entry");
		const optimistic: AgentMessage = {
			role: "user",
			content: "new question",
			timestamp: 2,
			optimistic: true,
			optimisticAfterEntryId: previous.entryId ?? null,
		};
		const delivered: AgentMessage = { role: "user", content: "new question", timestamp: 3 };
		const persisted = { ...delivered, entryId: "current-entry" };
		useMessagesStore.setState({ messages: [previous], totalMessages: 1 });
		useMessagesStore.getState().appendLiveMessage(optimistic);
		useMessagesStore.getState().applyEvents([{ type: "message_end", message: delivered }]);

		useMessagesStore.getState().reconcileFetched([previous, persisted]);

		expect(useMessagesStore.getState().messages).toEqual([previous, persisted]);
		expect(useMessagesStore.getState().liveMessages).toEqual([]);
	});

	it("replaces a different persisted branch instead of guessing by content or timestamp", () => {
		const a = userMessage("a");
		useMessagesStore.setState({ messages: [a], totalMessages: 1 });
		const next = userMessage("other");
		useMessagesStore.getState().reconcileFetched([next]);
		expect(useMessagesStore.getState().messages).toEqual([next]);
	});
});
