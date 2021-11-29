import { Env, PollPayload } from '..'
import handleErrors from '../utils/handleErrors'

interface Session {
  webSocket: WebSocket
  ip: string
}

type StoredChoice = Record<string, number>

const parseMessageData = (event: MessageEvent) => {
  let data: { id?: string, answers?: number[] }
  if (typeof event.data === 'string') {
    data = JSON.parse(event.data)
  } else {
    data = JSON.parse(new TextDecoder().decode(event.data))
  }
  return data
}

export class Poll implements DurableObject {
  sessions: Session[]
  state: DurableObjectState
  env: Env
  pollPayload: PollPayload | undefined

  constructor(state: DurableObjectState, env: Env) {
    this.sessions = []
    this.state = state
    this.env = env
  }

  get id() {
    return typeof this.state.id === 'string' ? this.state.id : this.state.id.toString()
  }

  private getCounts(storedCounts: Map<string, StoredChoice>, ips?: Set<string>) {
    const counts: { name: string, count: number }[] = []

    for (const storedCount of storedCounts) {
      const [strIndex, storedChoice] = storedCount
      let count: number
      if (!storedChoice) {
        count = 0
      } else if (this.pollPayload?.dedup === 'ip') {
        count = Object.keys(storedChoice).length
      } else { // if (pollPayload.dedup === 'none')
        count = Object.values(storedChoice).reduce((prev, cur) => prev + cur, 0)
      }
      ips && Object.keys(storedChoice || {}).forEach(ip => ips.add(ip))
      const name = this.pollPayload?.choices[parseInt(strIndex)] || ''
      counts.push({ name, count })
    }
    return counts
  }

  private async getCountsAndIPs(pollPayload: PollPayload) {
    // retrieve the values from the durable object storage based on the poll choices
    const ips = new Set<string>()
    const storageKeys = pollPayload.choices.map((value, index) => index.toString())
    const storedCounts = await this.state.storage.get<StoredChoice>(storageKeys)
    const counts = this.getCounts(storedCounts, ips)
    return { counts, ips }
  }

  private async getPollPayload(): Promise<PollPayload | undefined> {
    if (!this.pollPayload) {
      const pollDataKV = await this.env.POLL_META.getWithMetadata<PollPayload, { createdAt: number }>(this.id, 'json')
      if (pollDataKV.value) {
        this.pollPayload = pollDataKV.value
      } else {
        this.pollPayload = await this.state.storage.get<PollPayload>('POLL')
      }
    }
    return this.pollPayload
  }

  async handleCreateNewPoll(request: Request) {
    // fallback object for KV storage read miss
    const payload = await request.json<PollPayload>()
    payload.choices = payload.choices.filter(choice => !!choice)
    await Promise.all(
      [
        this.state.storage.put('POLL', payload),
        ...payload.choices.map((_value, index) => this.state.storage.put(index.toString(), {}))
      ]
    )
    return new Response(this.id, { status: 200, headers: { 'Access-Control-Allow-Origin': this.env.CLIENT_ORIGIN } })
  }

  handleEstablishPollSocket(request: Request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 })
    }
    const ip = request.headers.get('CF-Connecting-IP')
    if (!ip) {
      return new Response('expected ip address to exist', { status: 400 })
    }
    const { 0: wsClient, 1: ws } = new WebSocketPair()
    ws.accept()

    const handleMessage: EventListener<MessageEvent> = async (event) => {
      const data = parseMessageData(event)
      if (data.id) {
        // return the poll object
        if (data.id !== this.id) {
          ws.send(JSON.stringify({ error: 'Invalid poll identifier for payload' }))
          return
        }

        const pollPayload = await this.getPollPayload()
        if (!pollPayload) {
          ws.send(JSON.stringify({ error: 'Poll not found' }))
          return
        }

        const { counts } = await this.getCountsAndIPs(pollPayload)
        const value = { ...pollPayload, counts }

        ws.send(JSON.stringify(value))
      } else if (data.answers) {
        // store the provided answer into the durable object storage and broadcast
        const pollPayload = await this.getPollPayload()
        if (!pollPayload) {
          ws.send(JSON.stringify({ error: 'Poll not found' }))
          return
        }
        const { counts, ips } = await this.getCountsAndIPs(pollPayload)

        if (pollPayload.dedup === 'ip' && ips.has(ip)) {
          ws.send(JSON.stringify({ error: 'IP already submitted answer' }))
          return
        }

        const answerKeys = data.answers.map((value) => value.toString())
        const storedAnswerCounts = await this.state.storage.get<StoredChoice>(answerKeys)
        let newCounts = [...counts]

        for (const [strIndex, storedChoice] of storedAnswerCounts) {
          const valueOfStrIdx = pollPayload.choices[parseInt(strIndex)]
          let count: number
          if (!storedChoice) {
            await this.state.storage.put(strIndex, { [ip]: 1 })
            count = 1
          } else { // if (pollPayload.dedup === 'none')
            const newCount = (storedChoice[ip] || 0) + 1
            const newStoredChoice = { ...storedChoice, [ip]: newCount }
            await this.state.storage.put(strIndex, newStoredChoice)
            count = Object.values(newStoredChoice).reduce((prev, cur) => prev + cur, 0)
          }
          const newCountSliceIdx = newCounts.findIndex(({ name }) => name === valueOfStrIdx)
          newCounts = [
            ...newCounts.slice(0, newCountSliceIdx),
            { name: valueOfStrIdx, count },
            ...newCounts.slice(newCountSliceIdx + 1)
          ]
        }

        this.sessions = this.sessions.map((session) => {
          try {
            session.webSocket.send(JSON.stringify({ counts: newCounts }))
            return session
          } catch {
            // remove the websocket from the sessions
            return null
          }
        }).filter((session) => !!session) as Session[]

      } else {
        // just echo back the message
        ws.send(JSON.stringify(data))
      }
    }

    const handleCloseOrError: EventListener<Event | CloseEvent> = (event) => {
      if (event instanceof CloseEvent) {
        console.debug('WebSocket closed', event.code, event.reason)
      } else {
        console.warn('WebSocket errored', event)
      }
      const sessionIndex = this.sessions.findIndex((session) => {
        session.webSocket === ws
      })
      this.sessions = [...this.sessions.slice(0, sessionIndex), ...this.sessions.slice(sessionIndex + 1)]
    }

    ws.addEventListener('message', handleMessage)
    ws.addEventListener('close', handleCloseOrError)
    ws.addEventListener('error', handleCloseOrError)

    this.sessions.push({ webSocket: ws, ip })

    return new Response(null, { status: 101, webSocket: wsClient })
  }

  fetch = async (request: Request) =>
    handleErrors(request, () => {
      const url = new URL(request.url)
      if (url.pathname === '/api/poll') {
        return this.handleCreateNewPoll(request)
      } else if (url.pathname.startsWith('/api/socket')) {
        return this.handleEstablishPollSocket(request)
      }
      return new Response('Not found', { status: 404 })
    })
}
