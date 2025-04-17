/* eslint-disable prettier/prettier */
/* eslint-disable camelcase */
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
// import axios from 'axios'
import util from 'node:util'
import childprocess from 'node:child_process'
import dig from 'node-dig-dns'
import { proxyFetch } from '~/src/server/common/helpers/proxy/proxy-fetch.js'
import { config } from '~/src/config/config.js'
import oracledb from 'oracledb'
import http from 'http'

const exec = util.promisify(childprocess.exec)

const connectionSuiteMakeConnectionController = {
  handler: async (request, h) => {
    const logger = createLogger()
    const requested = {
      params: request.params,
      query: request.query,
      form: request.form
    }
    logger.info(`Get received request: ${JSON.stringify(requested)}`)
    const resource = requested.query.resource
    const urlList = config.get('urlList')
    logger.info(`urlList: ${JSON.stringify(urlList)}`)
    const where = requested.query.where
    const urlItem =
      where && where.length > 0
        ? [{ text: where, url: where, value: 99 }]
        : urlList.filter((e) => `${e.value}` === resource)
    logger.info(`urlItem: ${JSON.stringify(urlItem)}`)
    const baseurl = urlItem[0].url
    const enabled = requested.query.enabled ?? []
    const fetchEnabled = enabled.includes('fetch')
    const digEnabled = enabled.includes('dig')
    const curlEnabled = enabled.includes('curl')
    const nslookupEnabled = enabled.includes('nslookup')
    const dbEnabled = enabled.includes('dbFull')
    const dbAltEnabled = enabled.includes('dbAlt')
    const testConnectionEnabled = enabled.includes('testConnection')

    const curlProxyCommand = process.env.CDP_HTTPS_PROXY
      ? ' -x $CDP_HTTPS_PROXY '
      : ''

    const fullUrl = `https://${baseurl}`

    const curlCommand = `curl ${curlProxyCommand} -v -m 5 -L "${fullUrl}"`

    logger.info(`Starting checks ${baseurl}`)

    let results = {}

    let digresult = {}
    let curlResult = {}
    let nslookupResult = ''
    let checkResponse = {
      status: 0,
      statusText: '[Skipped]',
      // eslint-disable-next-line @typescript-eslint/unbound-method
      text: Promise.resolve
    }
    let responseText
    let dbResult = {}
    let dbAltResult = {}
    let connectionResult = {}

    try {
      if (testConnectionEnabled) {
        connectionResult = await testConnection(baseurl)
        logger.info(`testConnection Connected: ${connectionResult.connected}`)
        logger.info(
          `testConnection Error : ${connectionResult.proxyConnectErrCause}`
        )
      }

      if (curlEnabled) {
        logger.info(`Curl command [${curlCommand}]`)
        curlResult = await execRun(curlCommand)
        logger.info(`curlResult Error: ${formatResult(curlResult.stderr)}`)
        logger.info(`curlResult StdOut: ${formatResult(curlResult.stdout)}`)
      }

      if (digEnabled) {
        digresult = await digRun(`${baseurl}`)
        logger.info(`dig: ${JSON.stringify(digresult)}`)
      }

      if (nslookupEnabled) {
        nslookupResult = await execRun(`nslookup ${baseurl}`)
        logger.info(
          `nslookupResult stdError: ${JSON.stringify(nslookupResult.stderr)}`
        )
        logger.info(
          `nslookupResult stdOut: ${JSON.stringify(nslookupResult.stdout)}`
        )
      }

      if (fetchEnabled) {
        logger.info('Running proxyFetch')

        const proxyFetchOpts = { timeout: 2000 }
        checkResponse = fetchEnabled
          ? await proxyFetch(fullUrl, proxyFetchOpts)
          : { status: 0, statusText: '[Skipped]', text: () => '' }

        logger.info(
          `Status Response : ${checkResponse.status} : ${checkResponse.statusText}`
        )
        responseText = await checkResponse.text()
      }

      if (dbEnabled) {
        logger.info('Running dbconnection test')
        dbResult = await dbRun(baseurl)
      }

      if (dbAltEnabled) {
        logger.info('Running dbconnection test')
        dbAltResult = await dbAltRun(baseurl)
      }

      results = {
        baseurl,
        status: checkResponse.status,
        statusText: checkResponse.statusText,
        fetchResultData: formatResult(responseText),
        digout: formatDig(digresult),
        curlResult: formatResult(curlResult.stdout),
        curlResultError: formatResult(curlResult.stderr),
        nslookup: formatResult(nslookupResult.stdout),
        nslookupError: formatResult(nslookupResult.stderr),
        dbResult: formatResult(dbResult.rows),
        dbResultError: formatResult(dbResult.errorMessage),
        dbAltResult: formatResult(dbAltResult.rows),
        dbAltResultError: formatResult(dbAltResult.errorMessage),
        connectionResult: connectionResult.connected,
        connectionResultError: formatResult(
          connectionResult.proxyConnectErrCause
        )
      }
    } catch (error) {
      logger.info(error)
      results = {
        baseurl,
        status: error.code ?? 'None',
        statusText: error.status ?? 'Error',
        fetchResultData: `[none]`,
        errorMessage: error.message,
        stack: error.stack,
        digout: JSON.stringify(digresult),
        curlResult: formatResult(curlResult.stdout),
        curlResultError: formatResult(curlResult.stderr),
        nslookup: formatResult(nslookupResult.stderr),
        nslookupError: formatResult(nslookupResult.stderr),
        dbResult: formatResult(dbResult.rows),
        dbResultError: formatResult(dbResult.errorMessage),
        dbAltResult: formatResult(dbAltResult.rows),
        dbAltResultError: formatResult(dbAltResult.errorMessage),
        connectionResult: connectionResult.connected,
        connectionResultError: formatResult(
          connectionResult.proxyConnectErrCause
        )
      }
    }

    logger.info(`result: ${JSON.stringify(results)}`)

    return h.view('connectionsuite/connections', {
      pageTitle: `Connection Suite result`,
      heading: `Connection Suite result`,
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

export { connectionSuiteMakeConnectionController }

const execRun = (cmd) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    exec(cmd, (_error, stdout, stderr) => {
      resolve({ stderr, stdout })
    })
  })
}

const digRun = (baseUrl) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return new Promise((resolve, reject) => {
    dig([baseUrl, 'ANY'])
      .then((result) => {
        return resolve(result)
      })
      .catch((err) => {
        return resolve(err)
      })
  })
}

const dbRun = async (address) => {
  // const proxyConfig = config.get('httpProxy')
  // const proxyUrl = new URL(proxyConfig)
  // const proxyFinalConfig = proxyConfig
  //   ? `?https_proxy=${proxyUrl.hostname}&https_proxy_port=${proxyUrl.port}`
  //   : ''
  let runResults = {}

  let connection
  try {
    connection = await oracledb.getConnection({
      user: 'test',
      password: 'this is not a password',
      connectString: `${address}`
    })

    const result = await connection.execute(`SELECT * FROM dual`)
    runResults = {
      rows: result?.rows ?? 'No rows returned',
      errorMessage: connection.errorMessage ?? 'No Error message'
    }
  } catch (ex) {
    runResults = {
      rows: 'Error occured',
      errorMessage:
        ex.message +
        '\n\nStackTrace:\n' +
        ex.stack +
        '\n\nError Code:\n' +
        ex.code
    }
  } finally {
    if (connection) {
      await connection.close()
    }
  }
  return runResults
}

const dbAltRun = async (address) => {
  const proxyConfig = config.get('httpProxy')
  const proxyUrl = proxyConfig
    ? new URL(proxyConfig)
    : new URL('http://localhost:1234')
  // const proxyFinalConfig = proxyConfig
  //   ? `?https_proxy=${proxyUrl.hostname}&https_proxy_port=${proxyUrl.port}`
  //   : ''
  let runResults = {}

  let connection
  try {
    connection = await oracledb.getConnection({
      user: 'test',
      password: 'this is not a password',
      connectString: `${address}`,
      httpsProxy: proxyUrl.hostname,
      httpsProxyPort: +proxyUrl.port
    })

    const result = await connection.execute(`SELECT * FROM dual`)
    runResults = {
      rows: result?.rows ?? 'No rows returned',
      errorMessage: connection.errorMessage ?? 'No Error message'
    }
  } catch (ex) {
    runResults = {
      rows: 'Error occured',
      errorMessage:
        ex.message +
        '\n\nStackTrace:\n' +
        ex.stack +
        '\n\nError Code:\n' +
        ex.code
    }
  } finally {
    if (connection) {
      await connection.close()
    }
  }
  return runResults
}

const formatResult = (intext) => {
  return intext
    ? encodeHTML(intext)
        .replace(/\n/g, '<br>')
        .replace(/HTTPS_PROXY.*@/g, 'HTTPS_PROXY == ************@')
        .replace(/https_proxy.*/g, 'https_proxy == ************')
    : ''
}

const formatDig = (digResult) => {
  // return encodeHTML(JSON.stringify(digResult, null))
  return digResult?.answer
    ? digResult.answer
        .map((e) =>
          encodeHTML(`${e.domain} ${e.type} ${e.ttl} ${e.class} ${e.value}`)
        )
        .join('<br>')
    : ''
}

const encodeHTML = (originalStr) =>
  originalStr.replace
    ? originalStr
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, '<br>')
    : originalStr

const testConnection = async (address) => {
  const proxyConfig = config.get('httpProxy')
  const proxyUrl = proxyConfig
    ? new URL(proxyConfig)
    : new URL('http://localhost:1234')

  const addressUrl = address.split(':')

  let proxyConnectErrCause = ''
  let req
  const httpsProxy = proxyUrl.hostname
  const httpsProxyPort = proxyUrl.port
  const destination = addressUrl[0]
  const destinationPort = addressUrl[1]
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
      port: +httpsProxyPort,
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
