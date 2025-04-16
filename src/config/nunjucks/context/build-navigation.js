/**
 * @param {Partial<Request> | null} request
 */
export function buildNavigation(request) {
  return [
    {
      text: 'Home',
      url: '/',
      isActive: request?.path === '/'
    },
    {
      text: 'Connection Suite',
      url: '/connectionsuite',
      isActive: request?.path === '/connectionsuite'
    },
    {
      text: 'About',
      url: '/about',
      isActive: request?.path === '/about'
    }
  ]
}

/**
 * @import { Request } from '@hapi/hapi'
 */
