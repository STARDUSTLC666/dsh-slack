/**
 * 本地假 Slack Web API 服务器（协议级验收 + 回归测试基建，零依赖）。
 * 支持端点：
 *  - POST /api/chat.postMessage（支持 blocks，返回规范化 channel ID）
 *  - POST/GET /api/users.conversations
 *  - POST/GET /api/conversations.list
 *  - POST/GET /api/auth.test（返回 X-OAuth-Scopes 头）
 *  - POST/GET /api/conversations.history
 *  - POST/GET /api/conversations.replies
 *  - POST/GET /api/users.info
 *  - POST /api/reactions.add
 *  - POST /api/files.getUploadURLExternal
 *  - POST /upload/:fileId（filesUploadV2 外部上传步骤）
 *  - POST /api/files.completeUploadExternal
 *
 * 行为约定：
 *  - token = xoxb-bad  -> 返回 invalid_auth
 *  - channel = missing -> 返回 channel_not_found
 *  - 其余              -> 返回 ok，回显数据并记录收到的请求供断言
 */
import { createServer } from 'node:http'

const CHANNEL_NAME_TO_ID = {
  '#general': 'C001',
  general: 'C001',
  '#random': 'C002',
  random: 'C002',
  '#secret': 'G003',
  secret: 'G003',
}

function canonicalChannel(input) {
  if (!input) return ''
  return CHANNEL_NAME_TO_ID[input] ?? input
}

export function startFakeSlackServer(port = 3999) {
  const requests = []
  const uploadedFiles = new Map()
  let fileSeq = 0

  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => { chunks.push(chunk) })
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      const url = req.url ?? ''
      const auth = req.headers.authorization ?? ''
      const token = auth.replace(/^Bearer\s+/i, '')
      requests.push({ method: req.method, url, token, body })

      const json = (status, payload, extraHeaders = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders })
        res.end(JSON.stringify(payload))
      }

      const parsed = Object.fromEntries(new URLSearchParams(body))
      const address = server.address()
      const boundPort = typeof address === 'object' && address !== null ? address.port : port

      if (url.startsWith('/upload/')) {
        const fileId = url.slice('/upload/'.length)
        uploadedFiles.set(fileId, { ...(uploadedFiles.get(fileId) ?? {}), uploaded: true, rawBody: body })
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('OK')
        return
      }

      if (token === 'xoxb-bad') {
        return json(200, { ok: false, error: 'invalid_auth' })
      }

      if (url.includes('/chat.postMessage')) {
        if (parsed.channel === 'missing') return json(200, { ok: false, error: 'channel_not_found' })
        return json(200, {
          ok: true,
          ts: '1700000000.000100',
          channel: canonicalChannel(parsed.channel ?? ''),
        })
      }

      if (url.includes('/users.conversations')) {
        const types = (parsed.types ?? 'public_channel,private_channel').split(',')
        const channels = []
        if (types.includes('public_channel')) {
          channels.push({ id: 'C001', name: 'general', is_private: false, is_member: true, num_members: 12 })
        }
        if (types.includes('private_channel')) {
          channels.push({ id: 'G003', name: 'secret', is_private: true, is_member: true, num_members: 3 })
        }
        return json(200, { ok: true, channels })
      }

      if (url.includes('/conversations.list')) {
        const types = (parsed.types ?? 'public_channel,private_channel').split(',')
        const channels = []
        if (types.includes('public_channel')) {
          channels.push({ id: 'C001', name: 'general', is_private: false, is_member: true, num_members: 12 })
          channels.push({ id: 'C002', name: 'random', is_private: false, is_member: false, num_members: 20 })
        }
        if (types.includes('private_channel')) {
          channels.push({ id: 'G003', name: 'secret', is_private: true, is_member: true, num_members: 3 })
        }
        return json(200, { ok: true, channels })
      }

      if (url.includes('/auth.test')) {
        return json(
          200,
          {
            ok: true,
            url: 'https://fake.slack.com/',
            team: 'Fake Workspace',
            user: 'dsh-bot',
            team_id: 'T001',
            user_id: 'UBOT01',
            bot_id: 'B001',
          },
          {
            'X-OAuth-Scopes': 'chat:write,channels:read,groups:read,channels:history,files:write,reactions:write,users:read',
          },
        )
      }

      if (url.includes('/conversations.history')) {
        if (parsed.channel === 'missing') return json(200, { ok: false, error: 'channel_not_found' })
        const limit = Number(parsed.limit) || 20
        const all = [
          {
            ts: '1700000002.000200',
            user: 'U001',
            text: '最新进展：构建通过',
            thread_ts: '1700000002.000200',
            reply_count: 1,
            files: [{ name: 'build.log', mimetype: 'text/plain', size: 128 }],
          },
          {
            ts: '1700000001.000100',
            user: 'U002',
            text: '开始检查部署脚本',
          },
        ]
        return json(200, {
          ok: true,
          messages: all.slice(0, limit),
          has_more: all.length > limit,
        })
      }

      if (url.includes('/conversations.replies')) {
        if (parsed.channel === 'missing') return json(200, { ok: false, error: 'channel_not_found' })
        const threadTs = parsed.ts || '1700000002.000200'
        const limit = Number(parsed.limit) || 50
        const thread = [
          { ts: threadTs, thread_ts: threadTs, user: 'U001', text: '主消息：发版检查清单', reply_count: 1 },
          { ts: '1700000003.000300', thread_ts: threadTs, user: 'U002', text: '测试全部通过，可以发布' },
        ]
        return json(200, {
          ok: true,
          messages: thread.slice(0, limit),
          has_more: thread.length > limit,
        })
      }

      if (url.includes('/users.info')) {
        const users = {
          U001: { id: 'U001', name: 'alice', real_name: 'Alice Chen', profile: { display_name: 'Alice' } },
          U002: { id: 'U002', name: 'bob', real_name: 'Bob Wu', profile: { display_name: '' } },
        }
        const user = users[parsed.user]
        if (!user) return json(200, { ok: false, error: 'user_not_found' })
        return json(200, { ok: true, user })
      }

      if (url.includes('/reactions.add')) {
        if (parsed.channel === 'missing') return json(200, { ok: false, error: 'channel_not_found' })
        if (parsed.name === 'already') return json(200, { ok: false, error: 'already_reacted' })
        return json(200, { ok: true })
      }

      if (url.includes('/files.getUploadURLExternal')) {
        fileSeq += 1
        const fileId = 'F' + String(fileSeq).padStart(4, '0')
        const filename = parsed.filename || 'file.txt'
        uploadedFiles.set(fileId, { id: fileId, filename, length: Number(parsed.length) || 0, uploaded: false })
        return json(200, {
          ok: true,
          upload_url: `http://127.0.0.1:${boundPort}/upload/${fileId}`,
          file_id: fileId,
        })
      }

      if (url.includes('/files.completeUploadExternal')) {
        let items = []
        try { items = JSON.parse(parsed.files || '[]') } catch { items = [] }
        const files = items.map((item) => {
          const stored = uploadedFiles.get(item.id) ?? {}
          return {
            id: item.id,
            name: stored.filename || 'file.txt',
            title: item.title || stored.filename || 'file.txt',
            permalink: `https://fake.slack.com/files/${item.id}`,
          }
        })
        return json(200, { ok: true, files })
      }

      return json(404, { ok: false, error: 'unknown_method' })
    })
  })

  return {
    get port() {
      const addr = server.address()
      return typeof addr === 'object' && addr !== null ? addr.port : port
    },
    requests,
    uploadedFiles,
    start() { return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)) },
    close() {
      server.closeAllConnections?.()
      return new Promise((resolve) => server.close(resolve))
    },
  }
}
