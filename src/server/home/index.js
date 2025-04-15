import { connectivityController } from '~/src/server/home/controller.js'
import { makeConnectionController } from '~/src/server/home/connections.js'

/**
 * Sets up the routes used in the home page.
 * These routes are registered in src/server/router.js.
 */

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const home = {
  plugin: {
    name: 'connectivity',
    register: (server) => {
      server.route([
        {
          method: 'GET',
          path: '/',
          ...connectivityController
        },
        {
          method: 'GET',
          path: '/connections',
          ...makeConnectionController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
