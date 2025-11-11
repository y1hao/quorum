import { describe, expect, it } from "vitest";
import { RaftCluster } from "../core/raftCluster";

const advanceCluster = (cluster: RaftCluster, steps: number) => {
  for (let i = 0; i < steps; i += 1) {
    cluster.tick(200);
    cluster.deliver();
    if (cluster.leader()) {
      break;
    }
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
