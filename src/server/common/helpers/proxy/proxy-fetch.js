import { config } from '~/src/config/config.js'
import { ProxyAgent, fetch } from 'undici'

const proxyFetch = (url, opts) => {
  const proxy = config.get('httpProxy')
  if (!proxy) {
    return fetch(url, opts)
  } else {
    return fetch(url, {
      ...opts,
      dispatcher: new ProxyAgent({
        uri: proxy,
        keepAliveTimeout: 10,
        keepAliveMaxTimeout: 10
      })
    })
  }
}

export { proxyFetch }
