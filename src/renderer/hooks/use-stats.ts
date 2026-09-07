import { useCallback, useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 30_000;

interface StatsState<T> {
	key: string;
	data: T | null;
	isLoading: boolean;
	error: string | null;
	updatedAt: number | null;
}

/** One visible query at a time; stale responses never cross a path/range boundary. */
export function useStats<T>(path: string, params?: Record<string, string>) {
	const serializedParams = JSON.stringify(Object.entries(params ?? {}).sort(([a], [b]) => a.localeCompare(b)));
	const key = `${path}:${serializedParams}`;
	const [state, setState] = useState<StatsState<T>>({
		key,
		data: null,
		isLoading: true,
		error: null,
		updatedAt: null,
	});
	const fetchRef = useRef<() => void>(() => {});
	const refetch = useCallback(() => fetchRef.current(), []);

	useEffect(() => {
		let active = true;
		let inFlight = false;
		const queryParams = Object.fromEntries(JSON.parse(serializedParams) as [string, string][]);
		const load = async () => {
			if (!active || inFlight) return;
			inFlight = true;
			setState(previous =>
				previous.key === key
					? { ...previous, isLoading: previous.data === null }
					: { key, data: null, isLoading: true, error: null, updatedAt: null },
			);
			try {
				const result = await window.omp.stats.fetch(path, queryParams);
				if (result && typeof result === "object" && "error" in result && typeof result.error === "string")
					throw new Error(result.error);
				if (active) setState({ key, data: result as T, isLoading: false, error: null, updatedAt: Date.now() });
			} catch (cause) {
				if (active) setState(previous => ({ ...previous, isLoading: false, error: String(cause) }));
			} finally {
				inFlight = false;
			}
		};
		fetchRef.current = () => void load();
		const refreshVisible = () => {
			if (document.visibilityState !== "hidden") void load();
		};
		void load();
		const timer = window.setInterval(refreshVisible, POLL_INTERVAL_MS);
		document.addEventListener("visibilitychange", refreshVisible);
		return () => {
			active = false;
			window.clearInterval(timer);
			document.removeEventListener("visibilitychange", refreshVisible);
		};
	}, [key, path, serializedParams]);

	return state.key === key
		? { ...state, refetch }
		: { key, data: null, isLoading: true, error: null, updatedAt: null, refetch };
}
