export type NodeRole = "follower" | "candidate" | "leader";

export interface LogEntry {
  index: number;
  term: number;
  command: string;
}

export type RaftMessageType =
  | "RequestVote"
  | "VoteGranted"
  | "AppendEntries"
  | "AppendResponse";

export interface RequestVotePayload {
  lastLogIndex: number;
  lastLogTerm: number;
}

export interface VoteGrantedPayload {
  granted: boolean;
}

export interface AppendEntriesPayload {
  entries: LogEntry[];
  prevLogIndex: number;
  prevLogTerm: number;
  leaderCommit: number;
  isHeartbeat?: boolean;
}

export interface AppendResponsePayload {
  success: boolean;
  matchIndex: number;
  isHeartbeatResponse?: boolean;
}

export interface RaftMessage<TPayload = unknown> {
  id: string;
  from: string;
  to: string;
  term: number;
  type: RaftMessageType;
  payload?: TPayload;
  respondsTo?: string; // ID of the message this is responding to
}

export interface ClusterNodeState {
  id: string;
  role: NodeRole;
  term: number;
  votedFor?: string;
  log: LogEntry[];
  commitIndex: number;
  electionTimeout: number;
  heartbeatTimeout: number;
  isAlive: boolean;
}

export interface EventLogEntry {
  id: string;
  timestamp: number;
  message: string;
}

export interface ClusterState {
  nodes: ClusterNodeState[];
  messages: RaftMessage[];
  leaderId: string | null;
  term: number;
  tick: number;
  events: EventLogEntry[];
}
