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
