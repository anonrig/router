import type {
  FileRoutesByPath as AppFileRoutesByPath,
  Register as AppRegister,
  StaticDataRouteOption as AppStaticDataRouteOption,
} from './index'

declare module 'speedy-router-core' {
  interface Register extends AppRegister {}
  interface StaticDataRouteOption extends AppStaticDataRouteOption {}
  interface FileRoutesByPath extends AppFileRoutesByPath {}
}
