import { GitBranch, MessageCircleQuestion } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { hydrateSession, hydrateTabSession } from "../../hooks/use-rpc-events";
import { copyText } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { MarkdownRenderer } from "../../lib/markdown";
import { useRuntimeTabId, useTabCommand } from "../../stores/session-runtime-context";
import { toast } from "../../stores/toast";
import { useUiStore } from "../../stores/ui";
import { Button, Modal, Spinner, TextArea } from "../common";

interface BtwResult {
	question: string;
	replyText: string;
	canBranch: boolean;
}

export function BtwDialog() {
	const t = useT();
	const command = useTabCommand();
	const tabId = useRuntimeTabId();
	const generation = useRef(0);
	const [draft, setDraft] = useState("");
	const question = useUiStore(state => state.btwRequest);
	const close = useUiStore(state => state.closeBtw);
	const [result, setResult] = useState<BtwResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [branching, setBranching] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: changing the bound task invalidates the pending answer even if its question is identical.
	useEffect(() => {
		generation.current++;
		setResult(null);
		setError(null);
		setLoading(false);
		setBranching(false);
		setDraft(question ?? "");
		return () => {
			generation.current++;
		};
	}, [question, command]);

	const ask = async () => {
		if (!draft.trim() || loading) return;
		const version = generation.current;
		setError(null);
		setLoading(true);
		try {
			const response = await command({ type: "btw", question: draft.trim() }, 120_000);
			if (generation.current !== version) return;
			if (!response.success) throw new Error(response.error);
			setResult(response.data as BtwResult);
		} catch (cause) {
			if (generation.current === version) setError(String(cause));
		} finally {
			if (generation.current === version) setLoading(false);
		}
	};

	const copyAnswer = async (): Promise<void> => {
		if (!result) return;
		if (!(await copyText(result.replyText))) {
			toast({ variant: "error", message: t("btw.copyFailed") });
			return;
		}
		toast({ variant: "success", message: t("btw.copied") });
	};

	const branch = async (): Promise<void> => {
		if (!result?.canBranch || branching) return;
		const version = generation.current;
		setBranching(true);
		try {
			const response = await command({ type: "btw_branch" });
			if (!response.success) throw new Error(response.error);
			const data = response.data as { cancelled?: boolean } | undefined;
			if (data?.cancelled) {
				toast({ variant: "info", message: t("btw.branchCancelled") });
				return;
			}
			if (tabId) await hydrateTabSession(tabId);
			else await hydrateSession();
			if (version !== generation.current) return;
			close();
			toast({ variant: "success", message: t("btw.branched") });
		} catch (cause) {
			toast({ variant: "error", title: t("btw.branchFailed"), message: String(cause) });
		} finally {
			setBranching(false);
		}
	};

	return (
		<Modal onClose={close} open={question !== null} size="lg" title={t("btw.title")}>
			<div className="mb-4 flex items-start gap-2 rounded-lg border border-(--omp-border-muted) bg-transparent px-3 py-2.5 text-xs text-(--omp-dim)">
				<MessageCircleQuestion className="mt-0.5 shrink-0" size={14} />
				<TextArea
					aria-label={t("btw.title")}
					value={draft}
					onChange={event => {
						setDraft(event.target.value);
						setResult(null);
					}}
					disabled={loading || branching}
					rows={3}
				/>
			</div>
			{loading ? (
				<div className="flex items-center justify-center gap-2 py-16 text-sm text-(--omp-dim)">
					<Spinner size="sm" /> {t("btw.thinking")}
				</div>
			) : error ? (
				<div className="rounded-lg border border-[color-mix(in_srgb,var(--omp-error)_35%,transparent)] bg-transparent p-3 text-sm text-[var(--omp-error)]">
					{error}
				</div>
			) : result ? (
				<div className="max-h-[55vh] overflow-y-auto pr-1">
					<MarkdownRenderer content={result.replyText} />
				</div>
			) : null}
			<div className="mt-5 flex justify-end gap-2 border-t border-(--omp-border-muted) pt-3">
				<Button
					disabled={!draft.trim() || loading || branching}
					loading={loading}
					onClick={() => void ask()}
					size="sm"
				>
					{t("btw.ask")}
				</Button>
				<Button disabled={!result} onClick={() => void copyAnswer()} size="sm" variant="secondary">
					{t("btw.copy")}
				</Button>
				<Button disabled={!result?.canBranch || branching} onClick={() => void branch()} size="sm">
					{branching ? <Spinner size="sm" /> : <GitBranch size={13} />}
					{t("btw.branch")}
				</Button>
			</div>
		</Modal>
	);
}
