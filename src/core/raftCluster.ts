import { RaftNode } from "./raftNode";
import { ClusterState, RaftMessage, AppendEntriesPayload, AppendResponsePayload } from "./types";

interface PendingStateChange {
  type: "election_start" | "leader_election" | "log_update" | "commit_update";
  nodeId: string;
  messageId: string;
  newTerm?: number;
  logEntries?: any[];
  voteGranted?: boolean; // For leader_election: whether the vote was granted
  voteTerm?: number; // For leader_election: the term of the vote
  entryIndex?: number; // For commit_update: the log entry index being committed
}

export class RaftCluster {
  readonly nodes: Map<string, RaftNode> = new Map();
  private messageQueue: RaftMessage[] = [];
  private recentMessages: RaftMessage[] = [];
  private tickCounter = 0;
  private lastDelta = 100;
  private killedNodes: Set<string> = new Set();
  private pendingStateChanges: Map<string, PendingStateChange> = new Map(); // messageId -> change
  private nodeUiStateSnapshots: Map<string, Omit<ClusterNodeState, "isAlive">> = new Map(); // Last known UI state before node was killed
  private revivedNodesPendingHeartbeat: Set<string> = new Set(); // Nodes that came back but haven't received heartbeat yet
  // Track pending commits: entry index -> set of nodes that have confirmed replication
  private pendingCommits: Map<number, Set<string>> = new Map(); // entryIndex -> Set<nodeId>
  private entryIndexByRequestId: Map<string, number> = new Map(); // AppendEntries requestId -> highest entry index
  private pendingCommitUiUpdates: Map<number, number> = new Map(); // entryIndex -> commitIndex before this entry
  private responseSenderByResponseId: Map<string, string> = new Map(); // AppendResponse responseId -> fromNodeId

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
      
      // Track AppendEntries messages
      if (msg.type === "AppendEntries") {
        const recipient = this.nodes.get(msg.to);
        const payload = msg.payload as AppendEntriesPayload;
        
        // If this is a heartbeat to a node that's pending a heartbeat update
        if (recipient && this.revivedNodesPendingHeartbeat.has(msg.to) && payload?.isHeartbeat === true) {
          // Mark this message as updating the UI state when it completes
          this.pendingStateChanges.set(msg.id, {
            type: "log_update",
            nodeId: msg.to,
            messageId: msg.id,
          });
        }
        
        // Track AppendEntries with new entries for commit tracking
        if (payload?.entries && payload.entries.length > 0 && !payload.isHeartbeat) {
          const sender = this.nodes.get(msg.from);
          if (sender && sender.role === "leader") {
            // Track the highest entry index in this request
            const highestIndex = Math.max(...payload.entries.map(e => e.index));
            this.entryIndexByRequestId.set(msg.id, highestIndex);
            
            // Initialize pending commit tracking for new entries if not already tracked
            payload.entries.forEach(entry => {
              if (!this.pendingCommits.has(entry.index)) {
                this.pendingCommits.set(entry.index, new Set());
                // Store the commitIndex before this entry for UI update
                this.pendingCommitUiUpdates.set(entry.index, sender.commitIndex);
              }
            });
          }
        }
      }
      
      // Track AppendResponse messages for commit tracking
      if (msg.type === "AppendResponse") {
        const recipient = this.nodes.get(msg.to);
        const payload = msg.payload as AppendResponsePayload;
        if (recipient && recipient.role === "leader" && payload?.success && msg.respondsTo) {
          // Find which entry index this response is for
          const entryIndex = this.entryIndexByRequestId.get(msg.respondsTo);
          if (entryIndex !== undefined) {
            // Track which node sent this response
            this.responseSenderByResponseId.set(msg.id, msg.from);
            // Mark this response for commit tracking when it completes visually
            // We'll check quorum when the response completes, not when it's delivered
            this.pendingStateChanges.set(msg.id, {
              type: "commit_update",
              nodeId: msg.to, // leader node
              messageId: msg.id,
              entryIndex: entryIndex,
            });
          }
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
      } else if (change.type === "log_update") {
        // This is a heartbeat that completed to a revived node
        // Update the UI state snapshot to reflect the node's current internal state
        // The node's state was already updated in handleMessage, now sync the UI snapshot
        if (this.revivedNodesPendingHeartbeat.has(change.nodeId)) {
          const currentState = node.exportState();
          this.nodeUiStateSnapshots.set(change.nodeId, currentState);
          // Remove from pending set since heartbeat was received
          this.revivedNodesPendingHeartbeat.delete(change.nodeId);
        }
      } else if (change.type === "commit_update" && change.entryIndex !== undefined) {
        // This is an AppendResponse that completed visually
        // Track that this follower has confirmed replication
        const senderNodeId = this.responseSenderByResponseId.get(change.messageId);
        if (!senderNodeId) {
          // Response sender not tracked, skip
          return;
        }
        
        let confirmedNodes = this.pendingCommits.get(change.entryIndex);
        if (!confirmedNodes) {
          confirmedNodes = new Set();
          this.pendingCommits.set(change.entryIndex, confirmedNodes);
        }
        confirmedNodes.add(senderNodeId);
        
        // Check if quorum is reached for this entry
        // The leader already has the entry, so we need (majority - 1) followers to confirm
        const totalNodes = this.nodes.size;
        const majority = Math.floor(totalNodes / 2) + 1;
        // Leader counts as 1, so we need (majority - 1) more followers
        const requiredFollowers = majority - 1;
        
        if (node && node.role === "leader" && confirmedNodes.size >= requiredFollowers) {
          // Quorum reached - update commitIndex
          node.commitIndex = Math.max(node.commitIndex, change.entryIndex);
          // Clean up tracking for this entry
          this.pendingCommits.delete(change.entryIndex);
          this.pendingCommitUiUpdates.delete(change.entryIndex);
          // Clean up request ID mapping
          const requestIdsToRemove: string[] = [];
          this.entryIndexByRequestId.forEach((idx, reqId) => {
            if (idx === change.entryIndex) {
              requestIdsToRemove.push(reqId);
            }
          });
          requestIdsToRemove.forEach(reqId => this.entryIndexByRequestId.delete(reqId));
          // Clean up response sender mapping
          this.responseSenderByResponseId.delete(change.messageId);
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
      // Node is coming back online
      this.killedNodes.delete(nodeId);
      const node = this.nodes.get(nodeId);
      if (node) {
        // Use the stored snapshot (from when it was killed) for UI display
        // If no snapshot exists (shouldn't happen), create one now
        if (!this.nodeUiStateSnapshots.has(nodeId)) {
          const snapshot = node.exportState();
          this.nodeUiStateSnapshots.set(nodeId, snapshot);
        }
        // Mark this node as pending a heartbeat update
        this.revivedNodesPendingHeartbeat.add(nodeId);
      }
    } else {
      // Node is being killed
      // Store the current UI state snapshot BEFORE marking as killed
      const node = this.nodes.get(nodeId);
      if (node) {
        const snapshot = node.exportState();
        this.nodeUiStateSnapshots.set(nodeId, snapshot);
      }
      this.killedNodes.add(nodeId);
      // If the node was a leader, it should step down
      if (node && node.role === "leader") {
        node.becomeFollower(node.term);
      }
      // Remove from pending heartbeat set if it was there
      this.revivedNodesPendingHeartbeat.delete(nodeId);
    }
  }

  exportState(includeMessages = true): ClusterState {
    const snapshots = Array.from(this.nodes.values()).map((node) => {
      const isAlive = !this.killedNodes.has(node.id);
      
      // If node is alive but pending a heartbeat update, use the stored UI snapshot
      // Otherwise, use the current internal state
      if (isAlive && this.revivedNodesPendingHeartbeat.has(node.id)) {
        const uiSnapshot = this.nodeUiStateSnapshots.get(node.id);
        if (uiSnapshot) {
          return {
            ...uiSnapshot,
            isAlive: true,
          };
        }
      }
      
      // Use current internal state
      const state = node.exportState();
      
      // For leaders, if there are pending commits, use the stored commitIndex
      // until the commit is visually confirmed
      if (node.role === "leader" && isAlive) {
        const pendingEntryIndices = Array.from(this.pendingCommits.keys());
        if (pendingEntryIndices.length > 0) {
          // Find the highest entry index that hasn't been committed yet
          const highestPending = Math.max(...pendingEntryIndices);
          const storedCommitIndex = this.pendingCommitUiUpdates.get(highestPending);
          if (storedCommitIndex !== undefined && state.commitIndex > storedCommitIndex) {
            // Use the stored commitIndex (before this entry) until commit is confirmed
            return {
              ...state,
              commitIndex: storedCommitIndex,
              isAlive,
            };
          }
        }
      }
      
      return {
        ...state,
        isAlive,
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
