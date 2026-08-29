import type { SessionTab } from "../stores/tabs";

export interface TabSignalPresentation {
	active: boolean;
	color: string;
	labelKey: string;
	running: boolean;
}

export function tabSignalPresentation(tab: SessionTab, activeRuntime = false): TabSignalPresentation {
	const running = tab.status === "running" || tab.compacting === true || activeRuntime;
	if (running) {
		return { active: true, color: "var(--omp-accent)", labelKey: "titlebar.status.working", running: true };
	}
	if (tab.unreadDone) {
		return { active: false, color: "var(--omp-success)", labelKey: "tabs.done", running: false };
	}
	if (tab.status === "ready") {
		return { active: false, color: "var(--omp-dim)", labelKey: "titlebar.status.ready", running: false };
	}
	if (tab.status === "starting") {
		return { active: true, color: "var(--omp-warning)", labelKey: "titlebar.status.connecting", running: false };
	}
	return {
		active: tab.status === "restarting",
		color: tab.status === "error" || tab.status === "exited" ? "var(--omp-error)" : "var(--omp-warning)",
		labelKey: `titlebar.status.${tab.status}`,
		running: false,
	};
}
