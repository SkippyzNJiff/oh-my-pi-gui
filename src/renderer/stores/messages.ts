import { createStore } from "zustand/vanilla";
import type { AgentMessage, AgentSessionEvent, MessagesPage } from "../../shared/rpc-types";
import { createScopedStoreHook } from "./session-runtime-context";

/**
 * Session-tab snapshot of committed history plus the active run overlay. The
 * accumulated strings are sufficient
 * to resume after a tab switch; keeping a second chunk-array copy only made
 * every snapshot and every join progressively more expensive.
 */
export interface MessagesSnapshot {
	messages: AgentMessage[];
	liveMessages: AgentMessage[];
	lastAppended: AgentMessage[];
	streamingMessage: AgentMessage | null;
	streamingText: string;
	streamingThinking: string;
	totalMessages: number;
	nextCursor: string | undefined;
	isLoadingPage: boolean;
}

export interface MessagesStore {
	messages: AgentMessage[];
	/** Uncommitted local echo and message_end deliveries for the active run. */
	liveMessages: AgentMessage[];
	/**
	 * Messages appended by the most recent applyEvents/appendMessage call —
	 * the voice auto-speak watcher's clean signal: hydration/pagination
	 * replaces `messages` wholesale without touching this field, so watchers
	 * only ever see genuinely new finalized messages (never history).
	 */
	lastAppended: AgentMessage[];
	streamingMessage: AgentMessage | null;
	streamingText: string;
	streamingThinking: string;
	totalMessages: number;
	nextCursor: string | undefined;
	isLoadingPage: boolean;
	applyEvents: (events: AgentSessionEvent[]) => void;
	loadPage: (page: MessagesPage) => void;
	appendMessage: (message: AgentMessage) => void;
	removeMessage: (message: AgentMessage) => void;
	appendLiveMessage: (message: AgentMessage) => void;
	removeLiveMessage: (message: AgentMessage) => void;
	/** Clear partial assistant stream buffers without touching committed or live rows. */
	clearStreaming: () => void;
	/** Drop delivered live rows after an idle transcript hydrate; keep unsent local echo. */
	clearDeliveredLiveMessages: () => void;
	/**
	 * Apply a fetched committed transcript. In-flight stable rows are merged by
	 * mergeFetchedTranscript before this replacement.
	 */
	reconcileFetched: (fetched: AgentMessage[]) => void;
	/** Capture the full stream state (fields + buffers) for a session-tab switch. */
	snapshot: () => MessagesSnapshot;
	/** Restore a captured snapshot; null resets to the empty initial state. */
	restoreSnapshot: (snapshot: MessagesSnapshot | null) => void;
	reset: () => void;
}

const initialState = {
	messages: [] as AgentMessage[],
	liveMessages: [] as AgentMessage[],
	lastAppended: [] as AgentMessage[],
	streamingMessage: null as AgentMessage | null,
	streamingText: "",
	streamingThinking: "",
	totalMessages: 0,
	nextCursor: undefined as string | undefined,
	isLoadingPage: false,
};

function isOptimisticUser(message: AgentMessage): boolean {
	return message.role === "user" && message.optimistic === true;
}

function appendLiveMessages(messages: AgentMessage[], delivered: AgentMessage[]): AgentMessage[] {
	let next = messages;
	for (const message of delivered) {
		const optimisticIndex = message.role === "user" ? next.findIndex(isOptimisticUser) : -1;
		if (optimisticIndex >= 0) {
			next = [...next];
			next[optimisticIndex] = message;
			continue;
		}
		next = [...next, message];
	}
	return next;
}

function upsertCommittedMessages(current: AgentMessage[], committed: AgentMessage[]): AgentMessage[] {
	const persisted = committed.filter(message => message.entryId);
	if (persisted.length === 0) return current;
	const indexByEntryId = new Map<string, number>();
	current.forEach((message, index) => {
		if (message.entryId) indexByEntryId.set(message.entryId, index);
	});
	const next = [...current];
	for (const message of persisted) {
		if (!message.entryId) continue;
		const index = indexByEntryId.get(message.entryId);
		if (index === undefined) {
			indexByEntryId.set(message.entryId, next.length);
			next.push(message);
		} else {
			next[index] = message;
		}
	}
	return next;
}

/** Preserve only committed rows appended after a transcript request began. */
export function mergeFetchedTranscript(
	fetched: AgentMessage[],
	before: AgentMessage[],
	current: AgentMessage[],
): AgentMessage[] {
	const prefixIntact =
		current.length >= before.length &&
		before.every((message, index) => {
			const currentMessage = current[index];
			if (!currentMessage) return false;
			return message.entryId || currentMessage.entryId
				? message.entryId !== undefined && message.entryId === currentMessage.entryId
				: message === currentMessage;
		});
	if (!prefixIntact) return fetched;
	const fetchedIds = new Set(fetched.flatMap(message => (message.entryId ? [message.entryId] : [])));
	const tail = current.slice(before.length).filter(message => message.entryId && !fetchedIds.has(message.entryId));
	return tail.length === 0 ? fetched : [...fetched, ...tail];
}

export const createMessagesStore = () =>
	createStore<MessagesStore>()((set, get) => ({
		...initialState,
		applyEvents: events => {
			let textAccum = "";
			let thinkAccum = "";
			const newMessages: AgentMessage[] = [];
			let runMessages: AgentMessage[] | null = null;
			let streamingStart: AgentMessage | null = null;
			let streamingEnd = false;

			for (const event of events) {
				switch (event.type) {
					case "message_start": {
						// The composer already paints an idle user prompt locally. User
						// messages do not stream deltas, so a second live row would flash.
						if (event.message.role === "user" && get().liveMessages.some(isOptimisticUser)) break;
						streamingStart = event.message;
						textAccum = "";
						thinkAccum = "";
						break;
					}
					case "message_update": {
						const { assistantMessageEvent } = event;
						if (assistantMessageEvent.type === "text_delta") {
							textAccum += assistantMessageEvent.delta;
						} else if (assistantMessageEvent.type === "thinking_delta") {
							thinkAccum += assistantMessageEvent.delta;
						}
						break;
					}
					case "message_end": {
						newMessages.push(event.message);
						streamingEnd = true;
						break;
					}
					case "agent_end": {
						// Only this persisted, entry-id-bearing frame owns committed history.
						if (event.messages) {
							runMessages = event.messages;
						}
						break;
					}
					default:
						break;
				}
			}

			// Single set() call per batch — one React re-render
			const state = get();
			const patch: Partial<MessagesStore> = {};

			if (streamingStart) {
				patch.streamingMessage = streamingStart;
				patch.streamingText = "";
				patch.streamingThinking = "";
			}
			if (textAccum) {
				patch.streamingText = `${streamingStart ? "" : state.streamingText}${textAccum}`;
			}
			if (thinkAccum) {
				patch.streamingThinking = `${streamingStart ? "" : state.streamingThinking}${thinkAccum}`;
			}

			let liveMessages = state.liveMessages;
			if (newMessages.length > 0) {
				liveMessages = appendLiveMessages(liveMessages, newMessages);
			}
			let messages = state.messages;
			if (runMessages) {
				messages = upsertCommittedMessages(messages, runMessages);
				liveMessages = [];
			}
			if (liveMessages !== state.liveMessages) patch.liveMessages = liveMessages;
			if (messages !== state.messages) {
				patch.messages = messages;
				patch.totalMessages = messages.length;
				const appended = messages.slice(state.messages.length);
				if (appended.length > 0) patch.lastAppended = appended;
			}

			if (streamingEnd || runMessages) {
				patch.streamingMessage = null;
				patch.streamingText = "";
				patch.streamingThinking = "";
			}

			if (Object.keys(patch).length > 0) {
				set(patch);
			}
		},
		loadPage: page =>
			set({
				messages: page.messages,
				liveMessages: [],
				lastAppended: [],
				totalMessages: page.totalMessages,
				nextCursor: page.nextCursor,
				isLoadingPage: false,
			}),
		appendMessage: message =>
			set(s => ({
				messages: [...s.messages, message],
				lastAppended: [message],
				totalMessages: s.totalMessages + 1,
			})),
		/** Drop a locally appended placeholder (e.g. the composer's running-eval bubble) by identity. */
		removeMessage: message =>
			set(s => {
				const messages = s.messages.filter(entry => entry !== message);
				const removed = s.messages.length - messages.length;
				if (removed === 0) return s;
				return { messages, totalMessages: Math.max(0, s.totalMessages - removed) };
			}),
		appendLiveMessage: message => set(s => ({ liveMessages: [...s.liveMessages, message] })),
		removeLiveMessage: message => set(s => ({ liveMessages: s.liveMessages.filter(entry => entry !== message) })),
		clearStreaming: () => set({ streamingMessage: null, streamingText: "", streamingThinking: "" }),
		clearDeliveredLiveMessages: () => set(s => ({ liveMessages: s.liveMessages.filter(isOptimisticUser) })),
		reconcileFetched: fetched => {
			const current = get().messages;
			if (fetched.length === current.length && fetched.every((message, index) => message === current[index])) return;
			set({ messages: fetched, totalMessages: fetched.length });
		},
		snapshot: () => {
			const state = get();
			return {
				messages: state.messages,
				liveMessages: state.liveMessages,
				lastAppended: state.lastAppended,
				streamingMessage: state.streamingMessage,
				streamingText: state.streamingText,
				streamingThinking: state.streamingThinking,
				totalMessages: state.totalMessages,
				nextCursor: state.nextCursor,
				isLoadingPage: state.isLoadingPage,
			};
		},
		restoreSnapshot: snapshot => {
			if (!snapshot) {
				get().reset();
				return;
			}
			set({
				messages: snapshot.messages,
				liveMessages: snapshot.liveMessages,
				lastAppended: snapshot.lastAppended,
				streamingMessage: snapshot.streamingMessage,
				streamingText: snapshot.streamingText,
				streamingThinking: snapshot.streamingThinking,
				totalMessages: snapshot.totalMessages,
				nextCursor: snapshot.nextCursor,
				isLoadingPage: snapshot.isLoadingPage,
			});
		},
		reset: () => set(initialState),
	}));

const defaultMessagesStore = createMessagesStore();
export const useMessagesStore = createScopedStoreHook("messages", defaultMessagesStore);
