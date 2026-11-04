// @ts-check
/**
 * @file TypeDoc plugin that hides members inherited from external types.
 *
 * `excludeExternals` removes members inherited from external declarations, but not the members of external mapped
 * types: an interface that extends `Omit<HTMLMotionProps<'div'>, …>` from `framer-motion` would list every HTML and
 * motion prop (hundreds per page). Such members are inherited and have no source in the project, so this plugin
 * removes them. The page still names the extended type, and members inherited from project types are kept.
 *
 * It also removes the `displayName` that components set for React DevTools, which TypeDoc would list as a property
 * (or, for components declared as constants, as a variable of a namespace that has nothing else; such namespaces are
 * removed too, and the component stays documented as a variable).
 */

import { Converter, DeclarationReflection, ReflectionKind } from 'typedoc';

/**
 * TypeDoc plugin entry point. Side effect: removes reflections from the converted project.
 *
 * @param {import('typedoc').Application} app - TypeDoc application instance.
 * @returns {void}
 */
export function load(app) {
  app.converter.on(Converter.EVENT_RESOLVE_END, (context) => {
    const members = context.project.getReflectionsByKind(
      ReflectionKind.Property | ReflectionKind.Method | ReflectionKind.Accessor | ReflectionKind.Variable,
    );
    /** @type {Set<import('typedoc').Reflection>} */
    const emptiedNamespaces = new Set();
    for (const member of members) {
      const isExternalInherited = member.flags.isInherited && !member.sources?.length;
      const isDisplayName =
        member.name === 'displayName' && !member.parent?.kindOf(ReflectionKind.Module | ReflectionKind.Project);
      if (!isExternalInherited && !isDisplayName) continue;
      if (isDisplayName && member.parent?.kindOf(ReflectionKind.Namespace)) emptiedNamespaces.add(member.parent);
      context.project.removeReflection(member);
    }
    for (const namespace of emptiedNamespaces) {
      if (namespace instanceof DeclarationReflection && !namespace.children?.length) {
        context.project.removeReflection(namespace);
      }
    }
  });
}
