import {
  AppendEntriesPayload,
  AppendResponsePayload,
  ClusterNodeState,
  LogEntry,
  NodeRole,
  RaftMessage,
  RequestVotePayload,
  VoteGrantedPayload,
} from "./types";
import {
  createAppendEntries,
  createAppendResponse,
  createRequestVote,
  createVoteGranted,
} from "./raftMessage";
import {
  ELECTION_TIMEOUT_RANGE_MS,
  HEARTBEAT_INTERVAL_MS,
} from "./timing";

interface RaftNodeOptions {
  electionTimeoutMs?: number;
  heartbeatTimeoutMs?: number;
  random?: () => number;
}

export class RaftNode {
  readonly id: string;
  role: NodeRole = "follower";
  term = 0;
  votedFor?: string;
  log: LogEntry[] = [];
  commitIndex = 0;
  electionTimeout: number;
  heartbeatTimeout: number;

  private readonly random: () => number;
  private electionElapsed = 0;
  private heartbeatElapsed = 0;
  private peers: string[] = [];
  private votes: Set<string> = new Set();

  constructor(id: string, options: RaftNodeOptions = {}) {
    this.id = id;
    this.random = options.random ?? Math.random;
    this.electionTimeout =
      options.electionTimeoutMs ?? this.nextElectionTimeout();
    this.heartbeatTimeout = options.heartbeatTimeoutMs ?? HEARTBEAT_INTERVAL_MS;
  }

  setPeers(peerIds: string[]) {
    this.peers = peerIds.filter((peer) => peer !== this.id);
  }

  tick(deltaMs = 100): RaftMessage[] {
    const outgoing: RaftMessage[] = [];
    this.electionElapsed += deltaMs;

    if (this.role === "leader") {
      this.heartbeatElapsed += deltaMs;
      if (this.heartbeatElapsed >= this.heartbeatTimeout) {
        this.heartbeatElapsed = 0;
        outgoing.push(...this.broadcastHeartbeat());
      }
      return outgoing;
    }

    if (this.electionElapsed >= this.electionTimeout) {
      outgoing.push(...this.startElection());
    }

    return outgoing;
  }

  handleMessage(msg: RaftMessage, requestId: string): RaftMessage[] {
    const responses: RaftMessage[] = [];

    if (msg.term > this.term) {
      this.becomeFollower(msg.term);
    }

    switch (msg.type) {
      case "RequestVote": {
        const payload = msg.payload as RequestVotePayload;
        const granted = this.evaluateVoteRequest(msg.term, msg.from, payload);
        responses.push(
          createVoteGranted(this.id, msg.from, this.term, { granted }, requestId)
        );
        break;
      }
      case "VoteGranted": {
        const payload = msg.payload as VoteGrantedPayload;
        if (
          this.role === "candidate" &&
          msg.term === this.term &&
          payload?.granted
        ) {
          this.votes.add(msg.from);
          if (this.reachedQuorum()) {
            this.becomeLeader();
            responses.push(...this.broadcastHeartbeat());
          }
        }
        break;
      }
      case "AppendEntries": {
        const payload = msg.payload as AppendEntriesPayload;
        const success = this.handleAppendEntries(msg.from, msg.term, payload);
        const responsePayload: AppendResponsePayload = {
          success,
          matchIndex: this.log.length,
        };
        responses.push(
          createAppendResponse(this.id, msg.from, this.term, responsePayload, requestId)
        );
        break;
      }
      case "AppendResponse": {
        // Leader bookkeeping is simplified for now.
        break;
      }
      default:
        break;
    }

    return responses;
  }

  appendEntry(entry: LogEntry) {
    const existing = this.log.find((logEntry) => logEntry.index === entry.index);
    if (existing) {
      existing.term = entry.term;
      existing.command = entry.command;
    } else {
      this.log.push(entry);
    }
    this.commitIndex = Math.max(this.commitIndex, entry.index);
  }

  becomeCandidate() {
    this.role = "candidate";
    this.term += 1;
    this.votedFor = this.id;
    this.votes = new Set([this.id]);
    this.resetElectionTimer();
  }

  becomeLeader() {
    this.role = "leader";
    this.votedFor = this.id;
    this.votes = new Set([this.id]);
    this.heartbeatElapsed = 0;
    this.electionElapsed = 0;
  }

  becomeFollower(term: number) {
    this.role = "follower";
    this.term = term;
    this.votedFor = undefined;
    this.votes.clear();
    this.resetElectionTimer();
  }

  exportState(): Omit<ClusterNodeState, "isAlive"> {
    return {
      id: this.id,
      role: this.role,
      term: this.term,
      votedFor: this.votedFor,
      log: [...this.log],
      commitIndex: this.commitIndex,
      electionTimeout: this.electionTimeout,
      heartbeatTimeout: this.heartbeatTimeout,
    };
  }

  private startElection(): RaftMessage[] {
    this.becomeCandidate();
    const payload: RequestVotePayload = {
      lastLogIndex: this.log.length
        ? this.log[this.log.length - 1].index
        : 0,
      lastLogTerm: this.log.length ? this.log[this.log.length - 1].term : 0,
    };

    const messages = this.peers.map((peer) =>
      createRequestVote(this.id, peer, this.term, payload)
    );

    return messages;
  }

  private reachedQuorum(): boolean {
    const total = this.peers.length + 1;
    const majority = Math.floor(total / 2) + 1;
    return this.votes.size >= majority;
  }

  private broadcastHeartbeat(): RaftMessage[] {
    const payload: AppendEntriesPayload = {
      entries: [],
      prevLogIndex: this.log.length
        ? this.log[this.log.length - 1].index
        : 0,
      prevLogTerm: this.log.length ? this.log[this.log.length - 1].term : 0,
      leaderCommit: this.commitIndex,
      isHeartbeat: true,
    };

    return this.peers.map((peer) =>
      createAppendEntries(this.id, peer, this.term, payload)
    );
  }

  replicateEntries(entries: LogEntry[]): RaftMessage[] {
    if (this.role !== "leader" || !entries.length) {
      return [];
    }

    // Find the previous entry before the new entries
    const firstNewIndex = entries[0].index;
    const prevEntryIndex = firstNewIndex > 1 ? firstNewIndex - 1 : 0;
    const prevEntry = prevEntryIndex > 0
      ? this.log.find((e) => e.index === prevEntryIndex)
      : null;

    const payload: AppendEntriesPayload = {
      entries,
      prevLogIndex: prevEntryIndex,
      prevLogTerm: prevEntry?.term ?? 0,
      leaderCommit: this.commitIndex,
      isHeartbeat: false,
    };

    return this.peers.map((peer) =>
      createAppendEntries(this.id, peer, this.term, payload)
    );
  }

  private handleAppendEntries(
    leaderId: string,
    term: number,
    payload: AppendEntriesPayload
  ): boolean {
    if (term < this.term) {
      return false;
    }

    if (this.role !== "follower") {
      this.becomeFollower(term);
    }

    this.votedFor = leaderId;
    this.resetElectionTimer();

    if (payload.entries.length) {
      payload.entries.forEach((entry) => this.appendEntry(entry));
      this.commitIndex = Math.max(this.commitIndex, payload.leaderCommit);
    }

    return true;
  }

  private evaluateVoteRequest(
    term: number,
    candidateId: string,
    payload: RequestVotePayload
  ): boolean {
    if (term < this.term) {
      return false;
    }

    const notVotedYet = !this.votedFor || this.votedFor === candidateId;
    const logUpToDate = this.isCandidateLogUpToDate(payload);
    const granted = notVotedYet && logUpToDate;

    if (granted) {
      this.votedFor = candidateId;
      this.resetElectionTimer();
    }

    return granted;
  }

  private isCandidateLogUpToDate(payload: RequestVotePayload) {
    if (!this.log.length) {
      return true;
    }

    const lastEntry = this.log[this.log.length - 1];
    if (payload.lastLogTerm === lastEntry.term) {
      return payload.lastLogIndex >= lastEntry.index;
    }

    return payload.lastLogTerm >= lastEntry.term;
  }

  private nextElectionTimeout() {
    const [min, max] = ELECTION_TIMEOUT_RANGE_MS;
    return min + this.random() * (max - min);
  }

  private resetElectionTimer() {
    this.electionElapsed = 0;
    this.electionTimeout = this.nextElectionTimeout();
  }
}
