const _ = require('lodash');

module.exports = {
	// Parse an author line (e.g. '@author Matt Carter <m@ttcarter.com>`) as {name: String, email: String}
	author(line) {
		var match;
		if (match = /^(?<name>.+) <(?<email>)>/.exec(line)?.groups) { // Name + Email
			return match.groups;
		} else { // Assume just name
			return line;
		}
	},


	// Factory param handler to only accept values of an enum
	enum(...values) {
		return function(line) {
			if (!values.contains(line)) throw new Error(`Invalid enum value "${line}" can only accept ${values.join('|')}`);
			return line;
		};
	},


	// Return a simple `true` boolean (e.g. '@function', '@global'
	flag(line) {
		return true;
	},


	// Parse `description` lines as {description: String}
	description(line) {
		return {description: line};
	},


	// Parse `name` lines as {name: String}
	name(line) {
		return {name: line};
	},


	// Parse pointers to functions (@event, @fires) as {class?: String, event: String, eventName?:String}
	pointer(line) {
		var parsed = /((?<class>.+?)#)?(?<event>.+)(:(?<eventname>.+?))?$/.exec(line)?.groups;
		if (!parsed) throw new Error(`Failed to parse "${line}" as pointer`);
		return parsed;
	},


	// Parse `{type}` as {type: String}
	type(line) {
		return {type: line};
	},


	// Parse `{type} description` as {type: String, description: String}
	typeDescription(line) {
		var parsed = /(\{(?<type>.+?)\})?\s*(?<description>.*)$/.exec(line)?.groups;
		if (!parsed) throw new Error(`Failed to parse "${line}" as type?+description`);
		return parsed;
	},

	// Parse `{type} name` as {type: String, name: String}
	typeName(line) {
		var parsed = /(\{(?<type>.+?)\})?\s*(?<name>.*)$/.exec(line)?.groups;
		if (!parsed) throw new Error(`Failed to parse "${line}" as type?+name`);
		return parsed;
	},


	// Parse @param style `{type} [name] description` as {type: String, name: String, description: String}
	typeNameDescription(line) {
		var parsed = /(\{(?<type>.+?)\})?\s*(?<name>.+?)\s+(?<description>.*)$/.exec(line)?.groups;
		if (!parsed) throw new Error(`Failed to parse "${line}" as type+name?+description`);

		parsed.isRequired = ! /^\[.+\]$/.test(parsed.name); // Optional type (e.g. `[req.query.q]`)
		parsed.name = _.trim(parsed.name, '[]'); // Strip enclosing braces

		return parsed;
	},


	// Parse @route style `GET /api/widgets` as {method: String, path: String}
	rest(line) {
		var parsed = /^(?<method>[A-Z]+)?\s*(?<path>.+)$/.exec(line)?.groups;
		if (!parsed) throw new Error(`Failed to parse "${line}" as ReST URL`);
		parsed.method = parsed.method ? parsed.method.toLowerCase() : 'get';
		return parsed;
	},


	// Factory function which simply assigns values into named paramers
	split(...fields) {
		return function(line) {
			return _.chain(line)
				.split(/\s+/)
				.mapKeys((v, i) => fields[i])
				.mapValues()
				.value();
		};
	},


	// Parse `{value}` as {value: String}
	value(line) {
		return {value: line};
	},
};
