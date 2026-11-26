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
    /** 当 Slack hello 帧回报 >1 个并发连接时记录，提示事件可能被多实例分流。 */
    activeConnections?: number;
}
export interface SocketClientLike {
    on(event: string, listener: (...args: unknown[]) => void): unknown;
    start(): Promise<unknown>;
    disconnect(): Promise<unknown>;
    listeners?(event: string): Array<(...args: unknown[]) => unknown>;
    off?(event: string, listener: (...args: unknown[]) => void): unknown;
    removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
    send?(envelopeId: string, body?: unknown): Promise<unknown>;
}
export interface SocketLifecycleOptions {
    retryBaseMs?: number;
    jitter?: boolean;
    /** WebSocket 客户端 pong 超时（毫秒）；默认 15,000ms，避免公网/代理抖动触发 SDK 默认 5s 误断连。 */
    clientPingTimeoutMs?: number;
    slackApiUrl?: string;
    botUserId?: string;
    botUserIdProvider?: () => string | undefined;
    onConnected?: () => void;
    createClient?: (options: ConstructorParameters<typeof SocketModeClient>[0]) => SocketClientLike;
}
export type SocketDisposer = (() => void) & {
    status(): SocketStatus;
};
export declare function startSocketModeClient(appToken: string, handler: SocketMessageHandler, warn: Warn, options?: SocketLifecycleOptions): SocketDisposer;
export {};
