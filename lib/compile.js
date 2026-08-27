/**
 * 工具参数 DSL → 已编译 JSON Schema。
 *
 * 关键约定（坑 1/2）：注册给宿主的 parameters 必须是【编译好的 JSON Schema 对象】
 * （{ type: 'object', properties: {...}, required?: [...] }），绝不能把原始 DSL
 * 直接塞进去，否则标准模式请求会被 DeepSeek API 拒绝。
 */
/** 把单个属性 DSL 编译成 JSON Schema 节点。 */
function compileProperty(spec, path) {
    const type = spec.type;
    if (type === undefined) {
        throw new Error(`[dsh-slack] 参数 ${path} 缺少 type`);
    }
    const node = { type };
    if (spec.description !== undefined)
        node.description = spec.description;
    if (spec.enum !== undefined)
        node.enum = [...spec.enum];
    if (type === 'array') {
        if (spec.items !== undefined)
            node.items = compileProperty(spec.items, `${path}[]`);
    }
    else if (type === 'object') {
        node.additionalProperties = true;
        if (spec.properties !== undefined) {
            const properties = {};
            const required = [];
            for (const [key, value] of Object.entries(spec.properties)) {
                properties[key] = compileProperty(value, `${path}.${key}`);
                if (value.required === true)
                    required.push(key);
            }
            node.properties = properties;
            if (required.length > 0)
                node.required = required;
        }
    }
    return node;
}
/**
 * 把参数 DSL 编译为【已编译好的 JSON Schema 对象】。
 * 结果形如 { type: 'object', properties: {...}, required?: [...] }，
 * 可直接作为 ToolDefinition.parameters 注册。
 */
export function compileParameters(dsl) {
    const properties = {};
    const required = [];
    for (const [key, spec] of Object.entries(dsl)) {
        properties[key] = compileProperty(spec, key);
        if (spec.required === true)
            required.push(key);
    }
    const schema = { type: 'object', properties };
    if (required.length > 0)
        schema.required = required;
    return schema;
}
