/**
 * Socket Mode 启动/生命周期：用 @slack/socket-mode 建立 WebSocket，
 * 收到 message 事件写入收件箱；网络错误只 warn 不抛崩（SDK 自带自动重连）。
 */
import { type InboxMessage } from './inbox.js';
/** Socket 消息回调。 */
export interface SocketMessageHandler {
    onMessage(message: InboxMessage): void;
}
type Warn = (message: string, ...args: unknown[]) => void;
/**
 * 启动 Socket Mode 客户端，返回 dispose 函数（断开连接）。
 * 网络错误 / 解析错误均 try/catch + warn，绝不抛出。
 */
export declare function startSocketModeClient(appToken: string, handler: SocketMessageHandler, warn: Warn): () => void;
export {};
