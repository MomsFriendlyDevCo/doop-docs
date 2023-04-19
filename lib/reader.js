const _ = require('lodash');
const fs = require('fs');
const pluralize = require('pluralize');

const parsers = require('./parsers');
const debug = require('debug')('docs:reader');

function Reader() {
	/**
	* Various JSDoc parameters per line
	* Each key is the JSDOc param e.g. 'param', if no match is found the meta '@DEFAULT' is used instead
	*
	* @type {Object}
	* @property {string} [as] Optional override to how the ID of the block should be referred to
	* @property {boolean} [enabled=true] Whether to accept this parameters input and add it to the current JSDOC block
	* @property {function} [handler] Optional function called as (operand) which returns the line payload, otherwise entire line is used
	* @property {boolean|string} [multiline=false] Whether the parameter can accept multiple line input until the next block (e.g. `@example`), if a string this specifies what property the multiline text should be appended to
	* @property {boolean} [isUnique=false] Only allow one of these items per block, if false all elements are appended as array items
	* @property {boolean} [endpoint='jsdoc'] How to handle the block once its extracted, sets the overall block.endpoint type so downstream can redirect it to the right endpoint
	* @todo Include @operationId handling 
	*/
	this.params = {
		DEFAULT: {enabled: false},
		abstract: {handler: parsers.flag, alias: 'virtual'},
		access: {handler: parsers.enum('package', 'private', 'protected', 'public')},
		alias: {handler: parsers.description},
		async: {handler: parsers.flag},
		augments: {handler: parsers.description, alias: 'extends'},
		author: {handler: parsers.author},
		borrows: {handler: parsers.description},
		callback: { handler: parsers.description },
		category: { handler: parsers.description },
		classdesc: {handler: parsers.description},
		class: {handler: parsers.split('type', 'name'), alias: 'constructor'},
		constant: {handler: parsers.split('type', 'name'), alias: 'const'},
		constucts: {handler: parsers.name},
		copyright: {handler: parsers.description},
		default: {handler: parsers.value, alias: 'defaultvalue'},
		depreciated: {handler: parsers.description},
		description: {multiline: 'description', alias: 'desc'},
		enum: {handler: parsers.type},
		event: {handler: parsers.pointer},
		example: {multiline: 'content', handler: parsers.description},
		exports: {handler: parsers.name},
		external: {handler: parsers.name, alias: 'host'},
		file: {handler: parsers.description, alias: ['fileoverview', 'overview']},
		fires: {handler: parsers.pointer, alias: 'emits'},
		function: {handler: parsers.flag},
		generator: {handler: parsers.flag},
		global: {handler: parsers.flag},
		hideconstructor: {handler: parsers.flag},
		ignore: {handler: parsers.flag},
		implements: {handler: parsers.name},
		inheritdoc: {handler: parsers.flag},
		inner: {handler: parsers.flag},
		instance: {handler: parsers.flag},
		interface: {handler: parsers.flag},
		kind: {handler: parsers.name},
		lends: {handler: parsers.name},
		license: {handler: parsers.name},
		listens: {handler: parsers.name},
		member: {handler: parsers.typeName},
		memberof: {handler: parsers.name},
		mixes: {handler: parsers.name},
		mixin: {handler: parsers.name},
		module: {handler: parsers.typeName},
		name: {isUnique: true, handler: parsers.name},
		namespace: {handler: parsers.name},
		override: {handler: parsers.flag},
		package: {handler: parsers.flag},
		param: {as: 'params', handler: parsers.typeNameDescription, alias: ['arg', 'argument']},
		private: {handler: parsers.flag},
		property: {handler: parsers.typeNameDescription, alias: 'prop'},
		protected: {handler: parsers.flag},
		public: {handler: parsers.flag},
		readonly: { handler: parsers.flag },

		requires: { handler: parsers.words, alias: 'require' },

		returns: {isUnique: true, handler: parsers.typeDescription, alias: 'return'},
		route: {endpoint: 'oapi', isUnique: true, handler: parsers.rest},
		see: {handler: parsers.description},
		since: {handler: parsers.name},
		static: {handler: parsers.flag},
		summary: {handler: parsers.description},
		this: {handler: parsers.name},
		throws: {handler: parsers.name},
		todo: {handler: parsers.description},
		tutorial: {handler: parsers.description},
		typedef: {isUnique: true, handler: parsers.typeName},
		type: {isUnique: true, handler: parsers.type},
		variation: {isUnique: true, handler: parsers.name},
		version: {isUnique: true, handler: parsers.name},
		yields: {isUnique: true, handler: parsers.typeDescription},
	};

	// Expand params to include pointers for all aliases
	Object.values(this.params)
		.filter(param => param.alias)
		.forEach(param => _.castArray(param.alias).forEach(alias =>
			this.params[alias] = param
		));
}


/**
* Parse string type into javascript type
*
* @param {string} type Desired output type
* @param {string} value String to be converted
* @returns {Mixed} The resulting Javascript instance
*/
Reader.prototype.castType = function (type, value) {
	switch (type) {
		case 'string':
			// TODO: Anything to do for "format"?

			// Remove speachmarks
			let match
			if (match = /^(?<speachmark>['"`])(?<val>[^\s]+)\k<speachmark>$/.exec(value)?.groups)
				return String(match.val);

			return String(value);
		case 'integer':
		case 'number':
			return Number(value);
		case 'boolean':
			return Boolean(value);
		//case 'null':
		//	return null;
		//case 'undefined':
		case 'array':
		case 'object':
		default:
			return undefined;
	}
}


/**
* Parse file paths extracting all JSDoc + OAPI specs
*
* @param {string|array<string>} paths Path(s) to process
* @param {object} [options] Additional options to use when parsing
* @see parseJSDoc() For futher option parsing
* @returns {Promise<object>} A promise which will resolve with the eventual response object
*/
Reader.prototype.parseFiles = function parseFiles(paths, options) {
	return Promise.all(
		_.castArray(paths)
			.map(path => fs.promises.readFile(path, 'utf-8')
				.then(contents => {
					debug('Processing: ', path);
					return this.parseString(contents, options);
				}))
	)
	.then(contents => contents.reduce((acc, cur) => _.merge(acc, cur), {}))	
};


/**
* Attempt to parse an input string returning all extracted JSDoc + OAPI translations
*
* @param {string} input Input string to parse
* @param {object} [options] Additional options to use when parsing
* @returns {JSDOCAPIResponse} Response object
* @see parseJSDoc() For futher option parsing
*/
Reader.prototype.parseString = function parseString(input, options) {
	var blocks = this.parseJSDoc(input, options);
	// console.log("blocks", blocks) // TODO: blocks.returns has useful information

	const builtins = [
		'integer',
		'number',
		'string',
		'boolean',
		'array',
		'object',
	];

	const schemas = _(blocks)
		.filter(b => b.schema)
		// TODO: Support looking up collection for schema via original name before @name?
		.mapKeys(b => b.name)
		.mapValues(b => {
			return {
				...(b.name ? {title: b.name} : {}),
				...(b.type ? {type: b.type} : {}),
				...(b.description ? {description: b.description} : {}),
				//enum: [],
				...(b.property ? {required: b.property
					.filter(p => p.isRequired)
					.map(p => p.name)
				} : {}),
				...(b.property ? {properties: _(b.property)
					.mapKeys(p => p.name)
					.mapValues(p => {
						var t = {};
						switch (p.type) {
							case 'Date':
								t.type = 'string';
								t.format = 'date';
								break;
							case 'DateTime':
								t.type = 'string';
								t.format = 'date-time';
								break;
							case 'ObjectID':
								t.type = 'string';
								t.format = 'uuid'; // TODO: objectid? 
								break;
							default:
								t.type = p.type.toLowerCase();
								break;
						}

						return {
							title: p.name,
							description: p.description,
							//default: p.default,
							...t,
						};
					})
					.value()
				} : {}),

			};
		})
		.value();

	return {
		jsdoc: blocks
			.filter(b => b.function),

		oapi: {
			components: {
				schemas: schemas,
				//responses: null,
				//parameters: null,
				//examples: null,
				//requestBodies: null,
				//headers: null,
				//securitySchemes: null,
				//links: null,
				//callbacks: null,
			},

			paths: _(blocks)
				.filter(b => b.route)
				.groupBy(b => b.route.path)
				.mapValues(path => _(path)
					.mapKeys(b => b.route.method)
					.mapValues(b => {

						let response;
						if (b.returns) {
							// TODO: Support JSDoc style of `Array.<MyClass>` or `MyClass[]`

							response = {
								description: b.returns.description,
								content: {}
							};

							b.returns.type.split('|').forEach(type => {
								if (!type) return;
								let match;

								// Object is special case, check for existing model {{{
								// FIXME: Only on `/api/collection/:id` routes?
								if (type === 'Object') {
									// TODO: Could determine if a @name is set for the collection and alias that instead
									match = /^\/api\/(?<collection>.+?)\//.exec(b.route.path)?.groups;
									if (match && match.collection) type = match.collection;
								}
								// }}}

								match = /^(?<wrapper>.*)\<(?<type>.+?)\>$/.exec(type)?.groups;
								if (!match) match = { type: type };

								match.wrapper = match?.wrapper?.toLowerCase();

								if (builtins.includes(match?.type?.toLowerCase()))
									match.type = match.type.toLowerCase();

								// Preconfigured type and schema {{{
								if (_.has(options.responseTypes, match.type)) {
									switch (match?.wrapper) {
										case 'array':
											response.content[options.responseTypes[match.type].type] = {
												schema: {
													title: pluralize.plural(match.type),
													type: match.wrapper,
													items: {
														schema: options.responseTypes[match.type].schema
													}
												}
											};
											break;
										default:
											response.content[options.responseTypes[match.type].type] = {
												schema: options.responseTypes[type].schema
											};
											break;
									}
								// }}}
								
								// Custom schema response {{{
								} else {
									switch (match?.wrapper) {
										// Generate inline schema with properties
										case 'object':
											response.content['application/json'] = {
												schema: {
													//title: pluralize.plural(match.type),
													type: match.wrapper,
													// TODO: Support other formats of object property specification
													properties: _(match.type.split(','))
														.mapKeys(p => p.split(':')[0].trim())
														.mapValues(p => {
															const t = p.split(':')[1].trim();
															if (builtins.includes(t)) {
																return { type: t };
															} else {
																return { $ref: '#/components/schemas/' + t }
															}
														})
														.value()
												}
											};
											break;

										// Simply link to a predefined schema
										case 'array':
											response.content['application/json'] = {
												schema: {
													title: pluralize.plural(match.type),
													type: match?.wrapper,
													items: {}
												}
											};
											if (builtins.includes(match.type)) {
												response.content['application/json'].schema.items = {
													type: match.type
												};
											} else {
												response.content['application/json'].schema.items = {
													$ref: '#/components/schemas/' + match.type
												};
											}
											break;
										default:
											response.content['application/json'] = {
												schema: {}
											};
											if (builtins.includes(match.type)) {
												response.content['application/json'].schema = {
													type: match.type
												};
											} else {
												response.content['application/json'].schema = {
													// $ref: '#/components/schemas/' + match.type // XXX: removed in favour of @property
												};
											}
											break;
									}
								}
								// }}}
							});
						}

						const headParams = _(b.params)
							.filter(p => _.isPlainObject(p) && Object.prototype.hasOwnProperty.call(p, 'name') && (
								p.name.startsWith('req.params.') || 
								p.name.startsWith('req.query.') || 
								p.name.startsWith('req.headers.')
							))
							.value();

						const bodyParams = _(b.params)
							.filter(p => _.isPlainObject(p) && Object.prototype.hasOwnProperty.call(p, 'name') && (
								p.name.startsWith('req.body.')
							))
							.value();

						// Add tags if `@category` is provided
						if (b.category) {
							b.tags = b.tags ?? [];
							b.tags.push(b.category[0].description);

							console.log(`Adding tag '${b.category[0].description}' to '${b.route.path}' with total tags:`, b.tags)
						}

						if (b.route.path.includes('test')) {
							console.log('test', b, b.requires)
						}

						/// Inject `b.security` from `@requires` (or `@require`) JSDoc tags {{{
						if (b.security) {
							console.log("!! b.security detected! path", b.route.path, "security:", b.security)
						}
						if (b.requires) {
							b.security = b.security ?? [];
							b.requires.forEach((block) => {
								const topLevel = block[0];
								const subScopes = block.slice(1);
								b.security.push({
									[topLevel]: subScopes
								})
								console.log(`Adding security for \`@require\` usage named '${topLevel}' with scopes:`, subScopes)
							})

						}
						// }}}

						const pathSpec = {
							...(b.name ? {operationId: b.name} : {}),
							...(b.description ? {description: b.description} : {}),
							...(b.summary ? {summary: b.summary} : {}),
							...(b.security ? {security: b.security} : []),
							...(b.tags ? {tags: b.tags} : []),
							...((b.returns && response) ? {responses: {
								'200': response
								// TODO: Error responses
							}} : {}),
							...(headParams.length > 0 ? {
								parameters: _(headParams)
									.map(p => {
										// Accept node spec and return OAPI schema
										// e.g. '*', 'string', 'array<number>', 'array<object>', 'string|number'
										var schemaRender = node => {
											if (/\|/.test(node.type)) {
												return {oneOf: // Multiple types
													p.type.split(/\s*\|\s*/).map(schemaRender)
												};
											} else if (/^(<(?<wrapper>)>)(?<childType>.+)$/.exec(node)?.groups) { // e.g. `array<string>`
												throw new Error(`Only direct syntax types are supported now. Dont use "array<number>" style inputs for @route. Detected at "${node}`);
											} else if (node.type) {
												return {type: node.type};
											} else if (_.isString(node)) {
												return {type: node};
											} else {
												throw new Error(`Unable to parse schema for "${node}"`);
											}
										};
		
										var schema =
											p.type == '*' ? {} // Accept everything anyway
											: /\|/.test(p.type) ? {schema: {oneOf: // Multiple types
												p.type.split(/\s*\|\s*/).map(schemaRender)
											}}
											: {schema: schemaRender(p.type)}; // Single type
		
		
										// Extracting default from key="value" style names
										let match;
										if (match = /^(?<key>[\w\.]+)=(?<val>[^\s]+)$/.exec(p.name)?.groups) {
											p.name = match.key;
											schema.schema.default = this.castType(schema.schema.type, match.val);

											// Include default in description
											//p.description += ` (default: ${schema.schema.default})`;
										}
		
										if (p.name.startsWith('req.params.')) {
											return {
												name: p.name.replace(/^req\.params\./, ''),
												in: 'path',
												description: p.description,
												required: p.isRequired,
												...schema,
											};
										} else if (p.name.startsWith('req.query.')) {
											return {
												name: p.name.replace(/^req\.query\./, ''),
												in: 'query',
												description: p.description,
												required: p.isRequired,
												...schema,
											};
										} else if (p.name.startsWith('req.headers.')) {
											return {
												name: p.name.replace(/^req\.headers\./, ''),
												in: 'header',
												description: p.description,
												required: p.isRequired,
												...schema,
											};
										} else {
											console.log('[WARN]', 'Unrecognised param', p.name)
											return null;
										}
									})
									.value()
								} : {}),
								...(bodyParams.length > 0 ? {
									requestBody: {
										description: 'Form Data',
										required: true,
										content: {
											'multipart/form-data': {
												schema: {
													type: 'object',
													properties: _(bodyParams)
														.mapValues(p => {
															if (builtins.includes(p.type.toLowerCase()))
																p.type = p.type.toLowerCase();

															// Extracting default from key="value" style names
															let match;
															if (match = /^(?<key>[\w\.]+)=(?<val>[^\s]+)$/.exec(p.name)?.groups) {
																p.name = match.key;
																p.default = this.castType(p.type, match.val);
															}

															return p;
														})
														.mapKeys(p => p.name.replace(/^req.body\./, ''))
														.mapValues(p => ({
															type: p.type,
															default: p.default,
															description: p.description,
														}))
														.value(),
													required: _(bodyParams)
														.filter(p => p.isRequired)
														.map(p => p.name)
														.value(),
												}
											}
										}
									}
								} : {}
							),
						};

						// Inject pathSpec.responses.200.schema with @property components
						// if (b.route.path.includes('test') && pathSpec.responses) {
						if (pathSpec.responses && b.property) {
							/**
							 * @type {Array<{name: string, type: string, description: string, isRequired: bool}>}
							 */
							const providedProperties = b.property

							/**
							 * @type {Object}>
							 * 
							 * { [name]: {type: String | "integer" | "string", description: String} }
							 */
							const OAPIProperties = {};

							providedProperties.forEach(property => {
								OAPIProperties[property.name] = {
									type: property.type,
									description: property.description
								}
							});

							const _propertyNames = Object.keys(OAPIProperties);
							console.log(`Adding @propertys to ${b.route.path}:`, _propertyNames)
							// console.log("pathSpec.responses before", pathSpec.responses, ".content", pathSpec.responses['200'].content)

							// console.log("providedProperties:", providedProperties, "OAPIProperties:", OAPIProperties)

							pathSpec.responses['200'].content['application/json'].schema.properties = OAPIProperties;

							// console.log("testing path @property injection", b.property, responses)
						}

						return pathSpec;
					})
					.value()
				).value()
				//})
			//}
		},
	};
};


/**
* Attempt to parse an input string returning all extracted JSDoc blocks
*
* @param {string} input Input string to parse
* @param {object} [options] Additional options to use when parsing
* @param {string} [options.initialBlock='description'] Start parsing within this block (must a multiline param)
* @param {number} [options.lineOffset=1] Initial line offset (must be at least 1 to counnter zero based line numbering)
* @returns {array<Object>} Collection of all extracted JSDoc blocks
*/
Reader.prototype.parseJSDoc = function parseJSDoc(input, options) {
	var settings = {
		initialBlock: 'description',
		lineOffset: 1,
		context: (block, lines) => { // Determine context from next code lines - return truthy when found or false if nothing
			return lines
				.find(line => {
					var match;
					line = _.trimStart(line);
					if (!line || /\s*\/\//.test(line)) return false; // if blank || comment skip

					// TODO: Support app.use('routes', app.middleware.rest...
					// TODO: Support arrays of routes (Work-around these with @route?)

					// Routes
					if (match = /^app\.(?<method>delete|get|head|options|patch|post|put|trace)\((?<speachmark>['"`])(?<path>.+?)\k<speachmark>\s*,/.exec(line)?.groups) { // Looks like a doop endpoint (e.g. `app.get('/api', (req, res) => ...)`)
						if (!block.route) {
							block.route = {
								method: match.method,
								path: match.path,
							};
						}
						return true;

					// Mongoose Schema
					} else if (match = /^app\.middleware\.db\.schema\((?<speachmark>['"`])(?<collection>.+?)\k<speachmark>\s*,/.exec(line)?.groups) { // Looks like a doop schema (e.g. `app.middleware.db.schema('collection', {})`)
						if (!block.name) block.name = match.collection;
						block.schema = true;
						return true;

					// Mongoose methods
					} else if (match = /\.method\((?<speachmark>['"`])(?<function>\w+?)\k<speachmark>/.exec(line)?.groups) {
						if (!block.name) block.name = match.function;
						block.function = true;
						return true;

					// TODO: Mongoose virtuals
					// TODO: Mongoose hooks

					// Global Doop app.FUNC
					} else if (match = /^(?<function>app\..+?)\s*=/.exec(line)?.groups) { 
						if (!block.name) block.name = match.function;
						block.function = true;
						block.global = true;
						return true;

					// FIXME: "anything ="?
					} else if (match = /^(?<function>.+?)\s*=/.exec(line)?.groups) {
						if (!block.name) block.name = match.function;
						block.function = true;
						return true;

					}
				});
		},
		contextLimit: 3, // Max number of lines to look ahead to auto-determine context before erroring out
		postProcess: block => {
			// Clean up descriptions
			block.description = _.trim(block.description);

			// Extract missing req.params if they are omitted
			if (settings.warnRouteMissingArgs && block.route) {
				var definedParams = new Set((block.params ?? []).map(p => p.name));

				[...block.route.path.matchAll(/(?::(?<param>\w+))/g)]
					.map(m => `req.params.${m.groups.param}`)
					.filter(param => !definedParams.has(param))
					.forEach(param => settings.warn('warnRouteMissingArgs', `Param "${param}" missing from definition of route '${block.route.method} ${block.route.path}'`))
			}
		},
		warn: (type, ...msg) => {
			console.log('[WARN]', ...msg);
		},
		warnNoAutoContext: true, // Warn when the context of a function cannot be determined
		warnRouteMissingArgs: true, // Warn when a route has missing req.params (extacted from urls like `/api/widgets/:id`
		...options,
	};

	var out = [];

	/// Boolean flag
	var inBlock = false;
	var inMultiline = false; // or the string pointer to the parameter in block to append to
	var block; // {desc, ...jsdocHeaders}

	input.split(/\s*\n\s*/)
		.forEach((line, lineOffset, lines) => {
			if (/^\s*\/\*\*/.test(line)) { // Start of block
				if (inBlock) {
					debug('Opening line: ', lineOffset+settings.lineOffset);
					settings.warn(`warnStartWithinStart`, `Start of block when already in block at line ${lineOffset+settings.lineOffset}`);
					return;
				}
				block = {};
				if (settings.initialBlock && this.params[settings.initialBlock]?.isMultiline) throw new Error('parseJSDoc({initialBlock}) must be a multiline param');
				if (settings.initialBlock) inMultiline = settings.initialBlock;
				inBlock = true;
			} else if (/^\s*\*\//.test(line)) { // End of comment block area
				if (!inBlock) {
					debug('Closing line: ', lineOffset+settings.lineOffset);
					settings.warn(`warnClosingWithoutOpening`, `Attempt to close non-existant block at line ${lineOffset+settings.lineOffset}`);
					return;
				}

				if (
					!settings.context(block, lines.slice(lineOffset + 1, lineOffset + 1 + settings.contextLimit))
					&& !block.route // No manual route definition (OAPI)
					&& !block.name // No manual function name either (JSDOC)
					// TODO: Call with block as the context? settings.context.call(block, lines)
					&& settings.warnNoAutoContext // And we should warn
					) settings.warn(`warnNoAutoContext`, `Cannot determine context of block at line ${lineOffset+settings.lineOffset} - define @name or @route tags`)

				settings.postProcess(block);
				out.push(block);
				block = {};
				inBlock = false;
				inMultiline = false;
			} else if (inBlock) {
				//debug('Line: ' + line);
				var lineParsed = /^\s*\*\s*@(?<param>\w+) (?<operand>.*)$/.exec(line)?.groups;
				if (!lineParsed && inMultiline) { // Invalid parse + is in multiline - append to multiline data
					block[inMultiline] = (block[inMultiline] ? block[inMultiline] + '\n' : '') + line.replace(/^\s*\*\s*/, '');
				} else if (!lineParsed) { // Non-parsable - ignore
					// Pass - Nothing to extract, probably a blank line
				} else { // Single line JSDoc parameter - extract JSDoc line into block
					// Decide what parameter block to handle
					var paramSettings = this.params[lineParsed.param] || this.params.DEFAULT;
					var paramId = paramSettings.as || lineParsed.param;
					if (!(paramSettings.enabled ?? true)) {
						// console.log(`Skipping disabled param "${lineParsed.param}" at line ${lineOffset + settings.lineOffset}`);
						return;
					} // Don't handle this param

					if (!paramSettings.handler) {

						// console.log(`No handler found for param "${lineParsed.param}" with linParsed:`, lineParsed, "paramSettings:", paramSettings);
					}
					var value = paramSettings.handler // Has a handler - glue output to existing block
						? paramSettings.handler(lineParsed.operand)
						: lineParsed.operand;

					if (paramSettings.isUnique && block[paramId]) { // Check if its supposed to be unique and we already have one
						throw new Error(`Block parameter already exists "${lineParsed.param}" at line ${lineOffset+settings.lineOffset} - it is supposed to be unique`);
					} else if (paramSettings.isUnique) { // Simple key=val
						block[paramId] = value;
					} else { // Assume arrays for everything else
						if (!block[paramId]) block[paramId] = [];
						block[paramId].push(value);
					}

					if (paramSettings.endpoint && paramSettings.endpoint != 'jsdoc') {
						if (block.endpoint) throw new Error(`Trying to overwrite existing JSDoc endpoint "${block.endpoint}" with "${paramSettings.endpoint}" on line ${lineOffset+settings.lineOffset} - can only use one eventual endpoint`);
						block.endpoint = paramSettings.endpoint;
					}
				}
			}
		});

	return out;
};

module.exports = Reader;
