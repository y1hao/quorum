import { RaftMessage } from "../core/types";
import { clamp01 } from "../utils/animation";

export interface RpcVisualMessage extends RaftMessage {
  progress: number;
  duration: number;
  createdAt: number;
}

const DEFAULT_DURATION = 900;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export class SimulationDriver {
  private messages: Map<string, RpcVisualMessage> = new Map();

  ingest(newMessages: RaftMessage[]) {
    newMessages.forEach((message) => {
      if (!message) {
        return;
      }
      this.messages.set(message.id, {
        ...message,
        progress: 0,
        duration: DEFAULT_DURATION,
        createdAt: now(),
      });
    });
  }

  advance(deltaMs: number) {
    const completed: string[] = [];
    this.messages.forEach((message, id) => {
      const nextProgress = clamp01(
        message.progress + deltaMs / message.duration
      );
      message.progress = nextProgress;
      if (nextProgress >= 1) {
        completed.push(id);
      }
    });

    completed.forEach((id) => this.messages.delete(id));
  }

  activeMessages() {
    return Array.from(this.messages.values());
  }

  reset() {
    this.messages.clear();
  }
}
