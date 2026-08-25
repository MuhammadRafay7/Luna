"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  Eye,
  FileText,
  Globe,
  Image,
  Loader2,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ToolCall } from "@/lib/types";

function getToolIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("term") || n.includes("bash") || n.includes("shell")) {
    return <Terminal className="size-3.5" />;
  }
  if (n.includes("file") || n.includes("read") || n.includes("write")) {
    return <FileText className="size-3.5" />;
  }
  if (n.includes("web") || n.includes("search") || n.includes("ddgs")) {
    return <Globe className="size-3.5" />;
  }
  if (n.includes("code") || n.includes("exec")) {
    return <Code className="size-3.5" />;
  }
  if (n.includes("vision") || n.includes("view") || n.includes("see")) {
    return <Eye className="size-3.5" />;
  }
  if (n.includes("memory") || n.includes("remember")) {
    return <Brain className="size-3.5" />;
  }
  if (n.includes("image")) {
    return <Image className="size-3.5" />;
  }
  return <Wrench className="size-3.5" />;
}

export function ToolCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(
    tool.output || tool.error || Object.keys(tool.args).length > 0,
  );

  const isError = tool.status === "error";
  const isRunning = tool.status === "running";

  return (
    <div
      className="overflow-hidden rounded-xl border text-xs transition-colors"
      style={{
        borderColor: isError ? "var(--danger)" : "var(--border)",
        background: "var(--bg-sunken)",
      }}
    >
      <button
        type="button"
        onClick={() => hasDetail && setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
        style={{ cursor: hasDetail ? "pointer" : "default" }}
      >
        <span
          className="flex size-6 items-center justify-center rounded-lg"
          style={{
            background: isError
              ? "color-mix(in srgb, var(--danger) 15%, transparent)"
              : isRunning
                ? "var(--accent-soft)"
                : "var(--bg-hover)",
            color: isError
              ? "var(--danger)"
              : isRunning
                ? "var(--accent)"
                : "var(--text-muted)",
          }}
        >
          {getToolIcon(tool.name)}
        </span>

        <span className="font-semibold" style={{ color: "var(--text)" }}>
          {tool.name}
        </span>

        {tool.context && (
          <span
            className="truncate font-mono text-[11px]"
            style={{ color: "var(--text-muted)", maxWidth: "24rem" }}
          >
            {tool.context}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isRunning && (
            <span
              className="flex items-center gap-1 font-medium"
              style={{ color: "var(--accent)" }}
            >
              <Loader2 className="size-3 animate-spin" /> running…
            </span>
          )}

          {!isRunning && !isError && (
            <span className="flex items-center text-emerald-500" title="Completed">
              <Check className="size-3.5" />
            </span>
          )}

          {isError && (
            <span
              className="flex items-center gap-1 font-medium"
              style={{ color: "var(--danger)" }}
            >
              <AlertTriangle className="size-3.5" /> failed
            </span>
          )}

          {tool.durationS != null && (
            <span className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
              {tool.durationS.toFixed(2)}s
            </span>
          )}

          {hasDetail && (
            <span className="opacity-50">
              {open ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </span>
          )}
        </div>
      </button>

      {open && hasDetail && (
        <div
          className="border-t px-3.5 py-3 text-[11px] font-mono leading-relaxed"
          style={{ borderColor: "var(--border)", background: "var(--bg-raised)" }}
        >
          {Object.keys(tool.args).length > 0 && (
            <div className="mb-2.5">
              <div
                className="mb-1 text-[10px] font-sans font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                Arguments
              </div>
              <pre
                className="overflow-x-auto rounded-lg border p-2"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-sunken)",
                  color: "var(--text-muted)",
                }}
              >
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}

          {tool.output && (
            <div>
              <div
                className="mb-1 text-[10px] font-sans font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                Output
              </div>
              <pre
                className="max-h-64 overflow-auto rounded-lg border p-2 whitespace-pre-wrap"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-sunken)",
                  color: "var(--text)",
                }}
              >
                {tool.output}
              </pre>
            </div>
          )}

          {tool.error && (
            <div className="mt-2">
              <div
                className="mb-1 text-[10px] font-sans font-semibold uppercase tracking-wider"
                style={{ color: "var(--danger)" }}
              >
                Error
              </div>
              <pre
                className="max-h-48 overflow-auto rounded-lg border p-2 whitespace-pre-wrap"
                style={{
                  borderColor: "var(--danger)",
                  background: "var(--bg-sunken)",
                  color: "var(--danger)",
                }}
              >
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
