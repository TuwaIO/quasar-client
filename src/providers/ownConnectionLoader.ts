import { lazy } from 'react';

/**
 * Loads Nova's own connection layer (`OwnConnection`), which imports the modals of `@tuwaio/nova-connect` and
 * `@tuwaio/satellite-core`. It is a chunk of its own, so an app that never uses `ownConnection` does not load them.
 *
 * @returns The module, in the shape `lazy` of React takes.
 * @internal
 */
export const loadOwnConnection = () => import('./OwnConnection').then((module) => ({ default: module.OwnConnection }));

/**
 * `OwnConnection`, loaded on its first render (see {@link loadOwnConnection}); render it inside `Suspense`.
 *
 * @internal
 */
export const LazyOwnConnection = lazy(loadOwnConnection);
