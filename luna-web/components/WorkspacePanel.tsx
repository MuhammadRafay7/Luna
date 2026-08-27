"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  FolderKanban,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { CronJob, Project } from "@/lib/types";
import { showToast } from "@/lib/use-toast";

type Tab = "schedules" | "projects";

/** Human-readable gloss for the common cron shapes. */
function describeSchedule(expr: string) {
  const presets: Record<string, string> = {
    "0 9 * * *": "Every day at 9:00",
    "0 8 * * *": "Every day at 8:00",
    "0 18 * * *": "Every day at 18:00",
    "0 9 * * 1": "Mondays at 9:00",
    "0 * * * *": "Every hour",
    "*/30 * * * *": "Every 30 minutes",
    "0 9 1 * *": "1st of each month, 9:00",
  };
  return presets[expr.trim()] ?? expr;
}

const PRESETS = [
  { label: "Every day, 9:00", value: "0 9 * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Mondays, 9:00", value: "0 9 * * 1" },
  { label: "Monthly, 1st", value: "0 9 1 * *" },
];

export function WorkspacePanel({
  onClose,
  listCrons,
  addCron,
  removeCron,
  setCronEnabled,
}: {
  onClose: () => void;
  listCrons: () => Promise<CronJob[]>;
  addCron: (name: string, schedule: string, prompt: string) => Promise<void>;
  removeCron: (name: string) => Promise<void>;
  setCronEnabled: (name: string, enabled: boolean) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("schedules");
  const [loading, setLoading] = useState(true);

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [schedule, setSchedule] = useState(PRESETS[0].value);
  const [projectName, setProjectName] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "schedules") {
        setJobs(await listCrons());
      } else {
        const res = await fetch("/api/luna/projects");
        const data = (await res.json()) as { projects?: Project[]; error?: string };
        if (!res.ok) throw new Error(data.error);
        setProjects(data.projects ?? []);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load.", "error");
    } finally {
      setLoading(false);
    }
  }, [listCrons, tab]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const createJob = async () => {
    if (!name.trim() || !prompt.trim()) return;
    try {
      await addCron(name.trim(), schedule, prompt.trim());
      setName("");
      setPrompt("");
      showToast("Scheduled.", "success");
      void refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not schedule.", "error");
    }
  };

  const projectAction = async (action: string, slug: string) => {
    try {
      const res = await fetch("/api/luna/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, slug }),
      });
      const data = (await res.json()) as { projects?: Project[]; error?: string };
      if (!res.ok) throw new Error(data.error);
      setProjects(data.projects ?? []);
      showToast(
        action === "use" ? "Project activated." : "Project deleted.",
        "success",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update.", "error");
    }
  };

  const createProject = async () => {
    if (!projectName.trim()) return;
    try {
      const res = await fetch("/api/luna/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name: projectName.trim() }),
      });
      const data = (await res.json()) as { projects?: Project[]; error?: string };
      if (!res.ok) throw new Error(data.error);
      setProjects(data.projects ?? []);
      setProjectName("");
      showToast("Project created.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not create.", "error");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh] backdrop-blur-md"
      style={{ background: "rgb(0 0 0 / 0.5)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Schedules and projects"
    >
      <div
        className="luna-glass-strong luna-rise luna-edge-lit flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div
          className="flex items-center gap-1 border-b px-3 py-2.5"
          style={{ borderColor: "color-mix(in srgb, var(--border) 70%, transparent)" }}
        >
          {(
            [
              ["schedules", "Schedules", CalendarClock],
              ["projects", "Projects", FolderKanban],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`luna-pill flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold ${
                tab === key ? "luna-pill-active" : ""
              }`}
              style={{ color: tab === key ? "var(--text)" : "var(--text-muted)" }}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-7 items-center justify-center rounded-full"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div
              className="flex items-center gap-2 px-1 py-6 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <Loader2 className="size-3.5 animate-spin" />
              Loading…
            </div>
          ) : tab === "schedules" ? (
            <>
              {jobs.length === 0 && (
                <p className="px-1 pb-3 text-xs" style={{ color: "var(--text-faint)" }}>
                  Nothing scheduled yet. Luna will run whatever you describe, on time,
                  whether or not this page is open.
                </p>
              )}

              <ul className="space-y-1.5">
                {jobs.map((j) => (
                  <li
                    key={j.id}
                    className="flex items-start gap-3 rounded-2xl px-3.5 py-3"
                    style={{ background: "var(--bg-sunken)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold">{j.name}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px]"
                          style={{
                            background: "var(--accent-soft)",
                            color: "var(--accent)",
                          }}
                        >
                          {describeSchedule(j.schedule)}
                        </span>
                      </div>
                      <p
                        className="mt-1 line-clamp-2 text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {j.prompt}
                      </p>
                      {j.nextRunAt && (
                        <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                          Next: {new Date(j.nextRunAt).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        await setCronEnabled(j.name, !j.enabled);
                        void refresh();
                      }}
                      className="luna-pill px-2.5 py-1 text-[10px] font-semibold"
                      style={{
                        background: j.enabled ? "var(--accent-soft)" : "var(--bg-hover)",
                        color: j.enabled ? "var(--accent)" : "var(--text-faint)",
                      }}
                    >
                      {j.enabled ? "On" : "Off"}
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await removeCron(j.name);
                        void refresh();
                      }}
                      aria-label={`Delete ${j.name}`}
                      className="flex size-6 items-center justify-center rounded-full"
                      style={{ color: "var(--text-faint)" }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>

              {/* New schedule */}
              <div
                className="mt-4 rounded-2xl p-3.5"
                style={{ background: "var(--bg-sunken)" }}
              >
                <p className="mb-2 text-[11px] font-semibold">New schedule</p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name, e.g. Morning briefing"
                  className="mb-2 w-full rounded-xl px-3 py-2 text-xs outline-none"
                  style={{ background: "var(--bg-raised)", color: "var(--text)" }}
                />
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={2}
                  placeholder="What should Luna do? e.g. Summarise my unread email and read it to me."
                  className="mb-2 w-full resize-none rounded-xl px-3 py-2 text-xs outline-none"
                  style={{ background: "var(--bg-raised)", color: "var(--text)" }}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setSchedule(p.value)}
                      className="luna-pill px-2.5 py-1 text-[10px] font-medium"
                      style={{
                        background:
                          schedule === p.value ? "var(--accent)" : "var(--bg-hover)",
                        color:
                          schedule === p.value ? "var(--accent-text)" : "var(--text-muted)",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={createJob}
                    disabled={!name.trim() || !prompt.trim()}
                    className="luna-pill ml-auto flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold disabled:opacity-40"
                    style={{ background: "var(--grad-brand)", color: "var(--accent-text)" }}
                  >
                    <Plus className="size-3" />
                    Schedule
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {projects.length === 0 && (
                <p className="px-1 pb-3 text-xs" style={{ color: "var(--text-faint)" }}>
                  No projects yet. A project is a named workspace that can span several
                  folders. Mark one Active and new conversations belong to it.
                </p>
              )}

              <ul className="space-y-1.5">
                {projects.map((p) => (
                  <li
                    key={p.slug}
                    className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
                    style={{
                      background: "var(--bg-sunken)",
                      backgroundImage: p.active ? "var(--grad-soft)" : undefined,
                    }}
                  >
                    <FolderKanban
                      className="size-4 shrink-0"
                      style={{ color: p.active ? "var(--accent)" : "var(--text-faint)" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{p.name}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {p.slug} · {p.folders} folder{p.folders === 1 ? "" : "s"}
                      </p>
                    </div>

                    {p.active ? (
                      <span
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={{ background: "var(--accent)", color: "var(--accent-text)" }}
                      >
                        <Check className="size-3" />
                        Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void projectAction("use", p.slug)}
                        className="luna-pill px-2.5 py-1 text-[10px] font-semibold"
                        style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}
                      >
                        Use
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void projectAction("archive", p.slug)}
                      aria-label={`Delete ${p.name}`}
                      className="flex size-6 items-center justify-center rounded-full"
                      style={{ color: "var(--text-faint)" }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>

              <div
                className="mt-4 flex items-center gap-2 rounded-2xl p-3.5"
                style={{ background: "var(--bg-sunken)" }}
              >
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void createProject()}
                  placeholder="New project name"
                  className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
                  style={{ background: "var(--bg-raised)", color: "var(--text)" }}
                />
                <button
                  type="button"
                  onClick={createProject}
                  disabled={!projectName.trim()}
                  className="luna-pill flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold disabled:opacity-40"
                  style={{ background: "var(--grad-brand)", color: "var(--accent-text)" }}
                >
                  <Plus className="size-3" />
                  Create
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
