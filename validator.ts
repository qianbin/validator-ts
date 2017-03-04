
const scopeStack: (string | number)[] = []

function raiseError(desc: string, prefix?: string) {
    const fullScope = scopeStack.map((v, i) => {
        let str: string
        if (typeof v === 'number')
            str = `[${v}]`
        else {
            str = v
            if (i !== 0)
                str = '.' + str
        }
        return str
    }).join('')
    prefix = prefix || 'requires'
    throw new Validator.ErrorInvalid(`${fullScope}: ${prefix} ${desc}`)
}

function performRule<T>(value: T, rule: Validator.Rule<T>, transformer?: Validator.TransformFunc<T>): T {
    const desc = rule[0]
    const vfunc = rule[1]
    const sfunc = rule[2]

    if (sfunc && sfunc.before)
        value = sfunc.before(value)

    if (!vfunc(value))
        raiseError(desc)

    if (transformer)
        value = transformer(value)

    if (sfunc && sfunc.after)
        value = sfunc.after(value)

    return value
}


function performPropRule<T>(prop: T, propRule: Validator.PropertyRule<T>) {
    if (propRule instanceof Validator)
        return propRule.run(prop)
    else if (propRule instanceof Function)
        return propRule(prop)
    else
        return performRule(prop, propRule)
}


interface Transformer<T> {
    process(value: T): T
}

class ObjectTransformer<T extends object> implements Transformer<T>{
    constructor(readonly propRules: Validator.ObjectRuleMap<T>) { }
    process(obj: T): T {
        if (obj instanceof Object) {
            for (let key in obj) {
                if (!this.propRules[key])
                    raiseError(`'${key}'`, 'unknown property')
            }

            const copy = <T>{}
            for (let key in this.propRules) {
                scopeStack.push(key)
                try {
                    copy[key] = performPropRule(obj[key], this.propRules[key])
                } finally {
                    scopeStack.pop()
                }
            }
            return copy
        }
        return obj
    }
}

type IndexedObject<T> = { [i: string]: T }
class IndexedObjectTransformer<T> implements Transformer<IndexedObject<T>>{
    constructor(readonly childRule: Validator.PropertyRule<T>) { }
    process(obj: IndexedObject<T>): IndexedObject<T> {
        if (obj instanceof Object) {
            const copy = <IndexedObject<T>>{}
            for (let key in obj) {
                scopeStack.push(key)
                try {
                    copy[key] = performPropRule(obj[key], this.childRule)
                } finally {
                    scopeStack.pop()
                }
            }
            return copy
        }
        return obj
    }
}

class ArrayTransformer<T> implements Transformer<T[]>{
    constructor(readonly childRule: Validator.PropertyRule<T>) { }
    process(array: T[]): T[] {
        if (array instanceof Array) {
            const copy: T[] = []
            array.forEach((e, i) => {
                scopeStack.push(i)
                try {
                    copy[i] = performPropRule(e, this.childRule)
                } finally {
                    scopeStack.pop()
                }
            })
            return copy
        }
        return array
    }
}

export class Validator<T>  {
    static regular<T>(rule: Validator.Rule<T>) {
        return new Validator(rule, null, [])
    }
    static object<T extends object>(propRules: Validator.ObjectRuleMap<T>) {
        return new Validator<T>(['object', v => v instanceof Object], new ObjectTransformer<T>(propRules), [])
    }

    private constructor(
        readonly rule: Validator.Rule<T>,
        private readonly transformer: Transformer<T> | null,
        private readonly extraRules: ReadonlyArray<Validator.Rule<T>>) {
    }

    forArray() {
        return new Validator<T[]>(['array', v => v instanceof Array], new ArrayTransformer<T>(this), [])
    }

    forIndexedObject() {
        return new Validator<IndexedObject<T>>(['object', v => v instanceof Object], new IndexedObjectTransformer<T>(this), [])
    }

    alter(rule: Validator.Rule<T>) {
        return new Validator<T>(rule, this.transformer, this.extraRules)
    }

    nilable() {
        return new Validator<T | undefined | null>([
            this.rule[0],
            v => {
                if (v === null || v === undefined) return true
                return this.rule[1](v)
            },
            this.rule[2]
        ], this.transformer, this.extraRules)
    }

    extra(rule: Validator.Rule<T>) {
        return new Validator<T>(this.rule, this.transformer, this.extraRules.concat(rule))
    }

    run(value: T, scope?: string): T {
        if (scope)
            scopeStack.push(scope)

        try {
            value = performRule(value, this.rule, v => {
                if (this.transformer)
                    return this.transformer.process(v)
                return v
            })
            this.extraRules.forEach(r => {
                value = performRule(value, r)
            })
            return value
        } finally {
            if (scope)
                scopeStack.pop()
        }
    }
}


export namespace Validator {
    export class ErrorInvalid extends Error {
        constructor(message?: string) {
            super(message)
            this.name = 'ErrorInvalid'
        }
    }

    export type ValidateFunc<T> = (value: T) => boolean
    export type TransformFunc<T> = (value: T) => T

    export type Sanitizer<T> = {
        readonly before?: TransformFunc<T>
        readonly after?: TransformFunc<T>
    }

    export type Rule<T> = {
        readonly 0: string
        readonly 1: ValidateFunc<T>
        readonly 2?: Sanitizer<T>
    }


    export type PropertyRule<T> = Rule<T> | Validator<T> | TransformFunc<T>

    export type ObjectRuleMap<T extends object> = {
        readonly [P in keyof Record<keyof T, never>]: PropertyRule<T[P]>
    }
}
