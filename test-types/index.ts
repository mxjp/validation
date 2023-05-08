import * as lib from "../src/index.js";

{
	function toString(input: number) {
		return String(input);
	}

	function toNumber(input: string) {
		return Number(input);
	}

	const parser = lib.pipe(toString, toNumber, toString);
	const explicitlyTyped: lib.Parser<number, string> = parser;
}

{
	interface Input {
		foo?: string;
		bar: number;
		baz: number | undefined;
	}

	interface Output {
		foo: string | undefined;
		bar?: number;
		baz?: number;
	}

	const parser = lib.object({
		foo: lib.optional(lib.string()),
		bar: lib.number(),
		baz: lib.optional(lib.number()),
	});

	const inputType: Input = undefined!;
	const outputType: Output = parser(inputType, []);
	const explicitlyTyped: lib.Parser<Input, Output> = parser;
}
