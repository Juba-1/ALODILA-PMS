import { registerPlatformI18n } from './i18n/registerPlatformI18n.js'
import PlatformRoutes from './PlatformRoutes.jsx'

registerPlatformI18n()

/** Public Platform barrel — App.jsx may import from here only. */
export { PlatformRoutes }
export default PlatformRoutes
