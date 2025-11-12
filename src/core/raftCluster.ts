import { RaftNode } from "./raftNode";
import { ClusterState, RaftMessage } from "./types";

export class RaftCluster {
  readonly nodes: Map<string, RaftNode> = new Map();
  private messageQueue: RaftMessage[] = [];
  private recentMessages: RaftMessage[] = [];
  private tickCounter = 0;
  private lastDelta = 100;
  private killedNodes: Set<string> = new Set();

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
      const recipient = this.nodes.get(msg.to);
      if (!recipient) {
        return;
      }
      const responses = recipient.handleMessage(msg, msg.id);
      this.enqueueMessages(responses);
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

  exportState(): ClusterState {
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
      messages: [...this.recentMessages],
      leaderId: leader?.id ?? null,
      term: leader?.term ?? highestTerm,
      tick: this.tickCounter,
    };

    this.recentMessages = [];
    return state;
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
