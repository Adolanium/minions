import type {
  AgentRunSettings,
  AgentToolsetsResponse,
  AnalyticsReport,
  AuxiliaryModelsResponse,
  CompactResult,
  McpProbeResponse,
  McpSaveResponse,
  McpServerInput,
  McpServersResponse,
  ModelInfoResponse,
  ContextUsage,
  GoalDecision,
  GoalStateSnapshot,
  MemoryPathEntry,
  ScheduledTask,
  ScheduledTaskInput,
  SessionMetadata,
  SessionSearchMatch,
  SubagentSession,
  TaskMessage,
} from '../../shared/types.js';

export type { AgentRunSettings, ContextUsage };

export interface AgentRunOptions {
  systemMessage?: string;
  settings?: AgentRunSettings;
  task?: {
    id: string;
    title?: string | null;
  };
}

export interface StreamEvent {
  type: 'text_delta' | 'thinking_delta' | 'tool_progress' | 'done' | 'error';
  content?: string;
  error?: string;
  code?: string;
  sessionId?: string;
  tool?: string;
  status?: 'running' | 'completed' | 'error';
  duration?: number;
  label?: string;
  args?: string;
  result?: string;
  context?: ContextUsage | null;
  interrupted?: boolean;
}

export interface AgentAdapter {
  chat(
    sessionId: string,
    message: string,
    options?: AgentRunOptions,
  ): Promise<{ text: string; sessionId: string }>;

  chatStream(
    sessionId: string,
    message: string,
    options?: AgentRunOptions,
  ): AsyncIterable<StreamEvent>;

  interruptChat(sessionId: string, reason?: string): Promise<boolean>;

  healthCheck(): Promise<boolean>;

  getMessages(sessionId: string, taskId: string): Promise<TaskMessage[]>;

  listToolsets(): Promise<AgentToolsetsResponse>;

  getMemoryPaths(): Promise<{ hermesHome: string; files: MemoryPathEntry[] }>;

  getInsights(days?: number): Promise<AnalyticsReport>;

  getModelInfo(): Promise<ModelInfoResponse>;

  getAuxiliaryModels(): Promise<AuxiliaryModelsResponse>;

  setAuxiliaryModel(slot: string, model: string | null, provider: string | null): Promise<AuxiliaryModelsResponse>;

  listMcpServers(): Promise<McpServersResponse>;

  saveMcpServer(input: McpServerInput): Promise<McpSaveResponse>;

  removeMcpServer(name: string): Promise<McpServersResponse>;

  setMcpServerEnabled(name: string, enabled: boolean): Promise<McpServersResponse>;

  probeMcpServer(name: string): Promise<McpProbeResponse>;

  getSessionMetadata(sessionId: string): Promise<SessionMetadata | null>;

  searchSessions(query: string, limit?: number): Promise<SessionSearchMatch[]>;

  listChildSessions(sessionId: string): Promise<SubagentSession[]>;

  generateTitle(description: string): Promise<{ title: string }>;

  compressSession(
    sessionId: string,
    options?: {
      focusTopic?: string | null;
      currentTokens?: number | null;
      systemMessage?: string;
      settings?: AgentRunSettings;
    },
  ): Promise<CompactResult>;

  getGoalStatus(sessionId: string): Promise<GoalStateSnapshot | null>;

  setGoal(
    sessionId: string,
    goal: string,
    options?: { maxTurns?: number | null },
  ): Promise<GoalStateSnapshot>;

  pauseGoal(sessionId: string, reason?: string): Promise<GoalStateSnapshot | null>;

  resumeGoal(sessionId: string): Promise<GoalStateSnapshot | null>;

  clearGoal(sessionId: string): Promise<boolean>;

  evaluateGoal(sessionId: string, responseText: string): Promise<GoalDecision>;

  listScheduledTasks(includeDisabled?: boolean, limit?: number): Promise<ScheduledTask[]>;

  getScheduledTask(scheduledTaskId: string): Promise<ScheduledTask | null>;

  createScheduledTask(input: ScheduledTaskInput): Promise<ScheduledTask>;

  updateScheduledTask(scheduledTaskId: string, updates: Partial<ScheduledTaskInput>): Promise<ScheduledTask | null>;

  pauseScheduledTask(scheduledTaskId: string, reason?: string): Promise<ScheduledTask | null>;

  resumeScheduledTask(scheduledTaskId: string): Promise<ScheduledTask | null>;

  runScheduledTask(scheduledTaskId: string): Promise<ScheduledTask | null>;

  removeScheduledTask(scheduledTaskId: string): Promise<boolean>;

  tickScheduledTasks(): Promise<number>;
}
