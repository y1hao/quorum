import { RaftMessage, AppendEntriesPayload, AppendResponsePayload } from "../core/types";
import { MESSAGE_TRANSIT_DURATION_MS } from "../core/timing";
import { clamp01 } from "../utils/animation";

export interface RpcVisualMessage extends RaftMessage {
  progress: number;
  duration: number;
  createdAt: number;
  startTime: number; // When this message should start animating
  isHeartbeatResponse?: boolean; // True if this response is responding to a heartbeat
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class SimulationDriver {
  private messages: Map<string, RpcVisualMessage> = new Map();
  private pendingResponses: Map<string, RpcVisualMessage> = new Map(); // Responses waiting for their request to complete

  /**
   * Ingests new Raft messages into the visualization system.
   * 
   * Converts Raft messages into visual messages with animation properties (progress, duration, timestamps).
   * Handles request/response pairing: responses are delayed until their corresponding request completes
   * to ensure proper visual sequencing. Request messages start immediately, while response messages
   * wait for their request to finish before starting their animation.
   * 
   * @param newMessages - Array of Raft messages to add to the visualization queue
   */
  ingest(newMessages: RaftMessage[]) {
    const currentTime = now();
    const incoming = newMessages ?? [];
    const messages = incoming.filter(Boolean);

    if (messages.length === 0) {
      return;
    }
    
    // First pass: ingest all non-response messages and build a map of requests in this batch
    const requestsInBatch = new Map<string, RaftMessage>();
    const responsesInBatch: RaftMessage[] = [];
    
    messages.forEach((message) => {
      if (message.respondsTo) {
        responsesInBatch.push(message);
      } else {
        requestsInBatch.set(message.id, message);
      }
    });
    
    // Ingest all request messages first
    requestsInBatch.forEach((message) => {
      const visualMessage: RpcVisualMessage = {
        ...message,
        progress: 0,
        duration: MESSAGE_TRANSIT_DURATION_MS,
        createdAt: currentTime,
        startTime: currentTime,
      };
      this.messages.set(message.id, visualMessage);
    });
    
    // Second pass: ingest response messages, checking if their request is in batch or already active
    responsesInBatch.forEach((message) => {
      // Check if this response is responding to a heartbeat
      let isHeartbeatResponse = Boolean(
        (message.payload as AppendResponsePayload | undefined)?.isHeartbeatResponse
      );
      const requestInBatch = requestsInBatch.get(message.respondsTo!);
      if (!isHeartbeatResponse && requestInBatch && requestInBatch.type === "AppendEntries") {
        const payload = requestInBatch.payload as AppendEntriesPayload | undefined;
        isHeartbeatResponse = payload?.isHeartbeat === true;
      } else if (!isHeartbeatResponse) {
        const activeRequest = this.messages.get(message.respondsTo!);
        if (activeRequest && activeRequest.type === "AppendEntries") {
          const payload = activeRequest.payload as AppendEntriesPayload | undefined;
          isHeartbeatResponse = payload?.isHeartbeat === true;
        }
      }

      const visualMessage: RpcVisualMessage = {
        ...message,
        progress: 0,
        duration: MESSAGE_TRANSIT_DURATION_MS,
        createdAt: currentTime,
        startTime: currentTime,
        isHeartbeatResponse,
      };
      
      // Check if request is in the current batch
      if (requestInBatch) {
        // Request is in same batch, delay response until request completes
        visualMessage.startTime = currentTime + MESSAGE_TRANSIT_DURATION_MS;
        this.pendingResponses.set(message.id, visualMessage);
      } else {
        // Check if request is already active
        const activeRequest = this.messages.get(message.respondsTo!);
        if (activeRequest) {
          // Request is still in flight, delay the response
          visualMessage.startTime = activeRequest.createdAt + activeRequest.duration;
          this.pendingResponses.set(message.id, visualMessage);
        } else {
          // Request not found (shouldn't happen normally), start immediately
          this.messages.set(message.id, visualMessage);
        }
      }
    });
  }

  /**
   * Advances the animation of all active messages and returns completed message IDs.
   * 
   * Updates the progress of all active messages based on elapsed time since their start time.
   * Activates pending response messages when their corresponding request completes or when
   * their scheduled start time is reached. Cleans up completed messages after returning
   * their IDs so they can be used for state change triggers.
   * 
   * Should be called on each animation frame to update message progress.
   * 
   * @returns Array of message IDs that have completed their animation (progress >= 1)
   */
  advance(): string[] {
    const currentTime = now();
    const completed: string[] = [];
    
    // Advance active messages
    this.messages.forEach((message, id) => {
      // Only advance if the message has started
      if (currentTime < message.startTime) {
        return;
      }
      
      const elapsed = currentTime - message.startTime;
      const nextProgress = clamp01(elapsed / message.duration);
      message.progress = nextProgress;
      
      if (nextProgress >= 1) {
        completed.push(id);
      }
    });

    // Move pending responses to active when their request completes OR when their start time is reached
    const responsesToActivate: string[] = [];
    this.pendingResponses.forEach((response, responseId) => {
      // Check if the request has completed
      if (response.respondsTo && completed.includes(response.respondsTo)) {
        responsesToActivate.push(responseId);
      } else if (currentTime >= response.startTime) {
        // Or if the start time has been reached (for responses delayed by time)
        responsesToActivate.push(responseId);
      }
    });
    
    responsesToActivate.forEach((responseId) => {
      const response = this.pendingResponses.get(responseId);
      if (response) {
        this.messages.set(responseId, response);
        this.pendingResponses.delete(responseId);
      }
    });

    // Clean up completed messages AFTER returning the IDs
    // Return completed IDs before deleting so they can be used for state changes
    const completedIds = [...completed];
    completed.forEach((id) => this.messages.delete(id));
    
    return completedIds;
  }
  
  /**
   * Returns the set of message IDs that have started animating.
   * 
   * A message is considered started if its startTime has been reached and it has
   * non-zero progress. Used to trigger state changes when messages begin their visual journey.
   * 
   * @returns Set of message IDs that have started animating
   */
  getStartedMessages(): Set<string> {
    const currentTime = now();
    const started = new Set<string>();
    
    // Check all messages that have started (progress > 0)
    this.messages.forEach((message, id) => {
      if (currentTime >= message.startTime && message.progress > 0) {
        started.add(id);
      }
    });
    
    return started;
  }
  
  /**
   * Returns the set of message IDs that have completed their animation.
   * 
   * A message is considered completed if its startTime has been reached and its
   * progress is >= 1. Used to trigger state changes when messages finish their visual journey.
   * 
   * @returns Set of message IDs that have completed animating
   */
  getCompletedMessages(): Set<string> {
    const currentTime = now();
    const completed = new Set<string>();
    
    // Check all messages that have completed (progress >= 1)
    this.messages.forEach((message, id) => {
      if (currentTime >= message.startTime && message.progress >= 1) {
        completed.add(id);
      }
    });
    
    return completed;
  }

  /**
   * Returns all currently active messages that should be rendered.
   * 
   * Filters messages to only include those whose startTime has been reached.
   * Used by the UI to render animated message dots traveling between nodes.
   * 
   * @returns Array of visual messages that are currently active and should be displayed
   */
  activeMessages() {
    const currentTime = now();
    return Array.from(this.messages.values()).filter(
      (msg) => currentTime >= msg.startTime
    );
  }

  /**
   * Resets the simulation driver by clearing all messages.
   * 
   * Removes all active messages and pending responses. Used when resetting
   * the simulation to start fresh.
   */
  reset() {
    this.messages.clear();
    this.pendingResponses.clear();
  }
}
