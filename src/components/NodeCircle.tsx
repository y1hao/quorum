import { motion } from "framer-motion";
import { ClusterNodeState } from "../core/types";

interface NodeCircleProps {
  node: ClusterNodeState;
  x: number;
  y: number;
  isSelected: boolean;
  onHover?: (node: ClusterNodeState | null) => void;
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
}: NodeCircleProps) => {
  const color = ROLE_COLORS[node.role];
  return (
    <motion.g
      initial={{ scale: 0.9 }}
      animate={{ scale: isSelected ? 1.1 : 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      onMouseEnter={() => onHover?.(node)}
      onMouseLeave={() => onHover?.(null)}
    >
      <motion.circle
        cx={x}
        cy={y}
        r={34}
        fill={color}
        stroke={isSelected ? "#f8fafc" : "#0f172a"}
        strokeWidth={isSelected ? 4 : 2}
        className="shadow-lg"
      />
      <text
        x={x}
        y={y - 4}
        textAnchor="middle"
        className="font-semibold fill-slate-900"
      >
        {node.id}
      </text>
      <text
        x={x}
        y={y + 14}
        textAnchor="middle"
        className="text-xs fill-slate-900"
      >
        T{node.term}
      </text>
    </motion.g>
  );
};
