/**
 * Theme picker: searchable overlay of the GUI's named themes plus "system".
 * Selecting a theme applies it live, persists the choice, and keeps the
 * legacy dark/light/system store coherent with Settings.
 */
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../lib/i18n";
import { getPersistedThemeSelection, THEMES, type ThemeName } from "../../lib/themes";
import { useUiStore } from "../../stores/ui";
import { Modal } from "../common";
import { ThemePickerList, useThemeCatalog } from "./ThemePickerList";

export function ThemePickerDialog() {
	const t = useT();
	const open = useUiStore(s => s.themePickerOpen);
	const close = useUiStore(s => s.closeThemePicker);

	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const entries = useThemeCatalog();
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return entries;
		return entries.filter(e => e.label.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
	}, [entries, query]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setQuery("");
		setActive(0);
		void getPersistedThemeSelection().then(sel => {
			if (cancelled) return;
			const themeIndex = (Object.keys(THEMES) as ThemeName[]).indexOf(sel as ThemeName);
			setActive(sel === "system" ? 0 : Math.max(0, themeIndex + 1));
		});
		requestAnimationFrame(() => inputRef.current?.focus());
		return () => {
			cancelled = true;
		};
	}, [open]);

	const onKey = (e: React.KeyboardEvent) => {
		if (e.nativeEvent.isComposing || e.keyCode === 229) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActive(i => Math.min(filtered.length - 1, i + 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActive(i => Math.max(0, i - 1));
		} else if (e.key === "Enter") {
			e.preventDefault();
			const button = listRef.current?.querySelector(`[data-index="${active}"]`);
			if (button instanceof HTMLButtonElement) button.click();
		}
	};

	useEffect(() => {
		listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
	}, [active]);

	return (
		<Modal
			open={open}
			onClose={close}
			chromeless
			ariaLabel={t("themePicker.aria")}
			size="picker"
			placement="top"
			bodyClassName="p-0"
		>
			<div onKeyDown={onKey}>
				<div className="flex items-center gap-2 border-b border-[var(--omp-border-muted)] px-4 py-3">
					<Search size={15} className="shrink-0 text-[var(--omp-dim)]" />
					<input
						ref={inputRef}
						value={query}
						onChange={e => {
							setQuery(e.target.value);
							setActive(0);
						}}
						placeholder={t("themePicker.search")}
						className="w-full bg-transparent text-omp-lg text-[var(--omp-text)] outline-none placeholder:text-[var(--omp-dim)]"
					/>
				</div>
				<ThemePickerList query={query} active={active} onActiveChange={setActive} listRef={listRef} />
			</div>
		</Modal>
	);
}
