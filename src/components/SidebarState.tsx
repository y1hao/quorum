import { useState, useEffect, useRef } from "react";
import { ClusterState, EventLogEntry } from "../core/types";

interface SidebarStateProps {
  cluster: ClusterState;
  isRunning: boolean;
  onToggle: () => void;
  onReset: () => void;
  onAddCommand: (value: string) => void;
}

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
    <p className="text-lg font-semibold">{value}</p>
  </div>
);

const EventLog = ({ events }: { events: ClusterState["events"] }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [highlightedEvents, setHighlightedEvents] = useState<Set<string>>(new Set());
  const prevEventsRef = useRef<EventLogEntry[]>([]);

  useEffect(() => {
    // Auto-scroll to top when new events are added (since we're showing latest first)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }

    // Track new events for highlighting - only highlight the latest event
    const prevEventIds = new Set(prevEventsRef.current.map(e => e.id));
    const newEvents = events.filter(e => !prevEventIds.has(e.id));

    if (newEvents.length > 0) {
      // Only highlight the latest event (last in the array, which appears first when reversed)
      const latestEventId = newEvents[newEvents.length - 1].id;
      
      // Clear any previous highlights and add only the latest
      setHighlightedEvents(new Set([latestEventId]));

      // Remove highlight after animation completes (2 seconds)
      const timeout = setTimeout(() => {
        setHighlightedEvents(prev => {
          const updated = new Set(prev);
          updated.delete(latestEventId);
          return updated;
        });
      }, 2000);

      return () => clearTimeout(timeout);
    }

    prevEventsRef.current = events;
  }, [events]);

  // Reverse events to show latest first
  const reversedEvents = [...events].reverse();

  return (
    <div className="flex flex-col">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Event Log
      </h3>
      <div className="relative">
        <div
          ref={scrollRef}
          className="h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-xs"
        >
          {events.length === 0 ? (
            <p className="text-slate-500">No events yet</p>
          ) : (
            <div className="flex flex-col gap-1">
              {reversedEvents.map((event, index) => {
                const isHighlighted = highlightedEvents.has(event.id);
                return (
                  <div
                    key={event.id}
                    className={`flex gap-2 rounded px-2 py-1 text-slate-300 hover:bg-slate-700/50 ${
                      isHighlighted
                        ? "text-emerald-100 animate-fade-out"
                        : ""
                    }`}
                  >
                    <span className="flex-shrink-0 text-slate-500 font-mono">
                      {events.length - index}
                    </span>
                    <span className="flex-1">{event.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 rounded-b-lg bg-gradient-to-t from-slate-900/95 via-slate-900/60 to-transparent" />
      </div>
    </div>
  );
};

export const SidebarState = ({
  cluster,
  isRunning,
  onToggle,
  onReset,
  onAddCommand,
}: SidebarStateProps) => {
  const [inputValue, setInputValue] = useState("");
  const [accumulatedEvents, setAccumulatedEvents] = useState<EventLogEntry[]>([]);
  const prevTickRef = useRef<number>(cluster.tick);

  // Accumulate events from cluster state
  useEffect(() => {
    if (cluster.events && cluster.events.length > 0) {
      setAccumulatedEvents((prev) => {
        // Only add events that aren't already in the accumulated list
        const existingIds = new Set(prev.map((e) => e.id));
        const newEvents = cluster.events.filter((e) => !existingIds.has(e.id));
        return [...prev, ...newEvents];
      });
    }
  }, [cluster.events]);

  // Clear events on reset (detect when tick resets to 0 or decreases)
  useEffect(() => {
    if (cluster.tick < prevTickRef.current) {
      // Tick decreased, which means reset happened
      setAccumulatedEvents([]);
    }
    prevTickRef.current = cluster.tick;
  }, [cluster.tick]);

  const commitIndex = cluster.nodes.reduce(
    (acc, node) => Math.max(acc, node.commitIndex),
    0
  );

  // Find the last committed entry - use the maximum commitIndex across all nodes
  // and find the entry with that index (all nodes should have the same committed entries)
  const lastCommittedEntry = commitIndex > 0
    ? cluster.nodes
        .flatMap((node) => node.log.filter((entry) => entry.index === commitIndex))
        .find((entry) => entry.index === commitIndex)
    : null;

  const lastCommittedValue = lastCommittedEntry?.command ?? null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && cluster.leaderId) {
      onAddCommand(inputValue.trim());
      setInputValue("");
    }
  };

  return (
    <aside className="flex h-full flex-col gap-6 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
      <h1 className="text-3xl font-bold">Raft Visualizer</h1>
      <div>
        <h2 className="text-xl font-semibold">
          {lastCommittedValue !== null ? `Last Committed: ${lastCommittedValue}` : "No commits"}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Leader" value={cluster.leaderId ?? "—"} />
        <Stat label="Nodes" value={cluster.nodes.length} />
        <Stat label="Term" value={cluster.term} />
        <Stat label="Commit" value={commitIndex} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Enter value..."
          disabled={!cluster.leaderId}
          className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!cluster.leaderId || !inputValue.trim()}
          className="rounded-lg bg-emerald-500/80 px-4 py-2 font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-emerald-500/30"
        >
          Add
        </button>
      </form>

      <div className="flex gap-3">
        <button
          onClick={onToggle}
          className="flex-1 rounded-lg bg-indigo-500/80 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
        >
          {isRunning ? "Pause" : "Play"}
        </button>
        <button
          onClick={onReset}
          className="flex-1 rounded-lg border border-rose-500/60 px-4 py-2 text-sm font-semibold text-rose-300"
        >
          Reset
        </button>
      </div>

      <div className="mt-auto">
        <EventLog events={accumulatedEvents} />
      </div>
    </aside>
  );
};
