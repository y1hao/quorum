/**
 * Timing constants for Raft simulation
 * 
 * These values control the timing behavior of the Raft algorithm simulation.
 * Adjust these values to tune the animation and simulation speed.
 * 
 * IMPORTANT: For proper Raft consensus behavior, these relationships must hold:
 * - MESSAGE_TRANSIT_DURATION_MS < HEARTBEAT_INTERVAL_MS
 * - HEARTBEAT_INTERVAL_MS < ELECTION_TIMEOUT_RANGE_MS[0] (minimum election timeout)
 * 
 * This ensures messages complete before the next heartbeat, and heartbeats arrive
 * before followers timeout and start unnecessary elections.
 */

/** Message transit duration in milliseconds (how long messages take to travel between nodes)
 * Should be the shortest value to ensure messages complete quickly */
export const MESSAGE_TRANSIT_DURATION_MS = 500;

/** Heartbeat interval in milliseconds (how often the leader sends heartbeats)
 * Must be longer than message transit time, but shorter than election timeout */
export const HEARTBEAT_INTERVAL_MS = 1500;

/** Election timeout range in milliseconds [min, max]
 * Must be longer than heartbeat interval to prevent unnecessary elections.
 * Randomization helps avoid split votes when multiple nodes start elections simultaneously.
 * Wider range reduces the chance of multiple nodes becoming candidates at the same time. */
export const ELECTION_TIMEOUT_RANGE_MS: [number, number] = [2000, 6000];

/** Simulation tick interval in milliseconds (how often the simulation advances)
 * Should be frequent enough to capture all events smoothly */
export const SIMULATION_TICK_INTERVAL_MS = 50;

