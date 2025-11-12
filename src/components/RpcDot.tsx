import { motion } from "framer-motion";
import { RpcVisualMessage } from "../simulation/simulationDriver";
import { NodePosition } from "../utils/layout";
import { lerp } from "../utils/animation";
import { AppendEntriesPayload } from "../core/types";

interface RpcDotProps {
  message: RpcVisualMessage;
  from: NodePosition;
  to: NodePosition;
  messageLookup?: (id: string) => RpcVisualMessage | undefined;
}

const MESSAGE_COLORS: Record<RpcVisualMessage["type"], string> = {
  RequestVote: "#facc15",
  VoteGranted: "#16a34a",
  AppendEntries: "#ef4444",
  AppendResponse: "#f97316",
};

const HEARTBEAT_COLORS: Record<RpcVisualMessage["type"], string> = {
  RequestVote: "#facc15", // Not used for heartbeats
  VoteGranted: "#22c55e", // Not used for heartbeats
  AppendEntries: "#2563eb", // Blue for heartbeat AppendEntries
  AppendResponse: "#38bdf8", // Lighter blue for heartbeat responses
};

const getMessageColor = (
  message: RpcVisualMessage,
  messageLookup?: (id: string) => RpcVisualMessage | undefined
): string => {
  // Check if this is a heartbeat AppendEntries
  if (message.type === "AppendEntries") {
    const payload = message.payload as AppendEntriesPayload | undefined;
    if (payload?.isHeartbeat) {
      return HEARTBEAT_COLORS[message.type];
    }
  }

  // Check if this is a response to a heartbeat
  // First check the stored flag (most reliable)
  if (message.type === "AppendResponse" && message.isHeartbeatResponse) {
    return HEARTBEAT_COLORS[message.type];
  }

  // Fallback: try to look up the original message if flag is not set
  if (message.type === "AppendResponse" && message.respondsTo && messageLookup) {
    const originalMessage = messageLookup(message.respondsTo);
    if (originalMessage?.type === "AppendEntries") {
      const payload = originalMessage.payload as AppendEntriesPayload | undefined;
      if (payload?.isHeartbeat) {
        return HEARTBEAT_COLORS[message.type];
      }
    }
  }

  return MESSAGE_COLORS[message.type];
};

export const RpcDot = ({ message, from, to, messageLookup }: RpcDotProps) => {
  const x = lerp(from.x, to.x, message.progress);
  const y = lerp(from.y, to.y, message.progress);
  const color = getMessageColor(message, messageLookup);
  
  return (
    <motion.circle
      key={message.id}
      cx={x}
      cy={y}
      r={6}
      fill={color}
      initial={{ scale: 0.5, opacity: 0.3 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2 }}
    />
  );
};
