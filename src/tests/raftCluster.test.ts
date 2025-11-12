import { describe, expect, it } from "vitest";
import { RaftCluster } from "../core/raftCluster";

const collectMessageIds = (messages: { id: string; type: string }[], type: string) =>
  messages.filter((msg) => msg.type === type).map((msg) => msg.id);

const advanceCluster = (cluster: RaftCluster, steps: number) => {
  const pendingVoteCompletions = new Set<string>();

  for (let i = 0; i < steps; i += 1) {
    if (pendingVoteCompletions.size) {
      cluster.deliver();
      cluster.applyPendingStateChanges(new Set(), new Set(pendingVoteCompletions));
      pendingVoteCompletions.clear();
    }

    cluster.tick(200);
    cluster.deliver();
    const snapshot = cluster.exportState();
    const started = collectMessageIds(snapshot.messages, "RequestVote");
    if (started.length) {
      cluster.applyPendingStateChanges(new Set(started), new Set());
    }

    pendingVoteCompletions.clear();
    collectMessageIds(snapshot.messages, "VoteGranted").forEach((id) =>
      pendingVoteCompletions.add(id)
    );

    if (cluster.leader()) {
      break;
    }
  }

  if (!cluster.leader() && pendingVoteCompletions.size) {
    cluster.deliver();
    cluster.applyPendingStateChanges(new Set(), new Set(pendingVoteCompletions));
  }
};

describe("RaftCluster", () => {
  it("elects a leader after a few ticks", () => {
    const cluster = new RaftCluster(5);
    advanceCluster(cluster, 25);
    expect(cluster.leader()).not.toBeNull();
  });

  it("exports cluster snapshot with messages", () => {
    const cluster = new RaftCluster(3);
    cluster.tick(200);
    cluster.deliver();
    const state = cluster.exportState();
    expect(state.nodes.length).toBe(3);
    expect(state.term).toBeGreaterThanOrEqual(0);
    expect(state.tick).toBeGreaterThan(0);
  });
});
