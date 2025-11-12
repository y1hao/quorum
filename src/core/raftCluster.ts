import { RaftNode } from "./raftNode";
import { ClusterState, RaftMessage } from "./types";

export class RaftCluster {
  readonly nodes: Map<string, RaftNode> = new Map();
  private messageQueue: RaftMessage[] = [];
  private recentMessages: RaftMessage[] = [];
  private tickCounter = 0;
  private lastDelta = 100;

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
    this.nodes.forEach((node) => {
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

  exportState(): ClusterState {
    const snapshots = Array.from(this.nodes.values()).map((node) =>
      node.exportState()
    );
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

  private enqueueMessages(messages: RaftMessage[]) {
    if (!messages.length) {
      return;
    }
    this.messageQueue.push(...messages);
    this.recentMessages.push(...messages);
  }
}
