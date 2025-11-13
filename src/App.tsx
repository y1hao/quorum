import { ClusterCanvas } from "./components/ClusterCanvas";
import { SidebarState } from "./components/SidebarState";
import { useRaftSimulation } from "./simulation/useRaftSimulation";

function App() {
  const { cluster, rpcMessages, isRunning, toggle, reset, step, addCommand, toggleNodeLiveliness } =
    useRaftSimulation();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
        <section className="w-full lg:w-80">
          <SidebarState
            cluster={cluster}
            isRunning={isRunning}
            onToggle={toggle}
            onReset={reset}
            onStep={step}
            onAddCommand={addCommand}
          />
        </section>
        <section className="flex-1 rounded-3xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="h-[520px]">
            <ClusterCanvas cluster={cluster} rpcMessages={rpcMessages} onNodeClick={toggleNodeLiveliness} />
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
