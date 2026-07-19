"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Image } from "antd";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

type Props = {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    className?: string;
    style?: CSSProperties;
    placeholder?: string;
};

export type PromptToken = { type: "text"; value: string } | { type: "reference"; nodeId: string };

export function parsePromptTokens(value: string): PromptToken[] {
    const tokens: PromptToken[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(/@\[node:([^\]]+)\]/g)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) tokens.push({ type: "text", value: value.slice(lastIndex, match.index) });
        tokens.push({ type: "reference", nodeId: match[1] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) tokens.push({ type: "text", value: value.slice(lastIndex) });
    return tokens;
}

export function serializePromptTokens(tokens: PromptToken[]) {
    return tokens.map((token) => (token.type === "reference" ? `@[node:${token.nodeId}]` : token.value)).join("");
}

type MentionState = { query: string; rect: DOMRect | null };

export function CanvasPromptChipInput({ value, references, onChange, onSubmit, className, style, placeholder }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const editorRef = useRef<HTMLDivElement>(null);
    const composingRef = useRef(false);
    const lastEmittedRef = useRef(value);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const activeReferences = useMemo(() => references.filter((item) => item.active), [references]);
    const referenceByNodeId = useMemo(() => new Map(activeReferences.map((item) => [item.nodeId, item])), [activeReferences]);
    const tokens = useMemo(() => parsePromptTokens(value), [value]);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        if (!query) return activeReferences;
        return activeReferences.filter((item) => `${item.label} ${item.title} ${item.kind} ${item.text || ""}`.toLowerCase().includes(query));
    }, [activeReferences, mention]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || (document.activeElement === editor && value === lastEmittedRef.current)) return;
        editor.textContent = "";
        tokens.forEach((token) => {
            if (token.type === "text") editor.append(document.createTextNode(token.value));
            else {
                const reference = referenceByNodeId.get(token.nodeId);
                editor.append(reference ? createReferenceChip(reference, theme, setImagePreview) : document.createTextNode(`@[node:${token.nodeId}]`));
            }
        });
        lastEmittedRef.current = value;
    }, [referenceByNodeId, theme, tokens, value]);

    const emit = (next: string) => {
        lastEmittedRef.current = next;
        onChange(next);
    };

    const syncMention = () => {
        const text = textBeforeCaret();
        const match = /@([^\s@]*)$/.exec(text);
        if (!match || !activeReferences.length) {
            setMention(null);
            setActiveIndex(0);
            return;
        }
        setMention({ query: match[1] || "", rect: caretRect() });
        setActiveIndex(0);
    };

    const insertReference = (reference: CanvasResourceReference) => {
        const editor = editorRef.current;
        if (!editor) return;
        removeActiveMention();
        const chip = createReferenceChip(reference, theme, setImagePreview);
        const space = document.createTextNode(" ");
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (range) {
            range.insertNode(space);
            range.insertNode(chip);
            range.setStartAfter(space);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
        } else {
            editor.append(chip, space);
            placeCaretAtEnd(editor);
        }
        setMention(null);
        setActiveIndex(0);
        emit(serializeEditor(editor));
    };

    return (
        <div className="relative w-full">
            {!value.trim() && placeholder ? <div className="pointer-events-none absolute left-3 top-2 text-sm leading-5" style={{ color: theme.node.placeholder }}>{placeholder}</div> : null}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                className={`${className || ""} overflow-y-auto whitespace-pre-wrap break-words outline-none`}
                style={{ ...style, cursor: "text" }}
                onInput={() => {
                    if (!composingRef.current) {
                        emit(serializeEditor(editorRef.current!));
                        syncMention();
                    }
                }}
                onCompositionStart={() => {
                    composingRef.current = true;
                }}
                onCompositionEnd={() => {
                    composingRef.current = false;
                    emit(serializeEditor(editorRef.current!));
                    syncMention();
                }}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    event.stopPropagation();
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (mention && candidates.length) {
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setActiveIndex((index) => (index + 1) % candidates.length);
                            return;
                        }
                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
                            return;
                        }
                        if (event.key === "Enter") {
                            event.preventDefault();
                            insertReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                            return;
                        }
                        if (event.key === "Escape") {
                            event.preventDefault();
                            setMention(null);
                            return;
                        }
                    }
                    if ((event.key === "Backspace" || event.key === "Delete") && deleteAdjacentReference(event.key)) {
                        event.preventDefault();
                        requestAnimationFrame(() => emit(serializeEditor(editorRef.current!)));
                        return;
                    }
                    if (event.key === "Enter" && onSubmit && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                        event.preventDefault();
                        onSubmit();
                        return;
                    }
                    requestAnimationFrame(syncMention);
                }}
                onBlur={() => window.setTimeout(() => setMention(null), 120)}
            />
            {mention && candidates.length ? <MentionMenu rect={mention.rect} references={candidates} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} /> : null}
            {imagePreview ? <Image src={imagePreview} alt="引用图片预览" style={{ display: "none" }} preview={{ visible: true, src: imagePreview, onVisibleChange: (visible) => !visible && setImagePreview(null) }} /> : null}
        </div>
    );
}

function MentionMenu({ rect, references, activeIndex, theme, onSelect }: { rect: DOMRect | null; references: CanvasResourceReference[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelect: (reference: CanvasResourceReference) => void }) {
    const activeItemRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        activeItemRef.current?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, references]);
    const anchor = rect || new DOMRect(16, 16, 0, 0);
    const menuWidth = 256;
    const maxMenuHeight = 224;
    const left = clamp(anchor.left, 8, window.innerWidth - menuWidth - 8);
    const top = anchor.bottom + 6 + maxMenuHeight > window.innerHeight && anchor.top - 6 - maxMenuHeight >= 0 ? anchor.top - 6 - maxMenuHeight : anchor.bottom + 6;
    return createPortal(
        <div className="fixed z-[120] max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md" style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            {references.map((reference, index) => (
                <button key={reference.id} ref={index === activeIndex ? activeItemRef : undefined} type="button" className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition" style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onSelect(reference); }}>
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1"><span className="block font-medium">{reference.label}</span><span className="block truncate opacity-65">{reference.text || reference.title}</span></span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className="size-9 rounded-md object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10"><Icon className="size-4" /></span>;
}

function createReferenceChip(reference: CanvasResourceReference, theme: (typeof canvasThemes)[keyof typeof canvasThemes], onImagePreview: (url: string) => void) {
    const wrapper = document.createElement("span");
    wrapper.contentEditable = "false";
    wrapper.dataset.refNodeId = reference.nodeId;
    if (reference.kind === "image" && reference.previewUrl) {
        const image = document.createElement("img");
        image.src = reference.previewUrl;
        image.alt = reference.title;
        image.className = "size-6 rounded object-cover";
        wrapper.className = "mx-px inline-flex size-6 items-center justify-center overflow-hidden rounded align-middle";
        wrapper.appendChild(image);
        wrapper.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onImagePreview(reference.previewUrl || "");
        });
    } else {
        wrapper.className = "mx-px inline-flex h-6 max-w-40 items-center justify-center overflow-hidden rounded-md border px-1 text-xs leading-none align-middle";
        Object.assign(wrapper.style, { background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text });
        wrapper.title = reference.text || reference.title;
        const text = document.createElement("span");
        text.className = "block truncate";
        text.textContent = reference.kind === "text" ? reference.text || reference.title : reference.label;
        wrapper.appendChild(text);
    }
    return wrapper;
}

function serializeEditor(editor: HTMLElement) {
    return serializeNodes(editor.childNodes).replace(/\uFEFF/g, "");
}

function serializeNodes(nodes: NodeListOf<ChildNode>): string {
    let result = "";
    nodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent || "";
            return;
        }
        if (!(node instanceof HTMLElement)) return;
        if (node.dataset.refNodeId) result += `@[node:${node.dataset.refNodeId}]`;
        else if (node.tagName === "BR") result += "\n";
        else result += serializeNodes(node.childNodes);
    });
    return result;
}

function removeActiveMention() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = textBeforeCaret();
    const match = /@([^\s@]*)$/.exec(text);
    if (!match) return;
    range.setStart(range.startContainer, Math.max(0, range.startOffset - (match[1] || "").length - 1));
    range.deleteContents();
}

function deleteAdjacentReference(key: string) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    const offset = range.startOffset;
    const previous = key === "Backspace";
    if (container.nodeType === Node.TEXT_NODE && ((previous && offset > 0) || (!previous && offset < (container.textContent || "").length))) return false;
    const children = Array.from(container.childNodes);
    const target = container.nodeType === Node.TEXT_NODE ? (previous ? container.previousSibling : container.nextSibling) : children[previous ? offset - 1 : offset];
    if (!(target instanceof HTMLElement) || !target.dataset.refNodeId) return false;
    const caret = document.createTextNode("");
    target.replaceWith(caret);
    range.setStart(caret, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function textBeforeCaret() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const range = selection.getRangeAt(0).cloneRange();
    const editor = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest("[contenteditable='true']");
    if (!editor) return "";
    range.setStart(editor, 0);
    return range.toString();
}

function caretRect() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height || rect.left || rect.top) return rect;
    const editor = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest("[contenteditable='true']");
    return editor?.getBoundingClientRect() || null;
}

function placeCaretAtEnd(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

function clamp(value: number, min: number, max: number) {
    return max < min ? min : Math.min(Math.max(value, min), max);
}
