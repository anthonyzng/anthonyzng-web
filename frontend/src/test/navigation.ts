import type { Location, NavigateFunction } from 'react-router'

/**
 * Set by <NavigationHandle /> so a test can drive the router it rendered (navigation.to?.('/en'))
 * and read where it is (navigation.location?.hash).
 */
export const navigation: { to: NavigateFunction | null; location: Location | null } = { to: null, location: null }
