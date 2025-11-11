# 🧱 TASKS.md

## Project: Raft Consensus Visualization and Simulation (React + TypeScript)

---

## 🗂️ Phase 0 — Project Setup

### **Task 0.1 — Scaffold the project**

```bash
npx create-react-app quorum --template typescript
cd quorum
npm install framer-motion d3 tailwindcss zustand vitest @types/jest
npx tailwindcss init -p
```

### **Task 0.2 — Configure Tailwind**

Update `tailwind.config.js` and add Tailwind directives in `index.css`.

---

## ⚙️ Phase 1 — Core Raft Implementation (src/core)

### **Task 1.1 — Define Raft types**

Create `src/core/types.ts`:

* Define `NodeRole`, `LogEntry`, `RaftMessageType`, `RaftMessage`, and `ClusterState`.

### **Task 1.2 — Implement RaftNode**

Create `src/core/raftNode.ts`:

* Class `RaftNode`

  * Properties: `id`, `role`, `term`, `votedFor`, `log`, `commitIndex`, timeouts.
  * Methods:
    `tick(deltaMs)`,
    `handleMessage(msg)`,
    `becomeFollower(term)`,
    `becomeCandidate()`,
    `becomeLeader()`,
    `appendEntry(entry)`.

Simulate simple election behavior (no log replication yet).

### **Task 1.3 — Implement RaftMessage**

Create `src/core/raftMessage.ts`:

* Define structure for `RequestVote`, `VoteGranted`, `AppendEntries`, `AppendResponse`.
* Utility helpers (e.g., `createMessage(from, to, type, term, payload)`).

### **Task 1.4 — Implement RaftCluster**

Create `src/core/raftCluster.ts`:

* Holds multiple `RaftNode`s and manages message queues.
* Periodic `tick()` updates each node.
* Simulate message delivery via `deliver()` (instant for now).
* Provide `leader()`, `exportState()`, and `addNode()` helpers.

### **Task 1.5 — Verify Raft core logic**

Before adding UI, write and run unit tests in `src/tests/` (see Phase 4).

---

## 🧮 Phase 2 — Simulation Driver (src/simulation)

### **Task 2.1 — Implement useRaftSimulation hook**

`src/simulation/useRaftSimulation.ts`:

* Maintain a `RaftCluster` instance in a React ref.
* `setInterval()` to call `cluster.tick()` every 100ms.
* Export `ClusterState` for the UI via `useState`.

### **Task 2.2 — Add simulationDriver**

`src/simulation/simulationDriver.ts`:

* Translate Raft messages into `RpcMessage` animations (adds progress 0→1).
* Increment `progress` over time for moving dots.
* Provide utilities: `advanceMessages(dt)`, `reset()`, etc.

---

## 🎨 Phase 3 — Visualization Layer (src/components)

### **Task 3.1 — Build ClusterCanvas**

`src/components/ClusterCanvas.tsx`:

* Render an SVG.
* Use `computeNodePositions(n)` from `utils/layout.ts`.
* Display nodes, links, and RPC dots.

### **Task 3.2 — Build NodeCircle**

`src/components/NodeCircle.tsx`:

* Render node circle with:

  * Color by role (`blue` follower, `yellow` candidate, `red` leader)
  * Node label (id + term)
* Handle hover events.

### **Task 3.3 — Build RpcDot**

`src/components/RpcDot.tsx`:

* Animate a small circle moving along an SVG line.
* Use Framer Motion `motion.circle`.
* Color by message type (yellow, green, red).

### **Task 3.4 — Build SidebarState**

`src/components/SidebarState.tsx`:

* Show current term, leader ID, commit index, cluster size.
* Add buttons for:

  * ▶️ Play / ⏸ Pause
  * 🔄 Reset
  * ➕ Add Command
* Bind actions to simulation driver.

### **Task 3.5 — Build NodeTooltip**

`src/components/NodeTooltip.tsx`:

* Appears on hover near node.
* Show role, term, log length, and commit index.

### **Task 3.6 — Wire Up App**

`src/App.tsx`:

* Import `useRaftSimulation`.
* Pass `ClusterState` to `ClusterCanvas` and `SidebarState`.

---

## 🌀 Phase 4 — Layout and Utilities

### **Task 4.1 — Implement layout utility**

`src/utils/layout.ts`:

* Function `computeNodePositions(n, radius, cx, cy)`.
* Evenly space nodes around a circle.

### **Task 4.2 — Add animation timing utils**

`src/utils/animation.ts` (optional):

* Helpers for linear interpolation and easing.

---

## 🧪 Phase 5 — Unit Tests for Core Logic (src/tests)

### **Task 5.1 — Configure Vitest**

Add `"test": "vitest run"` to `package.json` scripts.

### **Task 5.2 — Write RaftNode tests**

`src/tests/raftNode.test.ts`:

* Verify state transitions (follower → candidate → leader).
* Test timeouts and term increments.

### **Task 5.3 — Write RaftCluster tests**

`src/tests/raftCluster.test.ts`:

* Ensure leader election succeeds.
* Ensure quorum logic behaves correctly.

### **Task 5.4 — Run tests**

```bash
npm run test
```

---

## 🧩 Phase 6 — Visual Interaction and Refinement

### **Task 6.1 — Add interactivity**

* Click a node → highlight its outgoing/incoming RPCs.
* Tooltip follows cursor.
* Sidebar shows selected node state.

### **Task 6.2 — Improve animation polish**

* Use Framer Motion transitions for color and movement.
* Add subtle pulse to leader and heartbeat wave.

### **Task 6.3 — Add step/pause controls**

* “Step” button advances one Raft tick manually.
* “Pause” toggles the simulation interval.

---

## ⚡ Phase 7 — Optional Advanced Extensions

| Feature                       | Description                                     |
| ----------------------------- | ----------------------------------------------- |
| **Node failure simulation**   | Click to toggle node offline (gray out)         |
| **Partition simulation**      | Draw network split, disable links               |
| **Real Raft log replication** | Extend `RaftNode` to track per-follower indices |
| **Cluster reconfiguration**   | Add/remove nodes dynamically                    |
| **Export**                    | Record visualization as animation or GIF        |

---

## ✅ Phase 8 — Quality and Delivery

1. Ensure:

   * All tests pass (`npm run test`)
   * UI runs smoothly at 60 FPS
   * No TypeScript errors (`npm run build`)
2. Write a short `README.md` describing usage and concepts.
3. Optionally deploy to GitHub Pages or Vercel.

---

## 🎯 Milestone Summary

| Phase | Key Deliverable                            |
| ----- | ------------------------------------------ |
| 1     | Working Raft core logic (testable in Node) |
| 2     | Simulation hook driving RaftCluster        |
| 3     | SVG visualization (nodes, RPCs, sidebar)   |
| 4     | Layout utilities for ring placement        |
| 5     | Unit tests for Raft correctness            |
| 6     | Interactive, animated visualization        |
| 7     | Advanced features (failures, partitions)   |
