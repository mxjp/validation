
/**
 * A function that validates an input value and optionally converts it.
 *
 * @param input The value to validate.
 * @param path The path at which the input value is located.
 * @returns The output value.
 */
export type Parser<I, O = I> = (input: I, path: Path) => O;

/**
 * Helper to get the input type of a parser.
 */
export type ParserInput<T> = T extends Parser<infer I, any> ? I : never;

/**
 * Helper to get the output type of a parser.
 */
export type ParserOutput<T> = T extends Parser<any, infer O> ? O : never;

/**
 * Represents a path to a value in an object.
 */
export type Path = readonly (string | number | symbol)[];

/**
 * Thrown by parsers if a value is invalid.
 */
export class ParserError extends TypeError {
	/**
	 * The path at which the value is located.
	 */
	path: Path;

	constructor(path: Path, message: string) {
		super(message);
		this.path = path;
	}
}

/**
 * Type for an error message or a function that generates the error message.
 */
export type MessageSource<T> = string | ((input: T, path: Path) => string);

/**
 * Used internally to format a path for error messages.
 */
export function formatPath(path: Path) {
	let str = "\"";
	for (let i = 0; i < path.length; i++) {
		const segment = path[i];
		if (typeof segment === "string") {
			if (i === 0) {
				str += segment;
			} else {
				str += `.${segment}`;
			}
		} else if (typeof segment === "number") {
			str += `[${segment}]`;
		} else {
			str += `[${String(segment)}]`;
		}
	}
	return str + "\"";
}

/**
 * Used internally to create an error message from a message source.
 */
function getErrorMessage<T>(messageSource: MessageSource<T> | undefined, input: T, path: Path): string | undefined {
	if (messageSource === undefined) {
		return undefined;
	}
	if (typeof messageSource === "string") {
		return messageSource;
	}
	return messageSource(input, path);
}

/**
 * Validate an input value using a parser.
 *
 * @param input The value to validate.
 * @param parser The parser to use.
 * @returns Whether the input value is valid.
 *
 * @example
 * ```ts
 * if (validate(input, number(0, 42))) {
 *   console.log("input is valid!");
 * }
 * ```
 */
export function validate<I>(input: I, parser: Parser<I, any>): boolean {
	try {
		parser(input, []);
		return true;
	} catch (error) {
		if (error instanceof ParserError) {
			return false;
		}
		throw error;
	}
}

/**
 * Create a parser that passes it's input as is.
 *
 * @example
 * ```ts
 * object({
 *   something: pass(),
 *   message: string(),
 * })
 * ```
 */
export function pass<T>(): Parser<T> {
	return input => input;
}

/**
 * Create a parser that uses a map to lookup output values.
 *
 * @param map The map to use.
 *
 * @example
 * ```ts
 * const errorCodes = new Map<number, Error>([
 *   [404, Error.NotFound],
 *   [418, Error.ImATeapot],
 *   [500, Error.InternalServerError],
 * ]);
 *
 * map(errorCodes)
 * ```
 */
export function map<I, O>(map: Map<I, O>, messageSource?: MessageSource<I>): Parser<I, O> {
	return (input, path) => {
		const output = map.get(input);
		if (output === undefined && !map.has(input)) {
			throw new ParserError(path, getErrorMessage(messageSource, input, path) ?? `${formatPath(path)} is an unknown value`);
		}
		return output as O;
	};
}

/**
 * Create a parser that uses a set to check if an input is valid.
 */
export function set<T>(set: Set<T>, messageSource?: MessageSource<T>): Parser<T> {
	return (input, path) => {
		if (!set.has(input)) {
			throw new ParserError(path, getErrorMessage(messageSource, input, path) ?? `${formatPath(path)} is an unknown value`);
		}
		return input;
	};
}

/**
 * Create a parser that passes a value through multiple parsers.
 *
 * @example
 * ```ts
 * pipe(parseNumber(), integer(0, 42))
 * ```
 */
export function pipe<T0>(): Parser<T0, T0>;
export function pipe<T0, T1>(p0: Parser<T0, T1>): Parser<T0, T1>;
export function pipe<T0, T1, T2>(p0: Parser<T0, T1>, p1: Parser<T1, T2>): Parser<T0, T2>;
export function pipe<T0, T1, T2, T3>(p0: Parser<T0, T1>, p1: Parser<T1, T2>, p2: Parser<T2, T3>): Parser<T0, T3>;
export function pipe<T0, T1, T2, T3, T4>(p0: Parser<T0, T1>, p1: Parser<T1, T2>, p2: Parser<T2, T3>, p3: Parser<T3, T4>): Parser<T0, T4>;
export function pipe(...parsers: Parser<any>[]): Parser<any> {
	return (value, path) => {
		for (let i = 0; i < parsers.length; i++) {
			value = parsers[i](value, path);
		}
		return value;
	};
}

/**
 * Create a parser that accepts undefined.
 *
 * @param inner The parser to use if the input is not undefined.
 * @param getDefault A function that returns the default value if the input is undefined.
 *
 * @example
 * ```ts
 * optional(string()) // All strings and undefined
 * optional(string(), () => "example") // All strings, returns "example" for undefined.
 * ```
 */
export function optional<I, O>(inner: Parser<I, O>): Parser<I | undefined, O | undefined>;
export function optional<I, O>(inner: Parser<I, O>, getDefault: () => O): Parser<I | undefined, O>;
export function optional<I, O>(inner: Parser<I, O>, getDefault?: () => O): Parser<I | undefined, O | undefined> {
	return (input, path) => {
		return input === undefined ? getDefault?.() : inner(input, path);
	};
}

/**
 * Create a parser that accepts all strings.
 *
 * @example
 * ```ts
 * string()
 * ```
 */
export function string(): Parser<string> {
	return (input, path) => {
		if (typeof input !== "string") {
			throw new ParserError(path, `${formatPath(path)} must be a string`);
		}
		return input;
	};
}

/**
 * Create a parser that accepts all strings that match a regular expression.
 */
export function testRegexp(regexp: RegExp, messageSource?: MessageSource<string>): Parser<string> {
	return (input, path) => {
		if (typeof input !== "string" || !regexp.test(input)) {
			throw new ParserError(path, getErrorMessage(messageSource, input, path) ?? `${formatPath(path)} must be a string matching ${regexp}`);
		}
		return input;
	};
}

/**
 * Create a parser that accepts all numbers excluding NaN.
 *
 * @param min If specified, values must be greater or equal to this.
 * @param max If specified, values must be less or equal to this.
 *
 * @example
 * ```ts
 * number() // All numbers excluding NaN
 * number(0) // All non-negative numbers
 * number(undefined, 42) // All numbers less than or equal to 42
 * number(0, 42) // All non-negative numbers less than or equal to 42
 * ```
 */
export function number(min?: number, max?: number): Parser<number> {
	return (input, path) => {
		if (typeof input !== "number" || (min !== undefined && input < min) || (max !== undefined && input > max) || Number.isNaN(input)) {
			if (min === undefined) {
				if (max === undefined) {
					throw new ParserError(path, `${formatPath(path)} must be a number`);
				} else {
					throw new ParserError(path, `${formatPath(path)} must be a number less than or equal to ${max}`);
				}
			} else {
				if (max === undefined) {
					throw new ParserError(path, `${formatPath(path)} must be a number greater than or equal to ${min}`);
				} else {
					throw new ParserError(path, `${formatPath(path)} must be a number from ${min} to ${max}`);
				}
			}
		}
		return input;
	};
}

/**
 * Create a parser that accepts all numbers that are safe integers.
 *
 * @param min If specified, values must be greater or equal to this.
 * @param max If specified, values must be less or equal to this.
 *
 * @example
 * ```ts
 * integer() // All safe integers
 * integer(0) // All non-negative safe integers
 * integer(undefined, 42) // All safe integers less than or equal to 42
 * integer(0, 42) // All non-negative safe integers less than or equal to 42
 * ```
 */
export function integer(min?: number, max?: number): Parser<number> {
	return (input, path) => {
		if (!Number.isSafeInteger(input) || (min !== undefined && input < min) || (max !== undefined && input > max)) {
			if (min === undefined) {
				if (max === undefined) {
					throw new ParserError(path, `${formatPath(path)} must be an integer`);
				} else {
					throw new ParserError(path, `${formatPath(path)} must be an integer less than or equal to ${max}`);
				}
			} else {
				if (max === undefined) {
					throw new ParserError(path, `${formatPath(path)} must be an integer greater than or equal to ${min}`);
				} else {
					throw new ParserError(path, `${formatPath(path)} must be an integer from ${min} to ${max}`);
				}
			}
		}
		return input;
	};
}

/**
 * Create a parser that accepts true or false.
 *
 * @example
 * ```ts
 * boolean() // true or false
 * ```
 */
export function boolean(): Parser<boolean> {
	return (input, path) => {
		if (typeof input !== "boolean") {
			throw new ParserError(path, `${formatPath(path)} must be a boolean`);
		}
		return input;
	}
}

/**
 * Create a parser that accepts arrays.
 *
 * @param inner The parser to use for elements.
 *
 * @example
 * ```ts
 * arrayOf(string())
 * ```
 */
export function arrayOf<I, O = I>(inner: Parser<I, O>): Parser<I[], O[]> {
	return (input, path) => {
		if (!Array.isArray(input)) {
			throw new ParserError(path, `${formatPath(path)} must be an array`);
		}
		return input.map((subInput, i) => inner(subInput, path.concat(i)));
	};
}

/**
 * Create a parser that accepts a specific value.
 */
export function equals<T>(value: T, messageSource?: MessageSource<T>): Parser<T, T> {
	return (input, path) => {
		if (input !== value) {
			throw new ParserError(path, getErrorMessage(messageSource, input, path) ?? `${formatPath(path)} is invalid`);
		}
		return input;
	};
}

/**
 * An object that defines parsers for specific properties.
 */
export type ObjectParser = Record<string, Parser<any>>;

/**
 * Helper to get the input type of an object parser.
 */
export type ObjectParserInput<T> = { [K in keyof T]: ParserInput<T[K]> };

/**
 * Helper to get the output type of an object parser.
 */
export type ObjectParserOutput<T> = { [K in keyof T]: ParserOutput<T[K]> };

/**
 * Create a parser that accepts objects with specific properties.
 *
 * @param parser An object with parsers for each supported property.
 * @param ignoreUnknown If true, unknown properties are ignored. Else an error is thrown if there are unknown properties.
 *
 * @example
 * ```ts
 * object({
 *   foo: string(),
 *   bar: number(0, 42),
 * })
 * ```
 */
export function object<T extends ObjectParser>(parser: T, ignoreUnknown = false): Parser<ObjectParserInput<T>, ObjectParserOutput<T>> {
	return (input, path) => {
		if (input === null || typeof input !== "object") {
			throw new ParserError(path, `${formatPath(path)} must be an object`);
		}
		const output = {} as ObjectParserOutput<T>;
		for (const key in parser) {
			output[key] = parser[key](input[key], path.concat(key));
		}
		if (!ignoreUnknown) {
			for (const key in input) {
				if (!Object.hasOwn(parser, key)) {
					const subPath = path.concat(key);
					throw new ParserError(subPath, `${formatPath(subPath)} is not supported`);
				}
			}
		}
		return output;
	};
}

/**
 * Create a parser that converts strings to URLs.
 *
 * @example
 * ```ts
 * url()
 * ```
 */
export function url(): Parser<string, URL> {
	return (input, path) => {
		if (typeof input !== "string") {
			throw new ParserError(path, `${formatPath(path)} must be a valid URL`);
		}
		try {
			return new URL(input);
		} catch {
			throw new ParserError(path, `${formatPath(path)} must be a valid URL`);
		}
	};
}

const ISO_DURATION_REGEXP = (() => {
	function element(designator: string, name: string) {
		return `(?:(?<${name}>\\d*[,.]\\d+(?=${designator}T?$)|\\d+)${designator})?`;
	}

	return new RegExp([
		`^(?<negative>-)?P`,
		element('Y', 'years'),
		element('M', 'months'),
		element('W', 'weeks'),
		element('D', 'days'),
		`(?:T`,
		element('H', 'hours'),
		element('M', 'minutes'),
		element('S', 'seconds'),
		`)?$`,
	].join(""));
})();

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_MONTH = 30 * MS_PER_DAY;
const MS_PER_YEAR = 365 * MS_PER_DAY;

/**
 * Create a parser that converts ISO 8601 durations to milliseconds.
 *
 * Note, that this parser uses fixed factors for each unit.
 */
export function isoDuration(): Parser<string, number> {
	function parseElem(value: string | undefined): number {
		return value === undefined ? 0 : Number.parseFloat(value.replace(",", "."));
	}
	return (input, path) => {
		if (input === "P" || input === "PT" || input === "-P" || input === "-PT") {
			throw new ParserError(path, `${formatPath(path)} must be a valid ISO 8601 duration`);
		}

		const match = ISO_DURATION_REGEXP.exec(input);
		if (match === null || match.groups === undefined) {
			throw new ParserError(path, `${formatPath(path)} must be a valid ISO 8601 duration`);
		}

		return (
			parseElem(match.groups.years) * MS_PER_YEAR +
			parseElem(match.groups.months) * MS_PER_MONTH +
			parseElem(match.groups.weeks) * MS_PER_WEEK +
			parseElem(match.groups.days) * MS_PER_DAY +
			parseElem(match.groups.hours) * MS_PER_HOUR +
			parseElem(match.groups.minutes) * MS_PER_MINUTE +
			parseElem(match.groups.seconds) * MS_PER_SECOND
		) * (match.groups.negative === "-" ? -1 : 1);
	};
}
