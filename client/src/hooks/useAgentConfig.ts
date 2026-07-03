import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchAgentDefaults, fetchAgentModels, fetchAgentToolsets, fetchTaskAgentSettings, patchTask } from '../lib/api';
import type { AgentRunSettings } from '../lib/api';
import { readCachedAgentDefaults, writeCachedAgentDefaults } from '../lib/agentDefaultsCache';
import type { AgentDefaults, AgentModelGroup, ReasoningEffort } from '@shared/types';

export function useAgentConfig(taskId?: string, initialSettings?: AgentRunSettings) {
  const [defaults, setDefaults] = useState<AgentDefaults | null>(() => readCachedAgentDefaults());
  const [modelGroups, setModelGroups] = useState<AgentModelGroup[]>([]);
  const [toolsetOptions, setToolsetOptions] = useState<string[]>([]);
  const [defaultToolsets, setDefaultToolsets] = useState<string[]>([]);
  const [model, setModel] = useState<string | null>(initialSettings?.model ?? null);
  const [provider, setProvider] = useState<string | null>(initialSettings?.provider ?? null);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort | null>(initialSettings?.reasoningEffort ?? null);
  const [toolsets, setToolsetsState] = useState<string[] | null>(initialSettings?.toolsets ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const initialRef = useRef(initialSettings);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.allSettled([
      taskId ? fetchTaskAgentSettings(taskId) : fetchAgentDefaults(),
      fetchAgentModels(),
      fetchAgentToolsets(),
    ]).then(([settingsResult, modelsResult, toolsetsResult]) => {
      if (cancelled) return;
      if (settingsResult.status === 'fulfilled') {
        const val = settingsResult.value;
        if ('task' in val) {
          writeCachedAgentDefaults(val.defaults);
          setDefaults(val.defaults);
          setModel(val.task.model ?? initialRef.current?.model ?? null);
          setProvider(val.task.provider ?? initialRef.current?.provider ?? null);
          setReasoningEffort(val.task.reasoningEffort ?? initialRef.current?.reasoningEffort ?? null);
          setToolsetsState(val.task.toolsets ?? initialRef.current?.toolsets ?? null);
        } else {
          writeCachedAgentDefaults(val);
          setDefaults(val);
        }
      }
      if (modelsResult.status === 'fulfilled') {
        setModelGroups(modelsResult.value.groups);
      }
      if (toolsetsResult.status === 'fulfilled') {
        setToolsetOptions(toolsetsResult.value.toolsets);
        setDefaultToolsets(toolsetsResult.value.defaultToolsets);
      }
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [taskId]);

  const replaceDefaults = useCallback((d: AgentDefaults) => {
    writeCachedAgentDefaults(d);
    setDefaults(d);
  }, []);

  const setToolsets = useCallback((next: string[] | null) => {
    setToolsetsState(next);
    if (taskId) void patchTask(taskId, { toolsets: next });
  }, [taskId]);

  return {
    defaults,
    modelGroups,
    toolsetOptions,
    defaultToolsets,
    model,
    setModel,
    provider,
    setProvider,
    reasoningEffort,
    setReasoningEffort,
    toolsets,
    setToolsets,
    isLoading,
    replaceDefaults,
  };
}
