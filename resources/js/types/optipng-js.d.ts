declare module 'optipng-js' {
  interface OptipngResult {
    data: Uint8Array<ArrayBuffer>
    stdout: string
    stderr: string
  }
  type Options = string[] | Record<string, boolean | string>
  function optipng(input: Uint8Array, options?: Options, printFn?: (s: string) => void): OptipngResult
  export = optipng
}
