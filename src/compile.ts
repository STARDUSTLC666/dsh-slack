/**
 * 工具参数 DSL → 已编译 JSON Schema。
 *
 * 关键约定（坑 1/2）：注册给宿主的 parameters 必须是【编译好的 JSON Schema 对象】
 * （{ type: 'object', properties: {...}, required?: [...] }），绝不能把原始 DSL
 * 直接塞进去，否则标准模式请求会被 DeepSeek API 拒绝。
 */

/** 单个参数的作者友好 DSL。 */
export interface ParameterDsl {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  required?: boolean
  description?: string
  enum?: readonly (string | number | boolean)[]
  items?: ParameterDsl
  properties?: Record<string, ParameterDsl>
}

/** 参数 DSL 表：键为参数名，值为参数描述。 */
export type ParameterDslMap = Record<string, ParameterDsl>

/** 编译后的 JSON Schema 节点（lossless JSON）。 */
export interface JsonSchemaNode {
  type?: string
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
  description?: string
  enum?: (string | number | boolean)[]
  items?: JsonSchemaNode
  additionalProperties?: boolean
}

/** 把单个属性 DSL 编译成 JSON Schema 节点。 */
function compileProperty(spec: ParameterDsl, path: string): JsonSchemaNode {
  const type = spec.type
  if (type === undefined) {
    throw new Error(`[dsh-slack] 参数 ${path} 缺少 type`)
  }
  const node: JsonSchemaNode = { type }
  if (spec.description !== undefined) node.description = spec.description
  if (spec.enum !== undefined) node.enum = [...spec.enum]
  if (type === 'array') {
    if (spec.items !== undefined) node.items = compileProperty(spec.items, `${path}[]`)
  } else if (type === 'object') {
    node.additionalProperties = true
    if (spec.properties !== undefined) {
      const properties: Record<string, JsonSchemaNode> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(spec.properties)) {
        properties[key] = compileProperty(value, `${path}.${key}`)
        if (value.required === true) required.push(key)
      }
      node.properties = properties
      if (required.length > 0) node.required = required
    }
  }
  return node
}

/**
 * 把参数 DSL 编译为【已编译好的 JSON Schema 对象】。
 * 结果形如 { type: 'object', properties: {...}, required?: [...] }，
 * 可直接作为 ToolDefinition.parameters 注册。
 */
export function compileParameters(dsl: ParameterDslMap): JsonSchemaNode {
  const properties: Record<string, JsonSchemaNode> = {}
  const required: string[] = []
  for (const [key, spec] of Object.entries(dsl)) {
    properties[key] = compileProperty(spec, key)
    if (spec.required === true) required.push(key)
  }
  const schema: JsonSchemaNode = { type: 'object', properties }
  if (required.length > 0) schema.required = required
  return schema
}
