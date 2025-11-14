import { useState } from "react";
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
const HEIGHT = 720;
const RADIUS = 260;

export const ClusterCanvas = ({ cluster, rpcMessages, onNodeClick }: ClusterCanvasProps) => {
  const ids = cluster.nodes.map((node) => node.id);
  const positions = computeNodePositions(ids, RADIUS, WIDTH / 2, HEIGHT / 2);

  // Generate arc paths connecting each node to its neighbors along the circle
  const neighborConnections = (() => {
    if (ids.length < 2) {
      return [];
    }
    const connections: Array<{ path: string }> = [];
    for (let i = 0; i < ids.length; i++) {
      const currentId = ids[i];
      const nextId = ids[(i + 1) % ids.length];
      const currentPos = positions[currentId];
      const nextPos = positions[nextId];
      if (currentPos && nextPos) {
        // Create an arc path along the circle
        // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
        // large-arc-flag: 0 (use smaller arc)
        // sweep-flag: 1 (clockwise)
        const path = `M ${currentPos.x} ${currentPos.y} A ${RADIUS} ${RADIUS} 0 0 1 ${nextPos.x} ${nextPos.y}`;
        connections.push({ path });
      }
    }
    return connections;
  })();

  const [hovered, setHovered] = useState<ClusterNodeState | null>(null);
  const hoverPosition = hovered ? positions[hovered.id] : null;

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full">
        <defs>
          <radialGradient id="cluster-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#64748b" stopOpacity={0.25} />
            <stop offset="50%" stopColor="#475569" stopOpacity={0.12} />
            <stop offset="100%" stopColor="transparent" stopOpacity={0} />
          </radialGradient>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#cluster-glow)" rx={24} />
        {neighborConnections.map((connection, index) => (
          <path
            key={`connection-${index}`}
            d={connection.path}
            fill="none"
            stroke="#1d4ed8"
            strokeOpacity={0.2}
            strokeWidth={2}
          />
        ))}
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
