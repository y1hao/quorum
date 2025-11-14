# Quorum - Raft Consensus Visualization

A frontend-only Raft consensus visualizer and simulator built with React + TypeScript. This project illustrates how Raft achieves leader election, quorum-based decisions, and log replication through animated RPC messages between nodes.

## Features

- 🎨 **Visualize** the Raft protocol (leader election, heartbeats, log replication)
- 🧠 **Simulate** quorum-based decisions and node state transitions
- 🧩 **Modular Architecture** - Separated core logic from visualization for testability
- 🧪 **Unit Tests** - Raft logic can be tested headlessly without the UI

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd quorum

# Install dependencies
npm install
```

### Running the Application

```bash
# Start the development server
npm run dev
# or
npm start
```

The application will open at [http://localhost:3000](http://localhost:3000).

You can specify the number of nodes via URL query parameter:
- `http://localhost:3000?n=5` - Run with 5 nodes (default is 9, range: 3-15)

### Building for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

### Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Type Checking

```bash
npm run type-check
```

## Project Structure

```
src/
  core/           ← Pure Raft algorithm (no React, testable)
  simulation/     ← Drives RaftCluster and adapts for animation
  components/     ← React visualization layer
  utils/          ← Layout, math, helpers
  tests/          ← Unit tests for core logic
```

## Architecture

The project follows a three-layer architecture:

1. **Core Layer** (`src/core/`) - Pure TypeScript implementation of the Raft algorithm with no React dependencies. This layer is fully testable and can run in Node.js.

2. **Simulation Layer** (`src/simulation/`) - Bridges the Raft logic with the visualization by managing the simulation loop and tracking message animations.

3. **Visualization Layer** (`src/components/`) - React components that render the cluster state using SVG and Framer Motion for animations.

## Usage

### Controls

- **Play/Pause** - Toggle simulation running state
- **Reset** - Reset the cluster to initial state
- **Add Command** - Add a new log entry to the cluster
- **Click Nodes** - Toggle node liveliness (simulate node failures)

### Visual Elements

- **Blue Circles** - Follower nodes
- **Yellow Circles** - Candidate nodes
- **Red Circles** - Leader nodes
- **Animated Dots** - RPC messages traveling between nodes
  - Yellow dots - RequestVote messages
  - Green dots - VoteGranted responses
  - Red dots - AppendEntries (heartbeats)

## Documentation

For detailed specifications and development plans, see:
- **[SPEC.md](./SPEC.md)** - Complete project specification and architecture details
- **[TASKS.md](./TASKS.md)** - Development task breakdown and phased implementation plan

> **Note:** These documentation files are kept for reference purposes and document the project's design and development history.

## Technology Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Framer Motion** - Animation library
- **Tailwind CSS** - Styling
- **Vitest** - Testing framework
- **D3** - Layout utilities

## Development

The project is structured to support both visualization and testing:

- Core Raft logic is isolated and can be tested independently
- Visualization layer is separate and can be modified without affecting core logic
- The architecture supports future evolution into a real Raft implementation
