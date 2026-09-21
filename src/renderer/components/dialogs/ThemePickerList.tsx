/**
 * Always-visible GUI theme catalog. Settings embeds this under the section
 * heading; the command-palette picker wraps it in a searchable overlay.
 */
import { Check, Monitor } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cx } from "../../lib/format";
import { useT } from "../../lib/i18n";
import {
	applyThemeByName,
	getPersistedThemeSelection,
	resolveTokenColor,
	THEMES,
	type ThemeName,
	type ThemeSelection,
} from "../../lib/themes";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";

const SWATCH_KEYS = ["--omp-accent", "--omp-syntax-string", "--omp-syntax-function", "--omp-syntax-number"] as const;

export interface ThemeEntry {
	selection: ThemeSelection;
	label: string;
	description: string;
}

export function useThemeCatalog(): ThemeEntry[] {
	const t = useT();
	return useMemo<ThemeEntry[]>(
		() => [
			{ selection: "system", label: t("themePicker.system"), description: t("themePicker.systemDesc") },
			...(Object.keys(THEMES) as ThemeName[]).map(name => ({
				selection: name as ThemeSelection,
				label: t(`themePicker.theme.${name}.label`),
				description: t(`themePicker.theme.${name}.description`),
			})),
		],
		[t],
	);
}

export function ThemePickerList({
	query = "",
	active,
	onActiveChange,
	listRef,
	compact,
}: {
	query?: string;
	active?: number;
	onActiveChange?: (index: number) => void;
	listRef?: React.Ref<HTMLDivElement>;
	compact?: boolean;
}) {
	const t = useT();
	const setTheme = useUiStore(s => s.setTheme);
	const [current, setCurrent] = useState<ThemeSelection>("system");
	const entries = useThemeCatalog();
	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return entries;
		return entries.filter(e => e.label.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
	}, [entries, query]);

	useEffect(() => {
		let cancelled = false;
		void getPersistedThemeSelection().then(sel => {
			if (!cancelled) setCurrent(sel);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const select = (entry: ThemeEntry) => {
		const sel = entry.selection;
		applyThemeByName(sel);
		setTheme(sel === "system" ? "system" : THEMES[sel].scheme);
		setCurrent(sel);
		toast({ variant: "success", message: t("themePicker.applied", { name: entry.label }) });
	};

	if (filtered.length === 0) {
		return (
			<div className="px-3 py-8 text-center text-omp-lg text-[var(--omp-dim)]">{t("themePicker.empty")}</div>
		);
	}

	return (
		<div ref={listRef} className={compact ? "space-y-1" : "omp-command-list overflow-y-auto p-2"} role="listbox">
			{filtered.map((entry, i) => {
				const isSystem = entry.selection === "system";
				const theme = isSystem ? null : THEMES[entry.selection as ThemeName];
				const isCurrent = entry.selection === current;
				const isActive = active === i;
				return (
					<button
						key={entry.selection}
						type="button"
						data-index={i}
						role="option"
						aria-selected={isCurrent}
						onClick={() => select(entry)}
						onMouseEnter={() => onActiveChange?.(i)}
						className={cx(
							"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
							isActive || isCurrent
								? "bg-[var(--omp-selected-bg)]"
								: "hover:bg-[var(--omp-bg-tertiary)]",
							compact &&
								(isCurrent
									? "border border-(--omp-border-accent)"
									: "border border-(--omp-border-muted)"),
						)}
					>
						<span
							aria-hidden="true"
							className="flex h-14 w-24 shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border"
							style={{
								background: theme ? resolveTokenColor(theme, "--omp-bg-primary") : "var(--omp-input-bg)",
								borderColor: theme ? resolveTokenColor(theme, "--omp-border") : "var(--omp-border)",
								color: theme ? resolveTokenColor(theme, "--omp-text") : "var(--omp-text)",
							}}
						>
							{isSystem ? (
								<span className="flex h-full w-full items-center justify-center text-[var(--omp-dim)]">
									<Monitor size={15} />
								</span>
							) : (
								<>
									<span className="font-display text-omp-xl font-medium">Aa</span>
									<span className="flex gap-1">
										{SWATCH_KEYS.map(key => (
											<span
												key={key}
												className="h-1.5 w-3 rounded-full"
												style={{ background: resolveTokenColor(theme!, key) }}
											/>
										))}
									</span>
								</>
							)}
						</span>
						<span className="min-w-0 flex-1">
							<span className="flex items-center gap-2 text-omp-lg font-medium text-[var(--omp-text)]">
								{entry.label}
								{isCurrent && <Check size={14} className="text-[var(--omp-accent)]" />}
							</span>
							<span className="block text-omp-md leading-relaxed text-[var(--omp-muted)]">
								{entry.description}
							</span>
						</span>
					</button>
				);
			})}
		</div>
	);
}
