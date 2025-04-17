/* eslint-disable prettier/prettier */
/* eslint-disable camelcase */
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
import { config } from '~/src/config/config.js'
import http from 'http'

const makeConnectionController = {
  handler: async (request, h) => {
    const logger = createLogger()
    const requested = {
      params: request.params,
      query: request.query,
      form: request.form
    }
    logger.info(`Get received request: ${JSON.stringify(requested)}`)
    const baseurl = requested.query.where
    const baseport = requested.query.port

    const testConnectionEnabled = true

    logger.info(`Starting checks ${baseurl} : ${baseport}`)

    let results = {}
    let connectionResult = {}

    try {
      if (testConnectionEnabled) {
        connectionResult = await testConnection(baseurl, baseport)
        logger.info(`testConnection Connected: ${connectionResult.connected}`)
        logger.info(
          `testConnection Error : ${connectionResult.proxyConnectErrCause}`
        )
      }

      results = {
        baseurl,
        baseport,
        connectionResult: connectionResult.connected,
        connectionResultError: connectionResult.proxyConnectErrCause,
        status: '',
        statusText: '',
        errorMessage: ''
      }
    } catch (error) {
      logger.info(error)
      results = {
        baseurl,
        baseport,
        status: error.code ?? 'None',
        statusText: error.status ?? 'Error',
        errorMessage: error.message ?? '',
        stack: error.stack,
        connectionResult: connectionResult.connected,
        connectionResultError: connectionResult.proxyConnectErrCause
      }
    }

    logger.info(`result: ${JSON.stringify(results)}`)

    return h.view('home/connections', {
      pageTitle: `Connection result`,
      heading: `Connection result`,
      breadcrumbs: [
        {
          text: 'Home',
          href: '/'
        }
      ],
      checkResult: results,
      lastUpdated: 'Today'
    })
  }
}

export { makeConnectionController }

const testConnection = async (address, baseport) => {
  const proxyConfig = config.get('httpProxy')
  const proxyUrl = proxyConfig
    ? new URL(proxyConfig)
    : new URL('http://localhost:1234')

  let proxyConnectErrCause = ''
  let req
  const httpsProxy = proxyUrl.hostname
  const httpsProxyPort = proxyUrl.port
  const destination = address
  const destinationPort = baseport
  const logger = createLogger()
  const loginfo =
    'Attempting proxy based connection [' +
    httpsProxy +
    '] [' +
    httpsProxyPort +
    '] [' +
    destination +
    '] [' +
    destinationPort +
    ']'

  logger.info(loginfo)

  let connected = false

  await new Promise((resolve) => {
    req = http.request({
      host: httpsProxy,
      port: httpsProxyPort,
      method: 'CONNECT',
      path: destination + ':' + destinationPort
    })
    req.once('connect', (res) => {
      if (res.statusCode === 200) {
        connected = true
      } else {
        proxyConnectErrCause = res.statusCode
      }
      resolve()
    })
    req.once('error', (err) => {
      proxyConnectErrCause = err.message
      resolve()
    })
    req.end()
  })
  if (req) req.removeAllListeners()

  if (!connected) {
    if (proxyConnectErrCause) {
      logger.info(
        'Error making connection: ProxyConnectionError: ' + proxyConnectErrCause
      )
    } else {
      logger.info('Error making connection: Incomplete Connection: ')
    }
  }

  return {
    connected,
    proxyConnectErrCause
  }
}
