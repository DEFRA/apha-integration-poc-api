/* eslint-disable camelcase */
import { createLogger } from '~/src/server/common/helpers/logging/logger.js'
// import axios from 'axios'
import util from 'node:util'
import childprocess from 'node:child_process'
import dig from 'node-dig-dns'
import { proxyFetch } from '~/src/server/common/helpers/proxy/proxy-fetch.js'
import { config } from '~/src/config/config.js'
import crypto from 'crypto'

const exec = util.promisify(childprocess.exec)

const makeConnectionController = {
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
    const url = `https://${baseurl}`
    const enabled = requested.query.enabled ?? []
    const pingEnabled = enabled.includes('ping')
    const fetchEnabled = enabled.includes('fetch')
    const digEnabled = enabled.includes('dig')
    const tracepathEnabled = enabled.includes('tracepath')
    const curlEnabled = enabled.includes('curl')
    const nslookupEnabled = enabled.includes('nslookup')

    const curlProxyCommand = process.env.CDP_HTTPS_PROXY
      ? ' -x $CDP_HTTPS_PROXY '
      : ''
    const isBlobStorage = !!urlItem[0].DMP_BLOB_STORAGE_NAME

    const blobStorageConfig = isBlobStorage
      ? generateBlobStorageConfig(urlItem[0], logger)
      : {}

    const curlHeaders = blobStorageConfig.extraHeaders ?? ''
    const fullUrl = url + (blobStorageConfig.queryPath ?? '')

    const curlCommand = `curl ${curlProxyCommand} -v -m 5 -L ${curlHeaders} "${fullUrl}"`

    logger.info(`Starting checks ${fullUrl}`)

    let results = {}

    let pingresult = {}
    let digresult = {}
    let traceresult = ''
    let curlResult = {}
    let nslookupResult = ''
    let checkResponse = {
      status: 0,
      statusText: '[Skipped]',
      // eslint-disable-next-line @typescript-eslint/unbound-method
      text: Promise.resolve
    }
    let responseText

    try {
      if (curlEnabled) {
        logger.info(`Curl command [${curlCommand}]`)
        curlResult = await execRun(curlCommand)
        logger.info(`curlResult Error: ${formatResult(curlResult.stderr)}`)
        logger.info(`curlResult StdOut: ${formatResult(curlResult.stdout)}`)
      }

      if (pingEnabled) {
        pingresult = await execRun(`ping -c 1 ${baseurl}`)
        logger.info(`ping: ${JSON.stringify(pingresult.stderr)}`)
        logger.info(`ping: ${JSON.stringify(pingresult.stdout)}`)
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

      // This no longer has a UI element, but the code is still here (you can technically send a param to trigger it enabled=tracepath)
      // It's hidden as it takes a long time to tracepath and the page often times out.  Results will be in the log though
      if (tracepathEnabled) {
        traceresult = await execRun(`tracepath ${baseurl}`)
        logger.info(`tracepath stdError: ${JSON.stringify(traceresult.stderr)}`)
        logger.info(`tracepath stdOut: ${JSON.stringify(traceresult.stdout)}`)
      }

      if (fetchEnabled) {
        logger.info('Running proxyFetch')
        const headerObject = new Headers([
          ['x-ms-date', blobStorageConfig.headerDate],
          ['x-ms-version', blobStorageConfig.storage_service_version],
          ['Authorization', blobStorageConfig.authorization_header]
        ])
        const proxyFetchOpts = blobStorageConfig.extraHeaders
          ? {
              timeout: 2000,
              headers: headerObject
            }
          : { timeout: 2000 }
        checkResponse = fetchEnabled
          ? await proxyFetch(fullUrl, proxyFetchOpts)
          : { status: 0, statusText: '[Skipped]', text: () => '' }

        logger.info(
          `Status Response : ${checkResponse.status} : ${checkResponse.statusText}`
        )
        responseText = await checkResponse.text()
      }

      results = {
        fullUrl,
        status: checkResponse.status,
        statusText: checkResponse.statusText,
        fetchResultData: formatResult(responseText),
        pingout: formatResult(pingresult.stdout),
        pingoutError: formatResult(pingresult.stderr),
        digout: formatDig(digresult),
        traceout: formatResult(traceresult.stdout),
        traceoutError: formatResult(traceresult.stderr),
        curlResult: formatResult(curlResult.stdout),
        curlResultError: formatResult(curlResult.stderr),
        nslookup: formatResult(nslookupResult.stdout),
        nslookupError: formatResult(nslookupResult.stderr)
      }
    } catch (error) {
      logger.info(error)
      results = {
        fullUrl,
        status: error.code ?? 'None',
        statusText: error.status ?? 'Error',
        fetchResultData: `[none]`,
        pingout: formatResult(pingresult.stdout),
        pingoutError: formatResult(pingresult.stderr),
        errorMessage: error.message,
        stack: error.stack,
        digout: JSON.stringify(digresult),
        traceout: traceresult,
        traceoutError: formatResult(traceresult.stderr),
        curlResult: formatResult(curlResult.stdout),
        curlResultError: formatResult(curlResult.stderr),
        nslookup: formatResult(nslookupResult.stderr),
        nslookupError: formatResult(nslookupResult.stderr)
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

const formatResult = (intext) => {
  return intext
    ? encodeHTML(intext)
        .replace(/\n/g, '<br>')
        .replace(/HTTPS_PROXY.*@/g, 'HTTPS_PROXY == ************@')
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
  originalStr
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>')

const generateBlobStorageConfig = (urlEntry, logger) => {
  const request_method = 'GET'
  const nowDate = new Date().toUTCString()
  const x_ms_date_h = `x-ms-date:${nowDate}`
  const storage_service_version = '2019-12-12'
  const x_ms_version_h = `x-ms-version:${storage_service_version}`

  const storage_account = urlEntry.DMP_BLOB_STORAGE_NAME
  const container_name = urlEntry.DmpBlobContainer

  const string_to_sign = `${request_method}\n\n\n\n\n\n\n\n\n\n\n\n${x_ms_date_h}\n${x_ms_version_h}\n/${storage_account}/${container_name}\ncomp:list\nrestype:container`

  const secret = process.env.AZURE_CLIENT_SECRET ?? 'SECRETSQUIRREL'

  logger.info(
    `Secret is Using ${secret === 'SECRETSQUIRREL' ? 'SECRETSQUIRREL' : 'REALKEY'}`
  )

  const signature = crypto
    .createHmac('SHA256', Buffer.from(secret, 'base64'))
    .update(string_to_sign)
    .digest('base64')

  const authorization = `SharedKey`
  const authorization_header = `Authorization: ${authorization} ${storage_account}:${signature}`

  const queryPath = `/${container_name}?comp=list&restype=container`
  const extraHeaders = `-H "${x_ms_date_h}" -H "${x_ms_version_h}" -H "${authorization_header}"`
  return {
    extraHeaders,
    queryPath,
    headerDate: nowDate,
    storage_service_version,
    authorization_header,
    x_ms_date_h,
    x_ms_version_h
  }
}
