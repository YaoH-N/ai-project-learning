/**
 * 确定性输出的基础：递归按键名排序后序列化。
 * 数组顺序保持不变——所有语义上无序的数组（模态、模型列表、厂商列表）
 * 都在构建阶段显式排序过，这里不再二次排序，以免掩盖构建阶段的不确定性。
 */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      const v = sortValue(src[key]);
      if (v !== undefined) out[key] = v;
    }
    return out;
  }
  // -0 会被 JSON.stringify 写成 0，但为了和后续读回来的值一致，这里显式归一。
  if (typeof value === 'number' && Object.is(value, -0)) return 0;
  return value;
}

export function stableStringify(value: unknown, indent = 2): string {
  return `${JSON.stringify(sortValue(value), null, indent)}\n`;
}
