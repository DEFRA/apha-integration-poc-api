import { connectionSuiteConnectivityController } from '~/src/server/connectionsuite/controller.js'
import { connectionSuiteMakeConnectionController } from '~/src/server/connectionsuite/connections.js'

/**
 * Sets up the routes used in the home page.
 * These routes are registered in src/server/router.js.
 */

/**
 * @satisfies {ServerRegisterPluginObject<void>}
 */
export const connectionSuite = {
  plugin: {
    name: 'connectionsuite',
    register: (server) => {
      server.route([
        {
          method: 'GET',
          path: '/connectionsuite',
          ...connectionSuiteConnectivityController
        },
        {
          method: 'GET',
          path: '/connectionsuite/connections',
          ...connectionSuiteMakeConnectionController
        }
      ])
    }
  }
}

/**
 * @import { ServerRegisterPluginObject } from '@hapi/hapi'
 */
