import { describe, expect, it } from "vitest";
import { RaftNode } from "../core/raftNode";
import { createVoteGranted } from "../core/raftMessage";

const peers = ["N1", "N2", "N3"];

describe("RaftNode", () => {
  it("becomes candidate after election timeout", () => {
    const node = new RaftNode("N1", { electionTimeoutMs: 50 });
    node.setPeers(peers);

    const messages = node.tick(100);

    expect(node.role).toBe("candidate");
    expect(messages.some((m) => m.type === "RequestVote")).toBe(true);
  });

  it("becomes leader after quorum votes", () => {
    const node = new RaftNode("N1", { electionTimeoutMs: 50 });
    node.setPeers(peers);
    node.tick(100);

    const term = node.term;
    node.handleMessage(
      createVoteGranted("N2", "N1", term, { granted: true }),
      "dummy-request-id-1"
    );
    node.handleMessage(
      createVoteGranted("N3", "N1", term, { granted: true }),
      "dummy-request-id-2"
    );

    expect(node.role).toBe("leader");
  });
});
