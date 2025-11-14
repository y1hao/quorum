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
  payload?: T,
  respondsTo?: string
): RaftMessage<T> => ({
  id: nextMessageId(),
  type,
  from,
  to,
  term,
  payload,
  respondsTo,
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
) => makeMessage<VoteGrantedPayload>("VoteGranted", from, to, term, payload, respondsTo);

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
) => makeMessage<AppendResponsePayload>("AppendResponse", from, to, term, payload, respondsTo);

export const cloneMessage = <T>(msg: RaftMessage<T>, overrides: Partial<RaftMessage<T>> = {}) => ({
  ...msg,
  ...overrides,
  id: nextMessageId(),
});
