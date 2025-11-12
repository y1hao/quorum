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
  step: () => void;
  addCommand: () => void;
}

export const useRaftSimulation = (
  nodeCount = 5
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
      driverRef.current.advance(delta);
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

  const step = useCallback(() => {
    const cluster = clusterRef.current;
    cluster.tick(SIMULATION_TICK_INTERVAL_MS);
    cluster.deliver();
    const snapshot = cluster.exportState();
    driverRef.current.ingest(snapshot.messages);
    setClusterState(snapshot);
  }, [clusterRef]);

  const addCommand = useCallback(() => {
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
      command: `set-x-${nextIndex}`,
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

  return useMemo(
    () => ({
      cluster: clusterState,
      rpcMessages,
      isRunning,
      toggle,
      reset,
      step,
      addCommand,
    }),
    [clusterState, rpcMessages, isRunning, toggle, reset, step, addCommand]
  );
};
