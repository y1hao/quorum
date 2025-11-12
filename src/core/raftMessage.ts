import {
  AppendEntriesPayload,
  AppendResponsePayload,
  RaftMessage,
  RaftMessageType,
  RequestVotePayload,
  VoteGrantedPayload,
} from "./types";

let messageCounter = 0;

const nextMessageId = () => `msg-${Date.now()}-${messageCounter++}`;

const makeMessage = <T>(
  type: RaftMessageType,
  from: string,
  to: string,
  term: number,
  payload?: T
): RaftMessage<T> => ({
  id: nextMessageId(),
  type,
  from,
  to,
  term,
  payload,
});

export const createRequestVote = (
  from: string,
  to: string,
  term: number,
  payload: RequestVotePayload
) => makeMessage<RequestVotePayload>("RequestVote", from, to, term, payload);

export const createVoteGranted = (
  from: string,
  to: string,
  term: number,
  payload: VoteGrantedPayload,
  respondsTo?: string
) => {
  const msg = makeMessage<VoteGrantedPayload>("VoteGranted", from, to, term, payload);
  if (respondsTo) {
    msg.respondsTo = respondsTo;
  }
  return msg;
};

export const createAppendEntries = (
  from: string,
  to: string,
  term: number,
  payload: AppendEntriesPayload
) => makeMessage<AppendEntriesPayload>("AppendEntries", from, to, term, payload);

export const createAppendResponse = (
  from: string,
  to: string,
  term: number,
  payload: AppendResponsePayload,
  respondsTo?: string
) => {
  const msg = makeMessage<AppendResponsePayload>("AppendResponse", from, to, term, payload);
  if (respondsTo) {
    msg.respondsTo = respondsTo;
  }
  return msg;
};

export const cloneMessage = <T>(msg: RaftMessage<T>, overrides: Partial<RaftMessage<T>> = {}) => ({
  ...msg,
  ...overrides,
  id: nextMessageId(),
});
