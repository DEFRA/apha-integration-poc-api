/**
 * A GDS styled example home page controller.
 * Provided as an example, remove or modify as required.
 * @satisfies {Partial<ServerRoute>}
 */
import { config } from '~/src/config/config.js'
export const connectivityController = {
  handler(_request, h) {
    return h.view('home/index', {
      pageTitle: 'Connectivity',
      heading: 'Connectivity',
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
