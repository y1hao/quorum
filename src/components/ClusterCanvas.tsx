import { useState } from "react";
import { line, curveCatmullRomClosed } from "d3";
import { ClusterState, ClusterNodeState } from "../core/types";
import { RpcVisualMessage } from "../simulation/simulationDriver";
import { computeNodePositions, NodePosition } from "../utils/layout";
import { NodeCircle } from "./NodeCircle";
import { RpcDot } from "./RpcDot";
import { NodeTooltip } from "./NodeTooltip";

interface ClusterCanvasProps {
  cluster: ClusterState;
  rpcMessages: RpcVisualMessage[];
  onNodeClick?: (nodeId: string) => void;
}

const WIDTH = 720;
const HEIGHT = 520;
const RADIUS = 200;

export const ClusterCanvas = ({ cluster, rpcMessages, onNodeClick }: ClusterCanvasProps) => {
  const ids = cluster.nodes.map((node) => node.id);
  const positions = computeNodePositions(ids, RADIUS, WIDTH / 2, HEIGHT / 2);

  const hullPath = (() => {
    if (ids.length < 3) {
      return "";
    }
    const generator = line<NodePosition>()
      .curve(curveCatmullRomClosed.alpha(0.8))
      .x((d) => d.x)
      .y((d) => d.y);
    return generator(ids.map((id) => positions[id]));
  })();

  const [hovered, setHovered] = useState<ClusterNodeState | null>(null);
  const hoverPosition = hovered ? positions[hovered.id] : null;

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full">
        <defs>
          <radialGradient id="cluster-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#64748b" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#0f172a" stopOpacity={0.8} />
          </radialGradient>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#cluster-glow)" rx={24} />
        <circle
          cx={WIDTH / 2}
          cy={HEIGHT / 2}
          r={RADIUS + 30}
          fill="none"
          stroke="#1e293b"
          strokeDasharray="6 8"
        />
        {hullPath && (
          <path
            d={hullPath}
            fill="none"
            stroke="#1d4ed8"
            strokeOpacity={0.2}
            strokeWidth={2}
          />
        )}
        {rpcMessages.map((message) => {
          const from = positions[message.from];
          const to = positions[message.to];
          if (!from || !to) {
            return null;
          }
          const messageLookup = (id: string) => rpcMessages.find((m) => m.id === id);
          return (
            <RpcDot
              key={message.id}
              message={message}
              from={from}
              to={to}
              messageLookup={messageLookup}
            />
          );
        })}
        {cluster.nodes.map((node) => {
          const pos = positions[node.id];
          return (
            <NodeCircle
              key={node.id}
              node={node}
              x={pos.x}
              y={pos.y}
              isSelected={hovered?.id === node.id || cluster.leaderId === node.id}
              onHover={setHovered}
              onClick={() => onNodeClick?.(node.id)}
            />
          );
        })}
      </svg>
      {hoverPosition && hovered && (
        <NodeTooltip
          node={hovered}
          x={hoverPosition.x}
          y={hoverPosition.y}
          viewportWidth={WIDTH}
          viewportHeight={HEIGHT}
        />
      )}
    </div>
  );
};
