import { ClusterState } from "../core/types";

interface SidebarStateProps {
  cluster: ClusterState;
  isRunning: boolean;
  onToggle: () => void;
  onReset: () => void;
  onStep: () => void;
  onAddCommand: () => void;
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
  onStep,
  onAddCommand,
}: SidebarStateProps) => {
  const commitIndex = cluster.nodes.reduce(
    (acc, node) => Math.max(acc, node.commitIndex),
    0
  );

  return (
    <aside className="flex h-full flex-col gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <div>
        <h2 className="text-xl font-semibold">Cluster State</h2>
        <p className="text-sm text-slate-400">
          Term {cluster.term} · Tick {cluster.tick}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Leader" value={cluster.leaderId ?? "—"} />
        <Stat label="Nodes" value={cluster.nodes.length} />
        <Stat label="Commit" value={commitIndex} />
        <Stat label="Messages" value={cluster.messages.length} />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onToggle}
          className="flex-1 rounded-lg bg-indigo-500/80 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
        >
          {isRunning ? "Pause" : "Play"}
        </button>
        <button
          onClick={onStep}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold"
        >
          Step
        </button>
        <button
          onClick={onReset}
          className="rounded-lg border border-rose-500/60 px-4 py-2 text-sm font-semibold text-rose-300"
        >
          Reset
        </button>
      </div>

      <button
        onClick={onAddCommand}
        disabled={!cluster.leaderId}
        className="rounded-lg bg-emerald-500/80 px-4 py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-emerald-500/30"
      >
        Add Command
      </button>

      <p className="text-xs text-slate-500">
        Commands append to the current leader's log and propagate via
        AppendEntries RPCs. Pause the simulation to step through elections in
        slow motion.
      </p>
    </aside>
  );
};
