export const getWorkerOrigin = () => process.env.NEXT_PUBLIC_WORKER_ORIGIN || 'https://next-udia-ca.udia.workers.dev'

export const getWorkerSocketOrigin = () => {
  const workerOrigin = getWorkerOrigin()
  const { protocol, host } = new URL(workerOrigin)
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:'
  return wsProto + '//' + host
}