# 📄 SPEC.md

> **📌 Documentation Status:** This file documents the project specification and architecture. It is kept for reference purposes and documents the project's design and development history.

## Project: Raft Consensus Visualization and Simulation (React + TypeScript)

---

## 1. 🧭 Overview

This project is a **frontend-only Raft consensus visualizer and simulator**, built with **React + TypeScript**.
It illustrates how Raft achieves leader election, quorum-based decisions, and log replication through **animated RPC messages** between nodes.

It is also structured to evolve into a **real, testable Raft implementation**, with a fully isolated algorithm core and accompanying unit tests.

---

## 2. ⚙️ Core Goals

* 🎨 **Visualize** the Raft protocol (leader election, heartbeats, log replication)
* 🧠 **Simulate** quorum-based decisions and node state transitions
* 🧩 **Architect** for extensibility: separate core logic from visualization
* 🧪 **Test** Raft logic headlessly (Jest/Vitest) without launching the UI

---

## 3. 🧱 Project Architecture

### Three-Layer Design

```
src/
  core/           ← Pure Raft algorithm (no React, testable)
  simulation/     ← Drives RaftCluster and adapts for animation
  components/     ← React visualization layer
  utils/          ← Layout, math, helpers
  tests/          ← Unit tests for core logic
```

| Layer          | Purpose                              | Dependencies         |
| -------------- | ------------------------------------ | -------------------- |
| **core**       | Deterministic Raft implementation    | none                 |
| **simulation** | Bridges Raft logic and visualization | React (optional)     |
| **components** | SVG + UI rendering                   | React, Framer Motion |
| **tests**      | Validate correctness                 | Vitest / Jest        |

---

## 4. 🧠 Core Raft Model

Located in `src/core/`.

### 4.1. `RaftNode.ts`

Represents a single node’s Raft state machine.

```ts
export type NodeRole = "follower" | "candidate" | "leader";

export interface LogEntry {
  index: number;
  term: number;
  command: string;
}

export class RaftNode {
  id: string;
  role: NodeRole;
  term: number;
  votedFor?: string;
  log: LogEntry[];
  commitIndex: number;
  electionTimeout: number;
  heartbeatTimeout: number;

  constructor(id: string);
  tick(deltaMs: number): RaftMessage[];
  handleMessage(msg: RaftMessage): RaftMessage[];
  appendEntry(entry: LogEntry): void;
  becomeCandidate(): void;
  becomeLeader(): void;
  becomeFollower(term: number): void;
}
```

---

### 4.2. `RaftMessage.ts`

Defines Raft RPC message types.

```ts
export type RaftMessageType =
  | "RequestVote"
  | "VoteGranted"
  | "AppendEntries"
  | "AppendResponse";

export interface RaftMessage {
  from: string;
  to: string;
  term: number;
  type: RaftMessageType;
  payload?: any;
}
```

---

### 4.3. `RaftCluster.ts`

Simulates a network of Raft nodes.

```ts
export class RaftCluster {
  nodes: Map<string, RaftNode>;
  messages: RaftMessage[];

  constructor(count: number);
  tick(): void;               // progress time for all nodes
  deliver(): void;            // deliver messages between nodes
  addNode(): void;            // add new node dynamically
  leader(): RaftNode | null;  // current leader
  exportState(): ClusterState;
}
```

---

### 4.4. `types.ts`

Common types shared between logic and visualization:

```ts
export interface ClusterState {
  term: number;
  leaderId?: string;
  nodes: {
    id: string;
    role: NodeRole;
    term: number;
    commitIndex: number;
    logLength: number;
  }[];
  messages: RaftMessage[];
}
```

---

## 5. 🧮 Simulation Layer

Located in `src/simulation/`.

Bridges Raft logic with the UI by:

* Stepping RaftCluster periodically (`tick()`)
* Tracking message progress (0 → 1)
* Exposing React state for rendering

### 5.1. `useRaftSimulation.ts`

```ts
export function useRaftSimulation(nodeCount: number) {
  const [clusterState, setClusterState] = useState<ClusterState>();
  const clusterRef = useRef(new RaftCluster(nodeCount));

  useEffect(() => {
    const timer = setInterval(() => {
      clusterRef.current.tick();
      setClusterState(clusterRef.current.exportState());
    }, 100);
    return () => clearInterval(timer);
  }, []);

  return clusterState;
}
```

---

## 6. 🎨 Visualization Layer

Located in `src/components/`.

### 6.1. Components

| Component           | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `ClusterCanvas.tsx` | Main SVG renderer for nodes, links, and RPCs |
| `NodeCircle.tsx`    | Draws a node (color by role)                 |
| `LinkLine.tsx`      | Static edges between nodes                   |
| `RpcDot.tsx`        | Animated message dot                         |
| `SidebarState.tsx`  | Shows global cluster info + controls         |
| `NodeTooltip.tsx`   | Hover popup with per-node info               |

---

## 7. 🌀 Layout Utility

### `utils/layout.ts`

Computes ring positions for nodes.

```ts
export function computeNodePositions(
  n: number,
  radius = 250,
  cx = 400,
  cy = 300
) {
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}
```

---

## 8. 🧩 Global UI Elements

### SidebarState

* Current term
* Leader ID
* Commit index
* Node count
* Controls: ▶️ Play, ⏸ Pause, 🔄 Reset, ➕ Add Command

### NodeTooltip

Shows detailed per-node info:

```
Node #3
Role: Follower
Term: 4
Log: [1,2,3,4]
Commit Index: 2
```

---

## 9. 💫 Animation Rules

| Event       | Visual Effect                             |
| ----------- | ----------------------------------------- |
| Election    | Candidate glows yellow, sends yellow dots |
| VoteGranted | Green dot returns, candidate → leader     |
| Heartbeats  | Red dots pulse from leader to followers   |
| Log Append  | Boxes near node expand in count           |
| Commit      | Majority highlight when quorum achieved   |
| Node Hover  | Tooltip with node state                   |

All animations run with **Framer Motion** over SVG paths.

---

## 10. 🧪 Unit Testing (Core Layer)

Located in `src/tests/`.

### Framework

Use **Vitest** (or Jest).

Install:

```bash
npm install --save-dev vitest @types/jest
```

### Example Tests

#### Election Test

```ts
import { RaftCluster } from "../core/raftCluster";

test("leader election reaches quorum", () => {
  const cluster = new RaftCluster(5);
  for (let i = 0; i < 100; i++) cluster.tick();
  expect(cluster.leader()).toBeDefined();
});
```

#### Node Timeout Test

```ts
import { RaftNode } from "../core/raftNode";

test("node becomes candidate after timeout", () => {
  const node = new RaftNode("A");
  node.tick(300);
  expect(node.role).toBe("candidate");
});
```

✅ These run in Node (no UI).
✅ They validate Raft correctness independently from visualization.

---

## 11. 🧰 Developer Commands

```bash
npm run dev     # run React app (visualizer)
npm run test    # run unit tests (core)
npm run build   # production build
```

---

## 12. 🧩 Phased Development Plan

| Phase | Goal                                  | Deliverable                              |
| ----- | ------------------------------------- | ---------------------------------------- |
| **1** | Static layout + heartbeat animation   | 5 nodes, one leader sending heartbeats   |
| **2** | Election logic (core) + visualization | random timeouts, vote RPCs               |
| **3** | Log replication simulation            | append entries + quorum commit           |
| **4** | Interactivity                         | sidebar controls, hover tooltips         |
| **5** | Unit tests                            | test all Raft state transitions          |
| **6** | Optional                              | node failure, partitions, config changes |

---

## 13. 🔬 Extensibility Plan

Future evolution supported by design:

* Replace the mock simulation driver with a **real Raft implementation** (the `core` layer already supports this).
* Use `RaftCluster` in Node or backend for real-time visualization streaming.
* Introduce **WebWorker** or **WASM** to isolate simulation CPU load.
* Expand tests to verify Raft safety and liveness properties.

---

## 14. 📦 Deliverables

* Fully working React app with real-time Raft visualization
* Modular folder structure with isolated logic
* Unit tests verifying algorithm correctness
* Responsive and performant SVG-based rendering

---

## 15. ✅ Summary of Key Principles

| Goal                 | Achieved By                                        |
| -------------------- | -------------------------------------------------- |
| Visual clarity       | SVG + Framer Motion ring layout                    |
| Educational accuracy | Event-based simulation of Raft RPCs                |
| Extensibility        | Three-layer structure (core/simulation/components) |
| Testability          | Core logic isolated and headless                   |
| Maintainability      | Pure TypeScript + modular architecture             |
