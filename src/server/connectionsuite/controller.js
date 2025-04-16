/**
 * A GDS styled example home page controller.
 * Provided as an example, remove or modify as required.
 * @satisfies {Partial<ServerRoute>}
 */
import { config } from '~/src/config/config.js'
export const connectionSuiteConnectivityController = {
  handler(_request, h) {
    return h.view('connectionsuite/index', {
      pageTitle: 'Connection Suite',
      heading: 'Connection Suite',
      urlList: config.get('urlList').map((e) => {
        return {
          text: e.text,
          value: e.value,
          selected: e.selected
        }
      })
    })
  }
}

/**
 * @import { ServerRoute } from '@hapi/hapi'
 */
