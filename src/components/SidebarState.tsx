import { useState } from "react";
import { ClusterState } from "../core/types";

interface SidebarStateProps {
  cluster: ClusterState;
  isRunning: boolean;
  onToggle: () => void;
  onReset: () => void;
  onAddCommand: (value: string) => void;
}

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
    <p className="text-lg font-semibold">{value}</p>
  </div>
);

export const SidebarState = ({
  cluster,
  isRunning,
  onToggle,
  onReset,
  onAddCommand,
}: SidebarStateProps) => {
  const [inputValue, setInputValue] = useState("");
  const commitIndex = cluster.nodes.reduce(
    (acc, node) => Math.max(acc, node.commitIndex),
    0
  );

  // Find the last committed entry - use the maximum commitIndex across all nodes
  // and find the entry with that index (all nodes should have the same committed entries)
  const lastCommittedEntry = commitIndex > 0
    ? cluster.nodes
        .flatMap((node) => node.log.filter((entry) => entry.index === commitIndex))
        .find((entry) => entry.index === commitIndex)
    : null;

  const lastCommittedValue = lastCommittedEntry?.command ?? null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && cluster.leaderId) {
      onAddCommand(inputValue.trim());
      setInputValue("");
    }
  };

  return (
    <aside className="flex h-full flex-col gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h1 className="text-3xl font-bold">Raft Visualizer</h1>
      <div>
        <h2 className="text-xl font-semibold">
          {lastCommittedValue !== null ? `Last Committed: ${lastCommittedValue}` : "No commits"}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Leader" value={cluster.leaderId ?? "—"} />
        <Stat label="Nodes" value={cluster.nodes.length} />
        <Stat label="Term" value={cluster.term} />
        <Stat label="Commit" value={commitIndex} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Enter value..."
          disabled={!cluster.leaderId}
          className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!cluster.leaderId || !inputValue.trim()}
          className="rounded-lg bg-emerald-500/80 px-4 py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-emerald-500/30"
        >
          Add
        </button>
      </form>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onToggle}
          className="flex-1 rounded-lg bg-indigo-500/80 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
        >
          {isRunning ? "Pause" : "Play"}
        </button>
        <button
          onClick={onReset}
          className="rounded-lg border border-rose-500/60 px-4 py-2 text-sm font-semibold text-rose-300"
        >
          Reset
        </button>
      </div>
    </aside>
  );
};
