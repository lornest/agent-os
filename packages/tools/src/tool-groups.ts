/** Static tool group definitions for policy shorthand. */
export const TOOL_GROUPS: Record<string, string[]> = {
  'group:runtime': ['bash'],
  'group:fs': ['read_file', 'write_file', 'edit_file'],
  'group:fs_read': ['read_file'],
  'group:fs_write': ['write_file', 'edit_file'],
  'group:memory': ['memory_search', 'memory_get'],
  'group:mcp': ['use_mcp_tool'],
  'group:orchestration': ['agent_spawn', 'agent_send'],
};

/**
 * Expands group:* entries into constituent tool names.
 * Non-group strings pass through unchanged.
 * Unknown group names pass through as literals.
 */
export function expandGroups(entries: string[]): string[] {
  const result: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('group:') && entry in TOOL_GROUPS) {
      result.push(...TOOL_GROUPS[entry]!);
    } else {
      result.push(entry);
    }
  }
  return result;
}
