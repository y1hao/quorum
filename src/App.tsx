import { ClusterCanvas } from "./components/ClusterCanvas";
import { SidebarState } from "./components/SidebarState";
import { useRaftSimulation } from "./simulation/useRaftSimulation";

function App() {
  // Parse node count from URL query parameter
  const getNodeCount = (): number => {
    const params = new URLSearchParams(window.location.search);
    const nParam = params.get("n");
    if (nParam === null) {
      return 9; // default
    }
    const parsed = parseInt(nParam, 10);
    if (isNaN(parsed)) {
      return 9; // default if invalid
    }
    // Clamp between [3, 15]
    return Math.max(3, Math.min(15, parsed));
  };

  const nodeCount = getNodeCount();
  const { cluster, rpcMessages, isRunning, toggle, reset, addCommand, toggleNodeLiveliness } =
    useRaftSimulation(nodeCount);

  return (
    <main className="h-screen bg-slate-950 px-4 py-4 text-slate-100 overflow-hidden">
      <div className="mx-auto h-full flex max-w-6xl flex-col gap-4 lg:flex-row">
        <section className="order-1 lg:order-2 flex-1 rounded-3xl border border-slate-800 p-4 min-h-[400px] lg:min-h-0 aspect-square">
          <div className="h-full w-full">
            <ClusterCanvas cluster={cluster} rpcMessages={rpcMessages} onNodeClick={toggleNodeLiveliness} />
          </div>
        </section>
        <section className="order-2 lg:order-1 w-full lg:w-80 flex-shrink-0">
          <SidebarState
            cluster={cluster}
            isRunning={isRunning}
            onToggle={toggle}
            onReset={reset}
            onAddCommand={(value) => addCommand(value)}
          />
        </section>
      </div>
    </main>
  );
}

export default App;
