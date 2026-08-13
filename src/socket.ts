/**
 * Socket Mode 启动/生命周期：用 @slack/socket-mode 建立 WebSocket，
 * 收到 message 事件写入收件箱；网络错误只 warn 不抛崩（SDK 自带自动重连）。
 */

import { SocketModeClient } from '@slack/socket-mode'
import { parseMessageEvent, type InboxMessage } from './inbox.js'

/** Socket 消息回调。 */
export interface SocketMessageHandler {
  onMessage(message: InboxMessage): void
}

type Warn = (message: string, ...args: unknown[]) => void

/**
 * 启动 Socket Mode 客户端，返回 dispose 函数（断开连接）。
 * 网络错误 / 解析错误均 try/catch + warn，绝不抛出。
 */
export function startSocketModeClient(
  appToken: string,
  handler: SocketMessageHandler,
  warn: Warn,
): () => void {
  const client = new SocketModeClient({ appToken })

  client.on('slack_event', (...args: unknown[]) => {
    try {
      const message = parseMessageEvent(args[0])
      if (message !== null) handler.onMessage(message)
    } catch (error) {
      warn('[dsh-slack] 解析 Socket Mode 事件失败：', error)
    }
  })

  client.on('error', (...args: unknown[]) => {
    warn('[dsh-slack] Socket Mode 连接错误（SDK 会自动重连）：', args[0])
  })

  try {
    client.start().catch((error: unknown) => {
      warn('[dsh-slack] Socket Mode 启动失败：', error)
    })
  } catch (error) {
    warn('[dsh-slack] Socket Mode 启动异常：', error)
  }

  return () => {
    try {
      client.disconnect().catch((error: unknown) => {
        warn('[dsh-slack] Socket Mode 断开失败：', error)
      })
    } catch (error) {
      warn('[dsh-slack] Socket Mode 断开异常：', error)
    }
  }
}
