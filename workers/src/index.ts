import handleErrors from './utils/handleErrors'

// Export our Durable Object from the root module
export { Poll } from './objects/Poll'

// See wrangler.toml
export interface Env {
  // Environment Variables
  CLIENT_ORIGIN: string
  // Durable Object
  POLL: DurableObjectNamespace
  // KV Namespace
  POLL_META: KVNamespace
}

export interface PollPayload {
  question: string
  choices: string[]
  dedup: 'ip' | 'none'
  multiOk: boolean
}

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

const handleImageTransform = (request: Request, env: Env) => {
  const url = new URL(request.url)
  const options: { cf: { image: RequestInitCfPropertiesImage } } = { cf: { image: {} } }

  if (url.searchParams.has('width')) {
    options.cf.image.width = Number.parseInt(url.searchParams.get('width')!)
  }
  if (url.searchParams.has('quality')) {
    options.cf.image.quality = Number.parseInt(url.searchParams.get('quality')!)
  }

  const imageSrc = url.searchParams.get('src') || ''
  let imageUrl: string
  try {
    imageUrl = new URL(imageSrc).toString()
  } catch (error) {
    // Image is likely a absolute path, append the existing origin
    const origin = env.CLIENT_ORIGIN || url.origin
    imageUrl = origin + imageSrc
  }

  const imageRequest = new Request(imageUrl, { headers: request.headers })

  return fetch(imageRequest, options)
}

/**
 * POST to /api/poll creates a new poll
 * @param request 
 * @returns 
 */
const handlePollCreate = async (request: Request, env: Env) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const pollObjectRequest = request.clone()
  const payload = await request.json<PollPayload>()
  payload.choices = payload.choices.filter(choice => !!choice)
  const now = new Date()
  const createdAt = Math.round(now.valueOf() / 1000)
  const metadata = { createdAt }

  const id = env.POLL.newUniqueId()
  const pollObject = env.POLL.get(id)
  env.POLL_META.put(
    id.toString(),
    JSON.stringify(payload),
    // can't use expirationTtl due to cleanup also needed within durable object
    // { expirationTtl: ONE_DAY_IN_SECONDS, metadata }
    { metadata }
  )
  return pollObject.fetch(pollObjectRequest)
}

/**
 * Debug socket, just echo back all received messages
 * @param request 
 * @returns 
 */
const handleSocket = (request: Request) => {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('expected websocket', { status: 426 })
  }

  const { 0: wsClient, 1: ws } = new WebSocketPair()
  ws.accept()

  const handleMessage: EventListener<MessageEvent> = (event) => {
    ws.send(JSON.stringify({ error: 'Poll not found' }))
  }

  const handleCloseOrError: EventListener<Event | CloseEvent> = (event) => {
    if (event instanceof CloseEvent) {
      console.debug('WebSocket closed', event.code, event.reason)
    } else {
      console.warn('WebSocket errored', event)
    }
  }

  ws.addEventListener('message', handleMessage)
  ws.addEventListener('close', handleCloseOrError)
  ws.addEventListener('error', handleCloseOrError)

  return new Response(null, { status: 101, webSocket: wsClient })
}

async function handleApiRequest(path: string[], request: Request, env: Env) {
  switch (path[0]) {
    case 'image':
      return handleImageTransform(request, env)
    case 'poll':
      return handlePollCreate(request, env)
    case 'socket':
      if (path[1] && path[1].match(/^[0-9a-f]{64}$/)) {
        // connecting to the 64 hex digit encoded durable object identifier
        const id = env.POLL.idFromString(path[1])
        const pollObject = env.POLL.get(id)
        return pollObject.fetch(request)
      }
      // else invalid durable object id, just return stub echo 
      return handleSocket(request)
    default:
      const ip = request.headers.get('CF-Connecting-IP')
      return new Response(JSON.stringify({ ...request, ip, cf: request.cf }), { headers: { 'content-type': 'application/json' } })
  }
}

const Handler: ExportedHandler<Env> = {
  fetch: (request, env) =>
    handleErrors(request, () => {
      const url = new URL(request.url)
      const path = url.pathname.slice(1).split('/')

      if (!path[0]) {
        // Redirect back to the client code
        return Response.redirect(env.CLIENT_ORIGIN, 301)
      }

      switch (path[0]) {
        case 'api':
          // This is a request for `/api/...`, call the API handler.
          return handleApiRequest(path.slice(1), request, env)

        default:
          return new Response('Not found', { status: 404 })
      }
    }),

  scheduled: async (controller, env) => {
    // delete all polls that are over 24 hours old
    let cleanupCompleted: boolean = false
    let cursor: string | undefined
    const now = new Date()
    while (!cleanupCompleted) {
      const polls = await env.POLL_META.list<{ createdAt: number }>({ cursor })
      await Promise.all(polls.keys.map(async (key) => {
        if (key.metadata?.createdAt && key.metadata.createdAt + ONE_DAY_IN_SECONDS > (now.valueOf() / 1000)) {
          // do nothing, poll is not 1 day old yet
          return
        }
        // remove the poll and the associated data within the durable object
        const id = env.POLL.idFromString(key.name)
        const doStub = env.POLL.get(id)
        await doStub.fetch(env.CLIENT_ORIGIN + '/delete')
        await env.POLL_META.delete(key.name)
      }))
      cleanupCompleted = polls.list_complete
      cursor = polls.cursor
    }
  }
}

export default Handler
