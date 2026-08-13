/**
 * dsh-slack 自包含的最小结构类型，与宿主（@deepseek-ai/dsh-tools）运行时 API 兼容。
 * 插件只做结构化调用，运行时不 import 任何 @deepseek-ai/* 包。
 */

/** 面向模型/UI 的文本内容块。 */
export type ContentBlock = { type: 'text'; text: string }

/** 工具的输出声明：schema 必须是原始 JSON Schema，render 是纯投影。 */
export interface ToolOutputDefinition {
  readonly schema: unknown
  render(args: unknown, value: unknown): ContentBlock[]
}

/** 注册给 ctx.tools.register 的工具定义（与宿主 ToolDefinition 结构兼容）。 */
export interface ToolDefinition {
  name: string
  description: string
  parameters: unknown
  readonly output: ToolOutputDefinition
  execute(args: unknown, exec?: unknown): Promise<unknown>
  timeoutMs?: number
}

/** 插件所需的最小 Context 形状（宿主传入真实的 Cordis Context）。 */
export interface SlackContext {
  tools: {
    register(definition: ToolDefinition): () => void
  }
  /** Cordis 生命周期：传入启动函数，其返回的清理函数在 dispose 时执行。 */
  effect?: (start: () => void | (() => void)) => void
  /** 可选日志器；缺省回退 console.warn。 */
  logger?: {
    warn(message: string, ...args: unknown[]): void
  }
}
