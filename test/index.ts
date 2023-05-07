import { test } from "node:test";
import { deepStrictEqual, strictEqual, throws } from "node:assert";

import * as lib from "../src/index.js";

class ParserTester<I, O> {
	#parser: lib.Parser<I, O>;
	#message: string;

	constructor(parser: lib.Parser<I, O>, message: string) {
		this.#parser = parser;
		this.#message = message;
	}

	invalid(input: any, message?: string) {
		throws(() => this.#parser(input, ["test"]), {
			message: message ?? this.#message,
		});
	}

	valid(input: I, output?: O) {
		if (arguments.length === 1) {
			output = input as any;
		}
		deepStrictEqual(this.#parser(input, ["test"]), output);
	}
}

const TEST_NUM: lib.Parser<number, string> = (input, path) => {
	if (typeof input !== "number") {
		throw new lib.ParserError(path, "test");
	}
	return `test${input}`;
};

await test(lib.formatPath.name, () => {
	strictEqual(lib.formatPath([]), `""`);
	strictEqual(lib.formatPath(["foo"]), `"foo"`);
	strictEqual(lib.formatPath(["foo", "bar", 42, Symbol('test')]), `"foo.bar[42][Symbol(test)]"`);
});

await test(lib.validate.name, () => {
	strictEqual(lib.validate(42, lib.number()), true);
	strictEqual(lib.validate(NaN, lib.number()), false);
});

await test(lib.pass.name, () => {
	const tester = new ParserTester(lib.pass(), "");
	tester.valid(undefined);
	tester.valid("test");
	tester.valid(42);
});

await test(lib.map.name, () => {
	const obj = {};
	const map = new Map([
		["foo", 42],
		[obj, 7],
		["none", undefined],
	]);

	const tester = new ParserTester(lib.map(map), "\"test\" is an unknown value");
	tester.invalid("baz");
	tester.valid("foo", 42);
	tester.valid(obj, 7);
	tester.valid("none", undefined);
});

await test(lib.pipe.name, () => {
	const add = (input: number) => input + 1;
	strictEqual(lib.pipe()("any", []), "any");
	strictEqual(lib.pipe(add)(1, []), 2);
	strictEqual(lib.pipe(add, add, add)(1, []), 4);
});

await test(lib.optional.name, () => {
	const tester = new ParserTester(lib.optional(lib.string()), "\"test\" must be a string");
	tester.invalid(0);
	tester.invalid(null);
	tester.invalid(false);
	tester.valid(undefined);
	tester.valid("foobar");
});

await test(lib.string.name, () => {
	const tester = new ParserTester(lib.string(), "\"test\" must be a string");
	tester.invalid(42);
	tester.invalid(null);
	tester.invalid(undefined);
	tester.valid("");
	tester.valid("test");
});

await test(lib.testRegexp.name, () => {
	const tester = new ParserTester(lib.testRegexp(/^[a-z]+$/), "\"test\" must be a string matching /^[a-z]+$/");
	tester.invalid("42");
	tester.invalid("test42");
	tester.valid("test");
});

await test(lib.number.name, () => {
	const all = new ParserTester(lib.number(), "\"test\" must be a number");
	all.invalid("test");
	all.invalid(NaN);
	all.invalid(42n);
	all.valid(Infinity);
	all.valid(-Infinity);
	all.valid(42.7);

	const min = new ParserTester(lib.number(3.5), "\"test\" must be a number greater than or equal to 3.5");
	min.invalid(3);
	min.valid(3.5);

	const max = new ParserTester(lib.number(undefined, 3.5), "\"test\" must be a number less than or equal to 3.5");
	max.invalid(4);
	max.valid(3.5);

	const minMax = new ParserTester(lib.number(3, 5), "\"test\" must be a number from 3 to 5");
	minMax.invalid(2.5);
	minMax.invalid(5.5);
	minMax.valid(3);
	minMax.valid(5);
});

await test(lib.integer.name, () => {
	const all = new ParserTester(lib.integer(), "\"test\" must be an integer");
	all.invalid("test");
	all.invalid(NaN);
	all.invalid(Infinity);
	all.invalid(-Infinity);
	all.invalid(42.7);
	all.invalid(42n);
	all.valid(42);

	const min = new ParserTester(lib.integer(3), "\"test\" must be an integer greater than or equal to 3");
	min.invalid(2);
	min.valid(3);

	const max = new ParserTester(lib.integer(undefined, 3), "\"test\" must be an integer less than or equal to 3");
	max.invalid(4);
	max.valid(3);

	const minMax = new ParserTester(lib.integer(3, 5), "\"test\" must be an integer from 3 to 5");
	minMax.invalid(2);
	minMax.invalid(6);
	minMax.valid(3);
	minMax.valid(5);
});

await test(lib.boolean.name, () => {
	const tester = new ParserTester(lib.boolean(), "\"test\" must be a boolean");
	tester.invalid(42);
	tester.invalid(null);
	tester.invalid(undefined);
	tester.valid(true);
	tester.valid(false);
});

await test(lib.arrayOf.name, () => {
	const tester = new ParserTester(lib.arrayOf(lib.string()), "\"test\" must be an array");
	tester.invalid(42);
	tester.invalid(null);
	tester.invalid([42 as any], "\"test[0]\" must be a string");

	tester.valid([]);
	tester.valid(["foo"]);
});

await test(lib.equals.name, () => {
	const tester = new ParserTester(lib.equals("test"), "\"test\" is invalid");
	tester.invalid("other");
	tester.valid("test");

	const fixedMessage = new ParserTester(lib.equals("test", "custom"), "custom");
	fixedMessage.invalid("other");

	const dynamicMessage = new ParserTester(lib.equals("test", (input, path) => `dynamic ${input} ${lib.formatPath(path)}`), "");
	dynamicMessage.invalid("foo", "dynamic foo \"test\"");
	dynamicMessage.invalid("bar", "dynamic bar \"test\"");
});

await test(lib.object.name, () => {
	const tester = new ParserTester(lib.object({
		foo: TEST_NUM,
		bar: lib.number(),
	}), "\"test\" must be an object");

	tester.invalid(42);
	tester.invalid(null);

	tester.invalid({
		foo: 42,
		bar: "invalid",
	}, "\"test.bar\" must be a number");

	tester.invalid({
		foo: 42,
	}, "\"test.bar\" must be a number");

	tester.invalid({
		foo: 1,
		bar: 2,
		baz: 3,
	}, "\"test.baz\" is not supported");

	tester.valid({
		foo: 1,
		bar: 2,
	}, {
		foo: "test1",
		bar: 2,
	});

	const additional = new ParserTester(lib.object({
		foo: TEST_NUM,
	}, true), "\"test\" must be an object");
	additional.valid({
		foo: 1,
	}, {
		foo: "test1",
	});
	additional.valid({
		foo: 1,
		bar: 42,
	} as any, {
		foo: "test1",
	});
});

await test(lib.url.name, () => {
	const tester = new ParserTester(lib.url(), "\"test\" must be a valid URL");
	tester.invalid(42);
	tester.invalid(null);
	tester.invalid("");
	tester.invalid({});

	tester.valid("https://example.com", new URL("https://example.com"));
});

await test(lib.isoDuration.name, () => {
	const tester = new ParserTester(lib.isoDuration(), "\"test\" must be a valid ISO 8601 duration");
	tester.invalid(null);
	tester.invalid("P");
	tester.invalid("PT");
	tester.invalid("-P");
	tester.invalid("-PT");
	tester.invalid("P2.4Y3M");
	tester.invalid("P3Y6M2W4DT12H30.4M5S");
	tester.invalid("P3Y6M2W4DT12.4H3M");
	tester.invalid("P3Y6M2W4.4DT12H");
	tester.invalid("P3Y6M2.2W4D");
	tester.invalid("P3Y6.2M2W");
	tester.invalid("P3.2Y6M");

	for (const negative of [false, true]) {
		const sign = negative ? "-" : "";
		const factor = negative ? -1 : 1;

		tester.valid(sign + "P3.1Y", 97761600000 * factor);
		tester.valid(sign + "P3Y", 94608000000 * factor);
		tester.valid(sign + "P6.1M", 15811200000 * factor);
		tester.valid(sign + "P6M", 15552000000 * factor);
		tester.valid(sign + "P2.1W", 1270080000 * factor);
		tester.valid(sign + "P2W", 1209600000 * factor);
		tester.valid(sign + "P4.2D", 362880000 * factor);
		tester.valid(sign + "P4D", 345600000 * factor);
		tester.valid(sign + "PT12.1H", 43560000 * factor);
		tester.valid(sign + "PT12H", 43200000 * factor);
		tester.valid(sign + "PT30.1M", 1806000 * factor);
		tester.valid(sign + "PT30M", 1800000 * factor);
		tester.valid(sign + "PT5.1S", 5100 * factor);
		tester.valid(sign + "PT5S", 5000 * factor);

		tester.valid(sign + "P3Y6M2W4DT12H30M5.2S", 111760205200 * factor);
		tester.valid(sign + "P3Y6M2W4DT12H30M5S", 111760205000 * factor);
		tester.valid(sign + "P3Y6M2W4DT12H30.4M", 111760224000 * factor);
		tester.valid(sign + "P3Y6M2W4DT12H30M", 111760200000 * factor);
		tester.valid(sign + "P3Y6M2W4DT12.4H", 111759840000 * factor);
		tester.valid(sign + "P3Y6M2W4DT12H", 111758400000 * factor);
		tester.valid(sign + "P3Y6M2W4.4DT", 111749760000 * factor);
		tester.valid(sign + "P3Y6M2W4DT", 111715200000 * factor);
		tester.valid(sign + "P3Y6M2W4.4D", 111749760000 * factor);
		tester.valid(sign + "P3Y6M2W4D", 111715200000 * factor);
		tester.valid(sign + "P3Y6M2.2W", 111490560000 * factor);
		tester.valid(sign + "P3Y6M2W", 111369600000 * factor);
		tester.valid(sign + "P3Y6.2M", 110678400000 * factor);
		tester.valid(sign + "P3Y6M", 110160000000 * factor);
		tester.valid(sign + "P3.2Y", 100915200000 * factor);
		tester.valid(sign + "P3Y", 94608000000 * factor);
	}
});
