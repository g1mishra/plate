import { SyntaxKind } from 'ts-morph';
import * as z from 'zod';

import { registryBaseColorSchema } from '../registry/schema';
import { Transformer } from '../transformers';

export const transformCssVars: Transformer = async ({
  sourceFile,
  config,
  baseColor,
}) => {
  // No transform if using css variables.
  if (config.tailwind?.cssVariables || !baseColor?.inlineColors) {
    return sourceFile;
  }

  // Find jsx attributes with the name className.
  // const openingElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)
  // const jsxAttributes = sourceFile
  //   .getDescendantsOfKind(SyntaxKind.JsxAttribute)
  //   .filter((node) => node.getName() === "className")

  // for (const jsxAttribute of jsxAttributes) {
  //   const value = jsxAttribute.getInitializer()?.getText()
  //   if (value) {
  //     const valueWithColorMapping = applyColorMapping(
  //       value.replace(/"/g, ""),
  //       baseColor.inlineColors
  //     )
  //     jsxAttribute.setInitializer(`"${valueWithColorMapping}"`)
  //   }
  // }
  sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral).forEach((node) => {
    const value = node.getText();
    if (value) {
      const valueWithColorMapping = applyColorMapping(
        value.replace(/'/g, '').replace(/"/g, ''),
        baseColor.inlineColors
      );
      node.replaceWithText(`'${valueWithColorMapping.trim()}'`);
    }
  });

  return sourceFile;
};

// export default function transformer(file: FileInfo, api: API) {
//   const j = api.jscodeshift.withParser("tsx")

//   // Replace bg-background with "bg-white dark:bg-slate-950"
//   const $j = j(file.source)
//   return $j
//     .find(j.JSXAttribute, {
//       name: {
//         name: "className",
//       },
//     })
//     .forEach((path) => {
//       const { node } = path
//       if (node?.value?.type) {
//         if (node.value.type === "StringLiteral") {
//           node.value.value = applyColorMapping(node.value.value)
//         }

//         if (
//           node.value.type === "JSXExpressionContainer" &&
//           node.value.expression.type === "CallExpression"
//         ) {
//           const callee = node.value.expression.callee
//           if (callee.type === "Identifier" && callee.name === "cn") {
//             node.value.expression.arguments.forEach((arg) => {
//               if (arg.type === "StringLiteral") {
//                 arg.value = applyColorMapping(arg.value)
//               }

//               if (
//                 arg.type === "LogicalExpression" &&
//                 arg.right.type === "StringLiteral"
//               ) {
//                 arg.right.value = applyColorMapping(arg.right.value)
//               }
//             })
//           }
//         }
//       }
//     })
//     .toSource()
// }

// // export function splitClassName(input: string): (string | null)[] {
// //   const parts = input.split(":")
// //   const classNames = parts.map((part) => {
// //     const match = part.match(/^\[?(.+)\]$/)
// //     if (match) {
// //       return match[1]
// //     } else {
// //       return null
// //     }
// //   })

// //   return classNames
// // }

// Splits a className into variant-name-alpha.
// eg. hover:bg-primary-100 -> [hover, bg-primary, 100]
export function splitClassName(className: string): (string | null)[] {
  if (!className.includes('/') && !className.includes(':')) {
    return [null, className, null];
  }

  const parts: (string | null)[] = [];
  // First we split to find the alpha.
  const [rest, alpha] = className.split('/');

  // Check if rest has a colon.
  if (!rest.includes(':')) {
    return [null, rest, alpha];
  }

  // Next we split the rest by the colon.
  const split = rest.split(':');

  // We take the last item from the split as the name.
  const name = split.pop();

  // We glue back the rest of the split.
  const variant = split.join(':');

  // Finally we push the variant, name and alpha.
  parts.push(variant ?? null, name ?? null, alpha ?? null);

  return parts;
}

const PREFIXES = ['bg-', 'text-', 'border-', 'ring-offset-', 'ring-'];

export function applyColorMapping(
  input: string,
  mapping: z.infer<typeof registryBaseColorSchema>['inlineColors']
) {
  // Handle border classes.
  if (input.includes(' border ')) {
    input = input.replace(' border ', ' border border-border ');
  }

  // Build color mappings.
  const classNames = input.split(' ');
  const lightMode: string[] = [];
  const darkMode: string[] = [];
  for (const className of classNames) {
    const [variant, value, modifier] = splitClassName(className);
    const prefix = PREFIXES.find((pre) => value?.startsWith(pre));
    if (!prefix) {
      if (!lightMode.includes(className)) {
        lightMode.push(className);
      }
      continue;
    }

    const needle = value?.replace(prefix, '');
    if (needle && needle in mapping.light) {
      lightMode.push(
        [variant, `${prefix}${mapping.light[needle]}`]
          .filter(Boolean)
          .join(':') + (modifier ? `/${modifier}` : '')
      );

      darkMode.push(
        ['dark', variant, `${prefix}${mapping.dark[needle]}`]
          .filter(Boolean)
          .join(':') + (modifier ? `/${modifier}` : '')
      );
      continue;
    }

    if (!lightMode.includes(className)) {
      lightMode.push(className);
    }
  }

  return lightMode.join(' ') + ' ' + darkMode.join(' ').trim();
}
