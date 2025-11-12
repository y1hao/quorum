import { describe, expect, it } from "vitest";
import { RaftNode } from "../core/raftNode";
import { createAppendEntries, createVoteGranted } from "../core/raftMessage";

const peers = ["N1", "N2", "N3"];

describe("RaftNode", () => {
  it("becomes candidate after election timeout", () => {
    const node = new RaftNode("N1", { electionTimeoutMs: 50 });
    node.setPeers(peers);

    const messages = node.tick(100);

    expect(messages.some((m) => m.type === "RequestVote")).toBe(true);

    const newTerm = messages[0]?.term;
    expect(newTerm).toBeDefined();
    node.applyElectionStart(newTerm!);

    expect(node.role).toBe("candidate");
  });

  it("becomes leader after quorum votes", () => {
    const node = new RaftNode("N1", { electionTimeoutMs: 50 });
    node.setPeers(peers);
    const messages = node.tick(100);

    const newTerm = messages[0]?.term;
    expect(newTerm).toBeDefined();
    node.applyElectionStart(newTerm!);

    const term = node.term;
    node.handleMessage(
      createVoteGranted("N2", "N1", term, { granted: true }),
      "dummy-request-id-1"
    );
    node.handleMessage(
      createVoteGranted("N3", "N1", term, { granted: true }),
      "dummy-request-id-2"
    );

    expect(node.reachedQuorum()).toBe(true);
  });

  it("does not restart election while pending state change", () => {
    const node = new RaftNode("N1", {
      electionTimeoutMs: 0,
      random: () => 0,
    });
    node.setPeers(peers);

    const firstElection = node.tick(2000);
    expect(firstElection.filter((m) => m.type === "RequestVote").length).toBeGreaterThan(0);

    const secondElection = node.tick(2000);
    expect(secondElection.some((m) => m.type === "RequestVote")).toBe(false);

    const newTerm = firstElection[0].term;
    node.applyElectionStart(newTerm);

    const retryElection = node.tick(3000);
    expect(retryElection.filter((m) => m.type === "RequestVote").length).toBeGreaterThan(0);
  });

  it("marks heartbeat append responses", () => {
    const follower = new RaftNode("N2");
    follower.setPeers(peers);

    const heartbeat = createAppendEntries("N1", "N2", 1, {
      entries: [],
      prevLogIndex: 0,
      prevLogTerm: 0,
      leaderCommit: 0,
      isHeartbeat: true,
    });

    const responses = follower.handleMessage(heartbeat, heartbeat.id);
    expect(responses[0]?.type).toBe("AppendResponse");
    expect((responses[0]?.payload as any)?.isHeartbeatResponse).toBe(true);
  });
});
