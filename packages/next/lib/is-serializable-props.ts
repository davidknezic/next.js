const regexpPlainIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function isPlainObject(value: any): boolean {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

export function isSerializableProps(
  page: string,
  method: string,
  props: any
): true {
  if (!isPlainObject(props)) {
    throw new SerializableError(
      page,
      method,
      '',
      `Props must be returned as a plain object from ${method}: \`{ props: { ... } }\`.`
    )
  }

  function visit(visited: Map<any, string>, value: any, path: string) {
    if (visited.has(value)) {
      throw new SerializableError(
        page,
        method,
        path,
        `Circular references cannot be expressed in JSON (references: \`${visited.get(
          value
        ) || '(self)'}\`).`
      )
    }

    visited.set(value, path)
  }

  function isSerializable(
    refs: Map<any, string>,
    input: any,
    path: string
  ): true {
    let value: any
    if (input && typeof input.toJSON === 'function') {
      try {
        value = input.toJSON()
      } catch (error) {
        throw new SerializableError(
          page,
          method,
          path,
          `Unknown error encountered while calling toJSON: ${error.toString()}`
        )
      }
    } else {
      value = input
    }

    const type = typeof value
    if (
      // `null` can be serialized, but not `undefined`.
      value === null ||
      // n.b. `bigint`, `function`, `symbol`, and `undefined` cannot be
      // serialized.
      //
      // `object` is special-cased below, as it may represent `null`, an Array,
      // a plain object, a class, et al.
      type === 'boolean' ||
      type === 'number' ||
      type === 'string'
    ) {
      return true
    }

    if (type === 'undefined') {
      throw new SerializableError(
        page,
        method,
        path,
        '`undefined` cannot be serialized as JSON. Please use `null` or omit this value all together.'
      )
    }

    if (isPlainObject(value)) {
      visit(refs, value, path)

      if (
        Object.entries(value).every(([key, value]) => {
          const nextPath = regexpPlainIdentifier.test(key)
            ? `${path}.${key}`
            : `${path}[${JSON.stringify(key)}]`

          const newRefs = new Map(refs)
          return (
            isSerializable(newRefs, key, nextPath) &&
            isSerializable(newRefs, value, nextPath)
          )
        })
      ) {
        return true
      }

      throw new SerializableError(
        page,
        method,
        path,
        `invariant: Unknown error encountered in Object.`
      )
    }

    if (Array.isArray(value)) {
      visit(refs, value, path)

      const newRefs = new Map(refs)
      if (
        value.every((value, index) =>
          isSerializable(newRefs, value, `${path}[${index}]`)
        )
      ) {
        return true
      }

      throw new SerializableError(
        page,
        method,
        path,
        `invariant: Unknown error encountered in Array.`
      )
    }

    // None of these can be expressed as JSON:
    // const type: "bigint" | "symbol" | "object" | "function"
    throw new SerializableError(
      page,
      method,
      path,
      '`' +
        type +
        '`' +
        (type === 'object'
          ? ` ("${Object.prototype.toString.call(value)}")`
          : '') +
        ' cannot be serialized as JSON. Please only return JSON serializable data types.'
    )
  }

  return isSerializable(new Map(), props, '')
}

export class SerializableError extends Error {
  constructor(page: string, method: string, path: string, message: string) {
    super(
      path
        ? `Error serializing \`${path}\` returned from \`${method}\` in "${page}".\nReason: ${message}`
        : `Error serializing props returned from \`${method}\` in "${page}".\nReason: ${message}`
    )
  }
}
