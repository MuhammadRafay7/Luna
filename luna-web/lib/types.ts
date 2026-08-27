export type Role = "user" | "assistant";

export type ToolCall = {
  id: string;
  name: string;
  /** Short human-readable summary the server sends with tool.start. */
  context: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  durationS?: number;
  output?: string;
  exitCode?: number;
  error?: string | null;
};

export type Usage = {
  model?: string;
  input?: number;
  output?: number;
  total?: number;
  contextUsed?: number;
  contextMax?: number;
  contextPercent?: number;
};

export type Message = {
  id: string;
  role: Role;
  text: string;
  /** Model reasoning, shown behind a disclosure. */
  reasoning?: string;
  tools: ToolCall[];
  images?: string[];
  usage?: Usage;
  streaming?: boolean;
  error?: string;
};

export type SessionSummary = {
  id: string;
  title: string;
  updatedAt?: number;
  messageCount?: number;
};

export type ApprovalRequest = {
  requestId?: string;
  /** The command or action awaiting a decision. Already redacted server-side. */
  command: string;
  /** Why the guard stopped it, e.g. "delete in root path". */
  rule?: string;
  detail?: string;
  /** Offered choices, in order: once / session / always / deny. */
  choices: string[];
};

export type CronJob = {
  id: string;
  name: string;
  /** What Luna will be asked to do when it fires. */
  prompt: string;
  /** Standard 5-field cron expression. */
  schedule: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: string;
  enabled: boolean;
};

export type Project = {
  slug: string;
  name: string;
  folders: number;
  /** The project new conversations belong to. */
  active: boolean;
};
