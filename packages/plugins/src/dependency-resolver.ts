import { satisfies } from 'semver';
import type { DiscoveredPlugin } from './types.js';
import { CyclicDependencyError, PluginDependencyError } from './errors.js';

/**
 * Builds an adjacency list from plugin manifests.
 * Keys are plugin names, values are arrays of dependency names.
 */
function buildDependencyGraph(
  plugins: DiscoveredPlugin[],
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const p of plugins) {
    const deps = p.manifest.dependencies
      ? Object.keys(p.manifest.dependencies)
      : [];
    graph.set(p.manifest.name, deps);
  }
  return graph;
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns nodes in dependency-first order.
 * Throws CyclicDependencyError if a cycle is detected.
 */
function topologicalSort(
  graph: Map<string, string[]>,
  nodeSet: Set<string>,
): string[] {
  // Compute in-degree for each node (only count edges within nodeSet)
  const inDegree = new Map<string, number>();
  for (const node of nodeSet) {
    inDegree.set(node, 0);
  }

  for (const node of nodeSet) {
    const deps = graph.get(node) ?? [];
    for (const dep of deps) {
      if (nodeSet.has(dep)) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
      }
    }
  }

  // Start with nodes that have no in-degree (no one depends on them from within the set)
  // Actually, we want dependency-first order: nodes with zero in-degree are leaves (depended upon by others).
  // Wait, Kahn's: a node's in-degree = how many edges point TO it.
  // In our graph, an edge from A to B means "A depends on B".
  // In-degree of B = number of plugins that depend on B.
  // Nodes with in-degree 0 have no dependents — they should load LAST.
  // We want dependency-first: B should load before A.
  // So we need to reverse: track out-degree (dependencies) and process nodes whose deps are all resolved.

  // Recompute: for ordering, we need "dependencies resolved first"
  const depCount = new Map<string, number>();
  for (const node of nodeSet) {
    const deps = (graph.get(node) ?? []).filter((d) => nodeSet.has(d));
    depCount.set(node, deps.length);
  }

  const queue: string[] = [];
  for (const [node, count] of depCount) {
    if (count === 0) {
      queue.push(node);
    }
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    // For each other node that depends on `node`, decrement its dep count
    for (const [candidate, deps] of graph) {
      if (!nodeSet.has(candidate)) continue;
      if (deps.includes(node)) {
        const newCount = (depCount.get(candidate) ?? 1) - 1;
        depCount.set(candidate, newCount);
        if (newCount === 0) {
          queue.push(candidate);
        }
      }
    }
  }

  if (sorted.length < nodeSet.size) {
    // Cycle detected — find the cycle participants
    const remaining = [...nodeSet].filter((n) => !sorted.includes(n));
    throw new CyclicDependencyError(remaining);
  }

  return sorted;
}

/**
 * Resolves the load order for plugins based on their declared dependencies.
 * Validates version constraints using semver and detects cycles.
 */
export function resolveDependencyOrder(
  plugins: DiscoveredPlugin[],
): DiscoveredPlugin[] {
  if (plugins.length === 0) return [];

  const pluginMap = new Map<string, DiscoveredPlugin>();
  for (const p of plugins) {
    pluginMap.set(p.manifest.name, p);
  }

  // Validate all dependencies exist and version constraints are satisfied
  for (const p of plugins) {
    if (!p.manifest.dependencies) continue;

    for (const [depName, versionRange] of Object.entries(p.manifest.dependencies)) {
      const dep = pluginMap.get(depName);
      if (!dep) {
        throw new PluginDependencyError(
          `Plugin "${p.manifest.name}" depends on "${depName}" which is not available`,
        );
      }
      if (!satisfies(dep.manifest.version, versionRange)) {
        throw new PluginDependencyError(
          `Plugin "${p.manifest.name}" requires "${depName}@${versionRange}" but found "${dep.manifest.version}"`,
        );
      }
    }
  }

  const graph = buildDependencyGraph(plugins);
  const nodeSet = new Set(pluginMap.keys());
  const ordered = topologicalSort(graph, nodeSet);

  return ordered.map((name) => pluginMap.get(name)!);
}
