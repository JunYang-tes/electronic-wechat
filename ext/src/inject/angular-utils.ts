export type Scope = {
  $$childHead: Scope | null
  $$nextSibling: Scope | null
  $id: string
} & Record<string, any>

export function findScope(scope: Scope, predict: (s: Scope) => boolean): Scope | null {
  if (scope) {
    if (predict(scope)) {
      return scope
    }
    let p = scope.$$childHead
    while (p) {
      if (predict(p)) {
        return p
      }
      p = p.$$nextSibling
    }
    p = scope.$$childHead
    while (p) {
      const s = findScope(p, predict)
      if (s) {
        return s
      }
      p = p.$$nextSibling
    }
  }
  return null
}
declare const angular: any
export function getScope(el: HTMLElement) {
  return angular.element(el).scope() as Scope
}
export function getAngularObj(name: string[], callback: (...args: any[]) => void) {
  angular.injector(['ng', 'Services']).invoke([...name, callback]);
}
export function defineServices(name: string, deps: string[], fn: (...args: any[]) => any) {
  angular.module('Services')
    .factory(name, [
      ...deps,
      fn
    ])
}
