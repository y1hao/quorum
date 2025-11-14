import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RaftCluster } from "../core/raftCluster";
import { ClusterState } from "../core/types";
import { SIMULATION_TICK_INTERVAL_MS } from "../core/timing";
import {
  SimulationDriver,
  RpcVisualMessage,
} from "./simulationDriver";

export interface SimulationController {
  cluster: ClusterState;
  rpcMessages: RpcVisualMessage[];
  isRunning: boolean;
  toggle: () => void;
  reset: () => void;
  addCommand: (value: string) => void;
  toggleNodeLiveliness: (nodeId: string) => void;
}

export const useRaftSimulation = (
  nodeCount: number
): SimulationController => {
  const clusterRef = useRef<RaftCluster>(new RaftCluster(nodeCount));
  const driverRef = useRef(new SimulationDriver());
  const [clusterState, setClusterState] = useState<ClusterState>(
    clusterRef.current.exportState()
  );
  const [rpcMessages, setRpcMessages] = useState<RpcVisualMessage[]>([]);
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const id = window.setInterval(() => {
      const cluster = clusterRef.current;
      // Use SIMULATION_TICK_INTERVAL_MS for consistent timing in production.
      // Tests can pass larger values to simulate time passing faster.
      cluster.tick(SIMULATION_TICK_INTERVAL_MS);
      cluster.deliver();
      const snapshot = cluster.exportState();
      driverRef.current.ingest(snapshot.messages);
      setClusterState(snapshot);
    }, SIMULATION_TICK_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [clusterRef, isRunning]);

  useEffect(() => {
    let frame: number;
    let prev = performance.now();

    const animate = () => {
      const current = performance.now();
      const delta = current - prev;
      prev = current;
      const completedMessageIds = driverRef.current.advance(delta);
      
      // Check for started/completed messages and apply pending state changes
      const startedMessages = driverRef.current.getStartedMessages();
      const completedMessages = new Set(completedMessageIds);
      if (startedMessages.size > 0 || completedMessages.size > 0) {
        clusterRef.current.applyPendingStateChanges(startedMessages, completedMessages);
        // Update cluster state after applying pending changes (but don't export messages again)
        const snapshot = clusterRef.current.exportState(false);
        setClusterState(snapshot);
        const immediateMessages = clusterRef.current.drainRecentMessages();
        if (immediateMessages.length) {
          driverRef.current.ingest(immediateMessages);
        }
      }

      setRpcMessages(driverRef.current.activeMessages());
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const toggle = useCallback(() => {
    setIsRunning((prev) => !prev);
  }, []);

  const reset = useCallback(() => {
    clusterRef.current = new RaftCluster(nodeCount);
    driverRef.current.reset();
    const snapshot = clusterRef.current.exportState();
    setClusterState(snapshot);
    setRpcMessages([]);
    setIsRunning(true);
  }, [nodeCount]);

  const addCommand = useCallback((value: string) => {
    const cluster = clusterRef.current;
    const leader = cluster.leader();
    if (!leader) {
      return;
    }

    const nextIndex = leader.log.length
      ? leader.log[leader.log.length - 1].index + 1
      : 1;
    const newEntry = {
      index: nextIndex,
      term: leader.term,
      command: value,
    };
    leader.appendEntry(newEntry);
    
    // Immediately replicate the entry to followers
    const replicationMessages = leader.replicateEntries([newEntry]);
    cluster.enqueueMessages(replicationMessages);
    
    // Tick by a small amount instead of heartbeatTimeout to avoid triggering elections
    cluster.tick(SIMULATION_TICK_INTERVAL_MS);
    cluster.deliver();
    const snapshot = cluster.exportState();
    driverRef.current.ingest(snapshot.messages);
    setClusterState(snapshot);
  }, [clusterRef]);

  const toggleNodeLiveliness = useCallback((nodeId: string) => {
    const cluster = clusterRef.current;
    cluster.toggleNodeLiveliness(nodeId);
    const snapshot = cluster.exportState();
    setClusterState(snapshot);
  }, [clusterRef]);

  return useMemo(
    () => ({
      cluster: clusterState,
      rpcMessages,
      isRunning,
      toggle,
      reset,
      addCommand,
      toggleNodeLiveliness,
    }),
    [clusterState, rpcMessages, isRunning, toggle, reset, addCommand, toggleNodeLiveliness]
  );
};
