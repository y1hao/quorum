import { ClusterNodeState } from "../core/types";

interface NodeTooltipProps {
  node: ClusterNodeState;
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
}

export const NodeTooltip = ({
  node,
  x,
  y,
  viewportHeight,
  viewportWidth,
}: NodeTooltipProps) => {
  const left = `${(x / viewportWidth) * 100}%`;
  const top = `${(y / viewportHeight) * 100}%`;
  return (
    <div
      className="absolute rounded-md bg-slate-900/80 px-3 py-2 text-xs shadow-2xl backdrop-blur"
      style={{ left, top, transform: "translate(12px, -12px)" }}
    >
      <p className="font-semibold">{node.id}</p>
      <p className="text-slate-300">Role: {node.role}</p>
      <p className="text-slate-300">Term: {node.term}</p>
      <p className="text-slate-300">Log: {node.log.length} entries</p>
      <p className="text-slate-300">Commit Index: {node.commitIndex}</p>
    </div>
  );
};
