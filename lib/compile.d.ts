/**
 * 工具参数 DSL → 已编译 JSON Schema。
 *
 * 关键约定（坑 1/2）：注册给宿主的 parameters 必须是【编译好的 JSON Schema 对象】
 * （{ type: 'object', properties: {...}, required?: [...] }），绝不能把原始 DSL
 * 直接塞进去，否则标准模式请求会被 DeepSeek API 拒绝。
 */
/** 单个参数的作者友好 DSL。 */
export interface ParameterDsl {
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
    required?: boolean;
    description?: string;
    enum?: readonly (string | number | boolean)[];
    items?: ParameterDsl;
    properties?: Record<string, ParameterDsl>;
}
/** 参数 DSL 表：键为参数名，值为参数描述。 */
export type ParameterDslMap = Record<string, ParameterDsl>;
/** 编译后的 JSON Schema 节点（lossless JSON）。 */
export interface JsonSchemaNode {
    type?: string;
    properties?: Record<string, JsonSchemaNode>;
    required?: string[];
    description?: string;
    enum?: (string | number | boolean)[];
    items?: JsonSchemaNode;
    additionalProperties?: boolean;
}
/**
 * 把参数 DSL 编译为【已编译好的 JSON Schema 对象】。
 * 结果形如 { type: 'object', properties: {...}, required?: [...] }，
 * 可直接作为 ToolDefinition.parameters 注册。
 */
export declare function compileParameters(dsl: ParameterDslMap): JsonSchemaNode;
