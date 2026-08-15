export function createRequestHandler(_opts?: any) {
  return async (_request: Request) => new Response('Not implemented', { status: 501 })
}

export function defaultRenderHandler() {
  return new Response('Not implemented', { status: 501 })
}

export function defineHandlerCallback(cb: any) {
  return cb
}

export function transformPipeableStreamWithRouter(_router: any) {
  return (stream: any) => stream
}

export function transformReadableStreamWithRouter(_router: any) {
  return (stream: any) => stream
}
