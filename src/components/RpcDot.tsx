import { motion } from "framer-motion";
import { RpcVisualMessage } from "../simulation/simulationDriver";
import { NodePosition } from "../utils/layout";
import { lerp } from "../utils/animation";

interface RpcDotProps {
  message: RpcVisualMessage;
  from: NodePosition;
  to: NodePosition;
}

const MESSAGE_COLORS: Record<RpcVisualMessage["type"], string> = {
  RequestVote: "#facc15",
  VoteGranted: "#22c55e",
  AppendEntries: "#ef4444",
  AppendResponse: "#10b981",
};

export const RpcDot = ({ message, from, to }: RpcDotProps) => {
  const x = lerp(from.x, to.x, message.progress);
  const y = lerp(from.y, to.y, message.progress);
  return (
    <motion.circle
      key={message.id}
      cx={x}
      cy={y}
      r={6}
      fill={MESSAGE_COLORS[message.type]}
      initial={{ scale: 0.5, opacity: 0.3 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
    />
  );
};
