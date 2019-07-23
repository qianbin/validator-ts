/**
 * Rule function type
 * non empty return value indicates error message
 */
export type Rule<T> = (value: T, context?: string) => string

/** Scheme type */
export type Scheme<T>
    = (T extends object ? { [P in keyof T]-?: Scheme<T[P]> } : never) | Rule<T>

/**
 * convert the given Scheme into a Rule that allows undefined value
 * @param scheme the scheme
 */
export function optional<T>(scheme: Scheme<T>): Rule<T> {
    return (value: T, context?: string) => {
        if (value !== undefined) {
            validate<T>(value, scheme, context)
        }
        return ''
    }
}

/**
 * convert the given Scheme into a Rule that allows null value
 * @param scheme the scheme
 */
export function nullable<T>(scheme: Scheme<T>): Rule<T> {
    return (value: T, context?: string) => {
        if (value !== null) {
            validate<T>(value, scheme, context)
        }
        return ''
    }
}

/** Validator class */
export class Validator<T> {
    constructor(readonly scheme: Scheme<T>) { }

    public test(value: T, context?: string) {
        return validate<T>(value, this.scheme, context)
    }
}

/** Error class describes validation error */
export class ValidationError extends Error {
    constructor(msg: string, readonly context: string) {
        super(msg)
    }
}

ValidationError.prototype.name = 'ValidationError'

/**
 * direct function to validate value without construct Validator object
 * @param value value to be validated
 * @param scheme scheme
 * @param context context string appears in error object
 */
export function validate<T>(value: T, scheme: Scheme<T>, context?: string) {
    if (Array.isArray(scheme)) {
        if (!Array.isArray(value)) {
            throw new ValidationError('expected array', context || '')
        }
        value.forEach((el, i) =>
            validate(el, scheme[0], context ? `${context}.#${i}` : `#${i}`))
    } else if (scheme instanceof Function) {
        const errMsg = scheme(value, context)
        if (errMsg) {
            throw new ValidationError(errMsg, context || '')
        }
    } else {
        if (!(value instanceof Object)) {
            throw new ValidationError('expected object', context || '')
        }
        for (const key in scheme) {
            if (scheme.hasOwnProperty(key)) {
                validate(value[key as never], scheme[key], context ? `${context}.${key}` : key)
            }
        }
    }
    return value
}
