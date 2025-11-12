import { RaftNode } from "./raftNode";
import { ClusterState, RaftMessage } from "./types";

interface PendingStateChange {
  type: "election_start" | "leader_election" | "log_update";
  nodeId: string;
  messageId: string;
  newTerm?: number;
  logEntries?: any[];
  voteGranted?: boolean; // For leader_election: whether the vote was granted
  voteTerm?: number; // For leader_election: the term of the vote
}

export class RaftCluster {
  readonly nodes: Map<string, RaftNode> = new Map();
  private messageQueue: RaftMessage[] = [];
  private recentMessages: RaftMessage[] = [];
  private tickCounter = 0;
  private lastDelta = 100;
  private killedNodes: Set<string> = new Set();
  private pendingStateChanges: Map<string, PendingStateChange> = new Map(); // messageId -> change

  constructor(count: number) {
    for (let i = 0; i < count; i += 1) {
      const id = `N${i + 1}`;
      this.nodes.set(id, new RaftNode(id));
    }
    this.connectPeers();
  }

  tick(deltaMs = 100) {
    this.lastDelta = deltaMs;
    this.tickCounter += 1;
    
    this.nodes.forEach((node, nodeId) => {
      // Skip killed nodes
      if (this.killedNodes.has(nodeId)) {
        return;
      }
      
      const outgoing = node.tick(deltaMs);
      this.enqueueMessages(outgoing);
    });
  }

  deliver() {
    if (!this.messageQueue.length) {
      return;
    }

    const queue = [...this.messageQueue];
    this.messageQueue = [];

    queue.forEach((msg) => {
      // Skip messages from or to killed nodes
      if (this.killedNodes.has(msg.from) || this.killedNodes.has(msg.to)) {
        return;
      }
      
      // Track pending state changes for messages that trigger them
      if (msg.type === "RequestVote") {
        const sender = this.nodes.get(msg.from);
        if (sender && sender.role !== "candidate") {
          // Mark this message as triggering an election start
          // State change will be applied when message starts traveling visually
          this.pendingStateChanges.set(msg.id, {
            type: "election_start",
            nodeId: msg.from,
            messageId: msg.id,
            newTerm: msg.term,
          });
        }
      }
      
      // Track VoteGranted messages - leader state change happens when these complete
      if (msg.type === "VoteGranted") {
        const recipient = this.nodes.get(msg.to);
        const payload = msg.payload as any;
        if (recipient && recipient.role === "candidate" && payload?.granted) {
          // Mark this message as potentially triggering leader election
          // Store vote information so we can check quorum when message completes
          this.pendingStateChanges.set(msg.id, {
            type: "leader_election",
            nodeId: msg.to,
            messageId: msg.id,
            voteTerm: msg.term,
            voteGranted: payload.granted,
          });
        }
      }
      
      const recipient = this.nodes.get(msg.to);
      if (!recipient) {
        return;
      }
      
      // Process the message, but defer state changes for tracked messages
      // We need to process it to get responses, but we'll re-apply state changes later
      const responses = recipient.handleMessage(msg, msg.id);
      this.enqueueMessages(responses);
    });
  }
  
  // Apply pending state changes when messages start/complete their visual journey
  applyPendingStateChanges(startedMessageIds: Set<string>, completedMessageIds: Set<string>) {
    const toApply: PendingStateChange[] = [];
    
    this.pendingStateChanges.forEach((change, messageId) => {
      // For election start, apply when message starts traveling (sender becomes candidate)
      // For leader election and other changes, apply when message completes (receiver processes it)
      if (change.type === "election_start") {
        if (startedMessageIds.has(messageId)) {
          toApply.push(change);
          this.pendingStateChanges.delete(messageId);
        }
      } else {
        if (completedMessageIds.has(messageId)) {
          toApply.push(change);
          this.pendingStateChanges.delete(messageId);
        }
      }
    });
    
    toApply.forEach((change) => {
      const node = this.nodes.get(change.nodeId);
      if (!node || this.killedNodes.has(change.nodeId)) {
        return;
      }
      
      if (change.type === "election_start" && change.newTerm !== undefined) {
        // Apply candidate state change
        (node as any).applyElectionStart(change.newTerm);
      } else if (change.type === "leader_election") {
        // Check if this VoteGranted message should trigger leader election
        // The vote was already recorded in handleMessage, now check quorum
        // We only track this if the vote was granted and node was candidate, so we can trust that
        if (change.voteGranted) {
          // Check if node is still candidate (might have changed if term increased)
          if (node.role === "candidate" && change.voteTerm === node.term) {
            // Vote was already added in handleMessage, now check if quorum is reached
            // All votes that have been delivered are already counted, so we can check quorum now
            if (node.reachedQuorum()) {
              node.becomeLeader();
              // Remove this VoteGranted message from recentMessages to prevent it from being re-exported
              // It was already exported when it was first delivered
              const index = this.recentMessages.findIndex(m => m.id === change.messageId);
              if (index !== -1) {
                this.recentMessages.splice(index, 1);
              }
              // Immediately send heartbeat messages so followers reset their timers
              const heartbeatMessages = node.broadcastHeartbeat();
              this.enqueueMessages(heartbeatMessages);
            }
          }
        }
      }
      // Log updates are handled in handleMessage when message is received
    });
  }

  addNode() {
    const nextId = `N${this.nodes.size + 1}`;
    const node = new RaftNode(nextId);
    this.nodes.set(nextId, node);
    this.connectPeers();
  }

  leader(): RaftNode | null {
    for (const node of Array.from(this.nodes.values())) {
      if (node.role === "leader") {
        return node;
      }
    }
    return null;
  }

  toggleNodeLiveliness(nodeId: string) {
    if (this.killedNodes.has(nodeId)) {
      this.killedNodes.delete(nodeId);
    } else {
      this.killedNodes.add(nodeId);
      // If the node was a leader, it should step down
      const node = this.nodes.get(nodeId);
      if (node && node.role === "leader") {
        node.becomeFollower(node.term);
      }
    }
  }

  exportState(includeMessages = true): ClusterState {
    const snapshots = Array.from(this.nodes.values()).map((node) => {
      const state = node.exportState();
      return {
        ...state,
        isAlive: !this.killedNodes.has(node.id),
      };
    });
    const leader = this.leader();
    const highestTerm = snapshots.reduce(
      (acc, node) => Math.max(acc, node.term),
      0
    );
    const state: ClusterState = {
      nodes: snapshots,
      messages: includeMessages ? [...this.recentMessages] : [],
      leaderId: leader?.id ?? null,
      term: leader?.term ?? highestTerm,
      tick: this.tickCounter,
    };

    if (includeMessages) {
      this.recentMessages = [];
    }
    return state;
  }

  drainRecentMessages(): RaftMessage[] {
    if (!this.recentMessages.length) {
      return [];
    }
    const messages = [...this.recentMessages];
    this.recentMessages = [];
    return messages;
  }

  private connectPeers() {
    const ids = Array.from(this.nodes.keys());
    this.nodes.forEach((node) => node.setPeers(ids));
  }

  enqueueMessages(messages: RaftMessage[]) {
    if (!messages.length) {
      return;
    }
    this.messageQueue.push(...messages);
    this.recentMessages.push(...messages);
  }
}
