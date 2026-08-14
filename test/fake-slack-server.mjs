/**
 * 本地假 Slack Web API 服务器（协议级验收 + 回归测试基建，零依赖）。
 * 端点：POST /api/chat.postMessage、GET /api/conversations.list。
 * 行为约定：
 *  - token = xoxb-bad  -> 返回 invalid_auth
 *  - channel = missing -> 返回 channel_not_found
 *  - 其余            -> 返回 ok，回显 ts/channel，并记录收到的请求供断言
 */
import { createServer } from 'node:http'

export function startFakeSlackServer(port = 3999) {
  const requests = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const url = req.url ?? ''
      const auth = req.headers.authorization ?? ''
      const token = auth.replace(/^Bearer\s+/i, '')
      requests.push({ method: req.method, url, token, body })
      const json = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      if (url.includes('/chat.postMessage')) {
        if (token === 'xoxb-bad') return json(200, { ok: false, error: 'invalid_auth' })
        const parsed = Object.fromEntries(new URLSearchParams(body))
        if (parsed.channel === 'missing') return json(200, { ok: false, error: 'channel_not_found' })
        return json(200, { ok: true, ts: '1700000000.000100', channel: parsed.channel ?? '' })
      }
      if (url.includes('/conversations.list')) {
        if (token === 'xoxb-bad') return json(200, { ok: false, error: 'invalid_auth' })
        return json(200, {
          ok: true,
          channels: [
            { id: 'C001', name: 'general' },
            { id: 'C002', name: 'random' },
          ],
        })
      }
      return json(404, { ok: false, error: 'unknown_method' })
    })
  })
  return {
    port,
    requests,
    start() { return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)) },
    close() { return new Promise((resolve) => server.close(resolve)) },
  }
}
