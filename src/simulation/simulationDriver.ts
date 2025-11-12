import { RaftMessage } from "../core/types";
import { clamp01 } from "../utils/animation";

export interface RpcVisualMessage extends RaftMessage {
  progress: number;
  duration: number;
  createdAt: number;
  startTime: number; // When this message should start animating
}

const DEFAULT_DURATION = 900;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class SimulationDriver {
  private messages: Map<string, RpcVisualMessage> = new Map();
  private pendingResponses: Map<string, RpcVisualMessage> = new Map(); // Responses waiting for their request to complete

  ingest(newMessages: RaftMessage[]) {
    const currentTime = now();
    
    // First pass: ingest all non-response messages and build a map of requests in this batch
    const requestsInBatch = new Map<string, RaftMessage>();
    const responsesInBatch: RaftMessage[] = [];
    
    newMessages.forEach((message) => {
      if (!message) {
        return;
      }
      
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
        duration: DEFAULT_DURATION,
        createdAt: currentTime,
        startTime: currentTime,
      };
      this.messages.set(message.id, visualMessage);
    });
    
    // Second pass: ingest response messages, checking if their request is in batch or already active
    responsesInBatch.forEach((message) => {
      const visualMessage: RpcVisualMessage = {
        ...message,
        progress: 0,
        duration: DEFAULT_DURATION,
        createdAt: currentTime,
        startTime: currentTime,
      };
      
      // Check if request is in the current batch
      const requestInBatch = requestsInBatch.get(message.respondsTo!);
      if (requestInBatch) {
        // Request is in same batch, delay response until request completes
        visualMessage.startTime = currentTime + DEFAULT_DURATION;
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

  advance(deltaMs: number) {
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

    // Clean up completed messages
    completed.forEach((id) => this.messages.delete(id));
  }

  activeMessages() {
    const currentTime = now();
    return Array.from(this.messages.values()).filter(
      (msg) => currentTime >= msg.startTime
    );
  }

  reset() {
    this.messages.clear();
    this.pendingResponses.clear();
  }
}
