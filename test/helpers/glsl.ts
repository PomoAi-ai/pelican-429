// 着色器源码的结构解析（测试用）：声明、常量、函数、数字字面量、注入点 —— 只断言结构，不按字面匹配表达式。

export interface GlslDecl {
  readonly qualifier: string;
  readonly type: string;
}

/** attribute / uniform / varying（含 flat）声明：名 → { qualifier, type }。 */
export function glslDeclarations(src: string): Map<string, GlslDecl> {
  const out = new Map<string, GlslDecl>();
  const re = /^\s*((?:flat\s+)?(?:attribute|uniform|varying|in|out))\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)\s*;/gm;
  for (const m of src.matchAll(re)) out.set(m[3] as string, { qualifier: (m[1] as string).replace(/\s+/g, ' '), type: m[2] as string });
  return out;
}

/** `const float|int|uint NAME = VALUE;` → 名 → 数值。 */
export function glslConstantValues(src: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of src.matchAll(/\bconst\s+(float|int|uint)\s+(\w+)\s*=\s*([-+0-9.eE]+)u?\s*;/g)) out.set(m[2] as string, Number.parseFloat(m[3] as string));
  return out;
}

/** 定义的函数名。 */
export function glslFunctionNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/^\s*(?:float|int|uint|bool|void|vec[234]|mat[234])\s+(\w+)\s*\([^;{]*\)\s*\{/gm)) out.add(m[1] as string);
  return out;
}

/** 源码中被调用的标识符（name( 形式）。 */
export function glslCalls(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) out.add(m[1] as string);
  return out;
}

/** 源码中出现的标识符。 */
export function glslIdentifiers(src: string): Set<string> {
  return new Set(src.match(/\b[A-Za-z_]\w*\b/g) ?? []);
}

/** 数字字面量（去掉注释；不含标识符内的数字）。 */
export function glslNumericLiterals(src: string): string[] {
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...code.matchAll(/(?<![\w.])(\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?u?(?![\w.])/g)].map((m) => m[0]);
}

/** code 是否紧跟在 `#include <include>` 之后注入。 */
export function injectedAfter(src: string, include: string, code: string): boolean {
  return src.includes(`#include <${include}>\n${code}`);
}
