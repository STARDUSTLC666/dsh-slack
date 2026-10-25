/** Socket Mode lifecycle: SDK auto-reconnect is disabled; every attempt is owned and caught here. */
import { SocketModeClient } from '@slack/socket-mode';
import { type InboxMessage } from './inbox.js';
export interface SocketMessageHandler {
    onMessage(message: InboxMessage): void;
}
type Warn = (message: string, ...args: unknown[]) => void;
export interface SocketStatus {
    state: 'connecting' | 'connected' | 'reconnecting' | 'auth_failed' | 'stopped';
    attempts: number;
    error?: string;
}
export interface SocketClientLike {
    on(event: string, listener: (...args: unknown[]) => void): unknown;
    start(): Promise<unknown>;
    disconnect(): Promise<unknown>;
}
export interface SocketLifecycleOptions {
    retryBaseMs?: number;
    createClient?: (options: ConstructorParameters<typeof SocketModeClient>[0]) => SocketClientLike;
}
export type SocketDisposer = (() => void) & {
    status(): SocketStatus;
};
export declare function startSocketModeClient(appToken: string, handler: SocketMessageHandler, warn: Warn, options?: SocketLifecycleOptions): SocketDisposer;
export {};
