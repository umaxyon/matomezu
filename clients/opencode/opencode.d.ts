// opencode が opencode のプラグインに貸すモジュールのうち、使う所の型
declare module "effect" {
  export const Schema: {
    String: unknown
    Struct(fields: Record<string, unknown>): unknown
  }
}

declare module "@opencode/plugin/rpc" {
  export const Rpc: {
    define<T extends { id: string; methods: Record<string, unknown>; events: Record<string, { schema: unknown }> }>(
      definition: T,
    ): T
  }
}
