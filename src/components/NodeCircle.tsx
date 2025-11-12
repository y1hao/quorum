import { motion } from "framer-motion";
import { ClusterNodeState } from "../core/types";

interface NodeCircleProps {
  node: ClusterNodeState;
  x: number;
  y: number;
  isSelected: boolean;
  onHover?: (node: ClusterNodeState | null) => void;
  onClick?: () => void;
}

const ROLE_COLORS: Record<ClusterNodeState["role"], string> = {
  follower: "#3b82f6",
  candidate: "#facc15",
  leader: "#ef4444",
};

export const NodeCircle = ({
  node,
  x,
  y,
  isSelected,
  onHover,
  onClick,
}: NodeCircleProps) => {
  const color = node.isAlive ? ROLE_COLORS[node.role] : "#64748b";
  const opacity = node.isAlive ? 1 : 0.5;
  
  return (
    <motion.g
      initial={{ scale: 0.9 }}
      animate={{ scale: isSelected ? 1.1 : 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      onMouseEnter={() => onHover?.(node)}
      onMouseLeave={() => onHover?.(null)}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <motion.circle
        cx={x}
        cy={y}
        r={34}
        fill={color}
        fillOpacity={opacity}
        stroke={isSelected ? "#f8fafc" : "#0f172a"}
        strokeWidth={isSelected ? 4 : 2}
        strokeOpacity={opacity}
        className="shadow-lg"
      />
      <text
        x={x}
        y={y - 4}
        textAnchor="middle"
        className="font-semibold fill-slate-900"
        fillOpacity={opacity}
      >
        {node.id}
      </text>
      <text
        x={x}
        y={y + 14}
        textAnchor="middle"
        className="text-xs fill-slate-900"
        fillOpacity={opacity}
      >
        T{node.term}
      </text>
      {!node.isAlive && (
        <text
          x={x}
          y={y + 28}
          textAnchor="middle"
          className="text-xs fill-red-500 font-bold"
        >
          ✕
        </text>
      )}
    </motion.g>
  );
};
