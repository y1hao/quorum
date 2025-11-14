import { RaftNode } from "./raftNode";
import { ClusterState, ClusterNodeState, RaftMessage, AppendEntriesPayload, AppendResponsePayload, EventLogEntry } from "./types";

interface PendingStateChange {
  type: "election_start" | "leader_election" | "log_update" | "commit_update";
  nodeId: string;
  messageId: string;
  newTerm?: number;
  logEntries?: any[];
  voteGranted?: boolean; // For leader_election: whether the vote was granted
  voteTerm?: number; // For leader_election: the term of the vote
  entryIndex?: number; // For commit_update: the log entry index being committed
  wasPreviousLeader?: boolean; // For log_update: whether the node was a previous leader
  newLeaderId?: string; // For log_update: the ID of the new leader
}

export class RaftCluster {
  readonly nodes: Map<string, RaftNode> = new Map();
  private messageQueue: RaftMessage[] = [];
  private recentMessages: RaftMessage[] = [];
  private tickCounter = 0;
  private killedNodes: Set<string> = new Set();
  private pendingStateChanges: Map<string, PendingStateChange> = new Map(); // messageId -> change
  private nodeUiStateSnapshots: Map<string, Omit<ClusterNodeState, "isAlive">> = new Map(); // Last known UI state before node was killed
  private revivedNodesPendingHeartbeat: Set<string> = new Set(); // Nodes that came back but haven't received heartbeat yet
  // Track pending commits: entry index -> set of nodes that have confirmed replication
  private pendingCommits: Map<number, Set<string>> = new Map(); // entryIndex -> Set<nodeId>
  private entryIndexByRequestId: Map<string, number> = new Map(); // AppendEntries requestId -> highest entry index
  private pendingCommitUiUpdates: Map<number, number> = new Map(); // entryIndex -> commitIndex before this entry
  private responseSenderByResponseId: Map<string, string> = new Map(); // AppendResponse responseId -> fromNodeId
  private eventLog: EventLogEntry[] = [];
  private voteCountsByCandidate: Map<string, { term: number; votes: Set<string> }> = new Map(); // candidateId -> { term, votes }
  private entryReplicationCounts: Map<number, Set<string>> = new Map(); // entryIndex -> Set<nodeId> that have replicated
  private entryValuesByIndex: Map<number, string> = new Map(); // entryIndex -> entry command value
  private loggedElections: Set<string> = new Set(); // Track logged elections: "nodeId-term"

  /**
   * Creates a new Raft cluster with the specified number of nodes.
   * 
   * @param count - Number of nodes to create in the cluster. Nodes are named N1, N2, N3, etc.
   */
  constructor(count: number) {
    for (let i = 0; i < count; i += 1) {
      const id = `N${i + 1}`;
      this.nodes.set(id, new RaftNode(id));
    }
    this.connectPeers();
  }

  /**
   * Advance the cluster simulation by one tick.
   * 
   * @param deltaMs - Milliseconds elapsed since last tick. Defaults to 100ms.
   *                  This parameter is passed through to all nodes and allows:
   *                  - Tests to simulate time passing faster (e.g., tick(2000) for 2 seconds)
   *                  - Production code to use SIMULATION_TICK_INTERVAL_MS for consistent timing
   */
  tick(deltaMs = 100) {
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

  /**
   * Delivers all queued messages to their recipients.
   * 
   * Processes messages from the message queue, handling state changes and tracking
   * pending updates for visual synchronization. Messages are delivered to nodes,
   * and responses are automatically enqueued. State changes are deferred until
   * messages complete their visual journey (see applyPendingStateChanges).
   */
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
      switch (msg.type) {
        case "RequestVote":
          this.handleRequestVoteTracking(msg);
          break;
        case "VoteGranted":
          this.handleVoteGrantedTracking(msg);
          break;
        case "AppendEntries":
          this.handleAppendEntriesTracking(msg);
          break;
        case "AppendResponse":
          this.handleAppendResponseTracking(msg);
          break;
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
  
  /**
   * Applies pending state changes when messages start or complete their visual journey.
   * 
   * This method synchronizes node state changes with the visual animation of messages.
   * State changes are deferred from delivery() until messages are visually started/completed
   * to ensure the UI accurately reflects the Raft algorithm's behavior.
   * 
   * @param startedMessageIds - Set of message IDs that have started traveling visually
   * @param completedMessageIds - Set of message IDs that have completed traveling visually
   */
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
      
      switch (change.type) {
        case "election_start":
          if (change.newTerm !== undefined) {
            this.applyElectionStartChange(change, node);
          }
          break;
        case "leader_election":
          this.applyLeaderElectionChange(change, node);
          break;
        case "log_update":
          this.applyLogUpdateChange(change, node);
          break;
        case "commit_update":
          if (change.entryIndex !== undefined) {
            this.applyCommitUpdateChange(change, node);
          }
          break;
      }
      // Log updates are handled in handleMessage when message is received
    });
  }

  /**
   * Adds a new node to the cluster.
   * 
   * Creates a new RaftNode with the next sequential ID (N1, N2, N3, etc.)
   * and connects it to all existing peers in the cluster.
   */
  addNode() {
    const nextId = `N${this.nodes.size + 1}`;
    const node = new RaftNode(nextId);
    this.nodes.set(nextId, node);
    this.connectPeers();
  }

  /**
   * Returns the current leader node, if one exists.
   * 
   * @returns The leader node, or null if no leader has been elected yet
   */
  leader(): RaftNode | null {
    for (const node of Array.from(this.nodes.values())) {
      if (node.role === "leader") {
        return node;
      }
    }
    return null;
  }

  /**
   * Toggles a node's online/offline status.
   * 
   * When a node is killed (set offline):
   * - Stores its current state snapshot for UI display
   * - If it was a leader, it steps down to follower
   * - Stops processing messages to/from this node
   * 
   * When a node is revived (set online):
   * - Restores it using the stored state snapshot
   * - Marks it as pending a heartbeat update
   * - Node will sync with the cluster when it receives the next heartbeat
   * 
   * @param nodeId - The ID of the node to toggle (e.g., "N1", "N2")
   */
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
        // Log online event
        this.logEvent(`${nodeId} is online`);
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
      // Log offline event
      this.logEvent(`${nodeId} is offline`);
    }
  }

  /**
   * Exports the current state of the cluster for UI rendering.
   * 
   * Returns a snapshot of all nodes' states, recent messages, and cluster metadata.
   * For nodes that are alive but pending a heartbeat update, uses stored UI snapshots
   * to maintain visual consistency during the transition period.
   * 
   * @param includeMessages - If true, includes recent messages and clears them after export.
   *                          If false, only exports node states (useful for animation frame updates).
   * @returns Complete cluster state including nodes, messages, leader info, term, and events
   */
  exportState(includeMessages = true): ClusterState {
    const snapshots: ClusterNodeState[] = Array.from(this.nodes.values()).map((node) => {
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
      events: [...this.eventLog],
    };

    if (includeMessages) {
      this.recentMessages = [];
      // Clear events after exporting (they've been consumed by UI)
      // Only clear when including messages to avoid losing events during animation frame updates
      this.eventLog = [];
    }
    return state;
  }

  /**
   * Drains and returns all recent messages, clearing the internal buffer.
   * 
   * This is useful for getting messages that need to be visualized without
   * including them in the main exportState() call.
   * 
   * @returns Array of recent Raft messages that were queued since last drain
   */
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

  /**
   * Enqueues messages for delivery in the next deliver() call.
   * 
   * Messages are added to both the delivery queue and the recent messages buffer.
   * The delivery queue is processed by deliver(), while recent messages are included
   * in exportState() for visualization.
   * 
   * @param messages - Array of Raft messages to enqueue
   */
  enqueueMessages(messages: RaftMessage[]) {
    if (!messages.length) {
      return;
    }
    this.messageQueue.push(...messages);
    this.recentMessages.push(...messages);
  }

  private handleRequestVoteTracking(msg: RaftMessage) {
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
      // Log vote request event when message starts (will be logged in applyPendingStateChanges)
    }
  }

  private handleVoteGrantedTracking(msg: RaftMessage) {
    // Track VoteGranted messages - leader state change happens when these complete
    const recipient = this.nodes.get(msg.to);
    const payload = msg.payload as any;
    if (recipient && recipient.role === "candidate" && payload?.granted) {
      // Track vote count for logging
      if (!this.voteCountsByCandidate.has(msg.to)) {
        this.voteCountsByCandidate.set(msg.to, { term: msg.term, votes: new Set([msg.to]) });
      }
      const voteCount = this.voteCountsByCandidate.get(msg.to);
      if (voteCount && voteCount.term === msg.term) {
        voteCount.votes.add(msg.from);
      }
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

  private handleAppendEntriesTracking(msg: RaftMessage) {
    // Track AppendEntries messages
    const recipient = this.nodes.get(msg.to);
    const payload = msg.payload as AppendEntriesPayload;
    
    // If this is a heartbeat to a node that's pending a heartbeat update
    if (recipient && this.revivedNodesPendingHeartbeat.has(msg.to) && payload?.isHeartbeat === true) {
      // Check if the recipient was a previous leader stepping down due to new leader
      const snapshot = this.nodeUiStateSnapshots.get(msg.to);
      const wasPreviousLeader = snapshot && snapshot.role === "leader";
      const isNewLeaderTerm = msg.term > (snapshot?.term ?? 0);
      
      // Mark this message as updating the UI state when it completes
      this.pendingStateChanges.set(msg.id, {
        type: "log_update",
        nodeId: msg.to,
        messageId: msg.id,
        wasPreviousLeader: wasPreviousLeader && isNewLeaderTerm,
        newLeaderId: wasPreviousLeader && isNewLeaderTerm ? msg.from : undefined,
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
            // Initialize replication count (leader already has it)
            this.entryReplicationCounts.set(entry.index, new Set([msg.from]));
            // Store entry value for commit logging
            this.entryValuesByIndex.set(entry.index, entry.command);
            // Log new entry event
            const entryValue = entry.command;
            this.logEvent(`${msg.from} added new entry "${entryValue}", requesting followers to append`);
          }
        });
      }
    }
  }

  private handleAppendResponseTracking(msg: RaftMessage) {
    // Track AppendResponse messages for commit tracking
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

  private applyElectionStartChange(change: PendingStateChange, node: RaftNode) {
    if (change.newTerm === undefined) {
      return;
    }
    
    // Apply candidate state change
    (node as any).applyElectionStart(change.newTerm);
    // Log vote request event only once per election
    const electionKey = `${change.nodeId}-${change.newTerm}`;
    if (!this.loggedElections.has(electionKey)) {
      this.logEvent(`${change.nodeId}'s heartbeat timed out and requested voting`);
      this.loggedElections.add(electionKey);
    }
    // Initialize vote tracking
    this.voteCountsByCandidate.set(change.nodeId, { term: change.newTerm, votes: new Set([change.nodeId]) });
  }

  private applyLeaderElectionChange(change: PendingStateChange, node: RaftNode) {
    // Check if this VoteGranted message should trigger leader election
    // The vote was already recorded in handleMessage, now check quorum
    // We only track this if the vote was granted and node was candidate, so we can trust that
    if (!change.voteGranted) {
      return;
    }
    
    // Check if node is still candidate (might have changed if term increased)
    if (node.role === "candidate" && change.voteTerm === node.term) {
      // Vote was already added in handleMessage, now check if quorum is reached
      // All votes that have been delivered are already counted, so we can check quorum now
      if (node.reachedQuorum()) {
        node.becomeLeader();
        // Log combined vote grants and leader election
        this.logEvent(`${change.nodeId} received quorum vote grants and became leader`);
        // Clean up vote tracking and election logging
        this.voteCountsByCandidate.delete(change.nodeId);
        // Clean up logged elections for this node (keep only current term)
        const electionKey = `${change.nodeId}-${change.voteTerm}`;
        this.loggedElections.delete(electionKey);
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

  private applyLogUpdateChange(change: PendingStateChange, node: RaftNode) {
    // This is a heartbeat that completed to a revived node
    // Update the UI state snapshot to reflect the node's current internal state
    // The node's state was already updated in handleMessage, now sync the UI snapshot
    if (!this.revivedNodesPendingHeartbeat.has(change.nodeId)) {
      return;
    }
    
    // Check if this was a previous leader stepping down due to new leader
    if (change.wasPreviousLeader && change.newLeaderId) {
      this.logEvent(`${change.nodeId} received heartbeat from new generation leader ${change.newLeaderId} and stepped down`);
    }
    
    const currentState = node.exportState();
    this.nodeUiStateSnapshots.set(change.nodeId, currentState);
    // Remove from pending set since heartbeat was received
    this.revivedNodesPendingHeartbeat.delete(change.nodeId);
  }

  private applyCommitUpdateChange(change: PendingStateChange, node: RaftNode) {
    if (change.entryIndex === undefined) {
      return;
    }
    
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
      const oldCommitIndex = node.commitIndex;
      node.commitIndex = Math.max(node.commitIndex, change.entryIndex);
      
      // Log commit event if commitIndex actually changed
      if (node.commitIndex > oldCommitIndex) {
        const entryValue = this.entryValuesByIndex.get(change.entryIndex) || "unknown";
        this.logEvent(`Entry "${entryValue}" confirmed by quorum nodes, entry is committed`);
      }
      
      // Clean up tracking for this entry
      this.cleanupCommitTracking(change.entryIndex, change.messageId);
    } else {
      // Update replication count for logging
      const replicationCount = this.entryReplicationCounts.get(change.entryIndex);
      if (replicationCount && senderNodeId) {
        replicationCount.add(senderNodeId);
        // Log vote grant progress (but only once per new count to avoid spam)
        // We'll log this in a different way - maybe when we reach certain milestones
      }
    }
  }

  private cleanupCommitTracking(entryIndex: number, messageId: string) {
    // Clean up tracking for this entry
    this.pendingCommits.delete(entryIndex);
    this.pendingCommitUiUpdates.delete(entryIndex);
    this.entryReplicationCounts.delete(entryIndex);
    this.entryValuesByIndex.delete(entryIndex);
    // Clean up request ID mapping
    const requestIdsToRemove: string[] = [];
    this.entryIndexByRequestId.forEach((idx, reqId) => {
      if (idx === entryIndex) {
        requestIdsToRemove.push(reqId);
      }
    });
    requestIdsToRemove.forEach(reqId => this.entryIndexByRequestId.delete(reqId));
    // Clean up response sender mapping
    this.responseSenderByResponseId.delete(messageId);
  }

  private logEvent(message: string) {
    const event: EventLogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      message,
    };
    this.eventLog.push(event);
    // Keep only last 1000 events to prevent memory issues
    if (this.eventLog.length > 1000) {
      this.eventLog.shift();
    }
  }
}
