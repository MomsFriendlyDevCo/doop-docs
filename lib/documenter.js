const _ = require('lodash');
const fs = require('fs');
const glob = require('globby');
const fspath = require('path');
const pluralize = require('pluralize');
const widdershins = require('widdershins');
const shins = require('shins');

const Reader = require('./reader');

// Retrieve project's package meta-data
const package = require(fspath.resolve('./package.json'));

/**
* Documenter for Doop@3 + Vue
*
* @type {function}
* @param {Object} [options] Additional options
* @returns {Promise} A promise which will resolve when the compile process has completed
*/
module.exports = function (options) {
	if (!global.app) throw new Error('Cant find `app` global - run this compiler within a Doop project only');
	if (!_.has(global.app, 'db')) throw new Error('Cant find initialised database - task depends on "load:app"');

	let settings = {
		widdershins: {
			codeSamples: true,
			//expandBody: true,
			user_templates: fspath.join(__dirname, '../templates/widdershins'),
			// Inject response schema from Mongoose {{{
			/*
			templateCallback: (templateName, stage, data) => {
				Object.keys(data.api.paths).forEach(path => {
					const match = /^\/(?<type>[\w\.]+)\/(?<controller>[\w\.]+)\/?(?<params>.*)/.exec(path);
					if (!match) {
						console.warn('[WARN]', 'Unable to generate template for path', path)
						return;
					}

					if (match.groups?.type !== 'api') return;

					// FIXME: Support Monoxide or Mongoosy
					if (!_.has(app.db, match.groups?.controller) || !app.db[match.groups?.controller]?.$mongooseModel?.schema) return;
					
					const schema = app.db[match.groups?.controller]?.$mongooseModel?.schema?.paths;
					const item = {
						type: 'object',
						//required: [],
						properties: _(schema).mapValues(v => {
							// TODO: Default?
							switch (v.instance) {
								case 'Date':
									return {
										type: 'string',
										format: 'date',
									};
								case 'ObjectID':
									return {
										type: 'string',
									};
								default:
									return {
										type: v.instance.toLowerCase(),
									};
							}
							
						}).value(),
						// TODO: enumValues
					};

					// GET {{{
					if (_.has(data.api.paths[path], 'get')) {
						switch (match.groups?.params) {
							case '': // List
								data.api.paths[path].get.responses = {
									'200': {
										description: '',
										content: {
											'application/json': {
												schema: {
													type: 'array',
													items: {
														type: 'object',
													}
												}
											}
										}
									}
								};
								break;
							case ':id': // Retrieve
								data.api.paths[path].get.responses = {
									'200': {
										description: '',
										content: {
											'application/json': {
												schema: item
											}
										}
									}
								};
								break;
						}
					}
					// }}}

					// POST {{{
					if (_.has(data.api.paths[path], 'post')) {
						switch (match.groups?.params) {
							case '': // Create
							case ':id': // Update
								data.api.paths[path].post.responses = {
									'200': {
										description: '',
										content: {
											'application/json': {
												schema: item
											}
										}
									}
								};
								break;
						}
					}
					// }}}
				});
				return data;
			},
			// }}}
			*/
			
			/*
			tagGroups: [
				{
					title: "Companies",
					tags: ["companies"]
				},
			],
			*/
		},
		shins: {
			inline: true,
			logo: './assets/logo/logo.png',
			'logo-url': app.config.publicUrl,
		},
		log: console.log,
	};
	if (_.isPlainObject(options)) _.merge(settings, options);

	return Promise.resolve()
		.then(() => fs.promises.mkdir('dist/docs', { recursive: true }))
		.then(() => {
			return new Reader()
				.parseFiles(glob.sync([
					'**/templates.doop'
				]))
				.then(contents => {

					// Customise paths as per project configuration {{{
					for (path in contents.oapi.paths) {
						const match = /^\/(?<type>[\w\.]+)\/(?<controller>[\w\.]+)\/?(?<params>.*)/.exec(path);
						if (!match) {
							console.warn('[WARN]', 'Unable to parse path', path)
							continue;
						}

						const controllerName = _.startCase(match.groups?.controller);
						const controllerNameSingular = pluralize.singular(controllerName);
						
						for (method in contents.oapi.paths[path]) {

							// Categorise paths by controller
							contents.oapi.paths[path][method].tags = [controllerName];

							// Define unique operation identy {{{
							let operationId;
							switch (match.groups?.type) {
								case 'api':
									switch (method) {
										case 'delete':
											operationId = `Delete ${controllerNameSingular}`;
											break;
										case 'get':
											switch (match.groups?.params) {
												case '':
													operationId = `List ${controllerName}`;
													break;
												case ':id':
													operationId = `Retrieve ${controllerNameSingular}`;	
													break;
												case 'count':
													operationId = `Count ${controllerName}`;
													break;
												case 'meta':
													operationId = `Retrieve ${controllerName} Metadata`;
													break;
											}
										break;
										case 'post':
											switch (match.groups?.params) {
												case '':
													operationId = `Create ${controllerNameSingular}`;
													break;
												case ':id':
													operationId = `Update ${controllerNameSingular}`;	
													break;
											}
											break;
									}
									break;
								case 'go':
									operationId = `Redirect ${controllerNameSingular}`;
									contents.oapi.paths[path][method].tags.push('Redirect');
									break;
							}
							if (operationId) contents.oapi.paths[path][method].operationId = operationId;
							// }}}

							// Configure path security to match config {{{
							contents.oapi.paths[path][method].security = [];
							if (app.config.session.authApiKey.enabled)
								contents.oapi.paths[path][method].security.push({ apiKey: [] });
							if (app.config.session.authHeader.enabled)
								contents.oapi.paths[path][method].security.push({ authHeader: [] });
							if (app.config.session.cookie.enabled)
								contents.oapi.paths[path][method].security.push({ cookie: [] });
							// }}}
						}
					}
					// }}}

					
					// Define possible security policies {{{
					let securitySchemes = {};
					if (app.config.session.authApiKey.enabled) securitySchemes.apiKey = {
						type: 'apiKey',
						in: 'query', // TODO: Where?
						//description: 'apiKey',
						name: 'apiKey', // TODO: Name of header?
					};

					if (app.config.session.authHeader.enabled) securitySchemes.authHeader = {
						type: 'apiKey',
						in: 'header',
						//description: 'authHeader',
						name: 'authHeader', // TODO: Name of header?
					};

					if (app.config.session.cookie.enabled) securitySchemes.cookie = {
						type: 'apiKey',
						in: 'cookie',
						description: 'Session (Express)',
						name: app.config.session.cookie.name,
					};
					// }}}

					const oapi = {
						openapi: '3.0.0',
						info: {
							version: package.version, 
							title: package.name.toUpperCase(),
							license: {
								name: package.license || 'UNLICENSED'
							}
						},
						servers: [
							{
								url: app.config.publicUrl
							}
						],
						// Find unique tags and sort
						tags: _.uniq(new Array().concat(
							...Object.values(contents.oapi.paths)
								.map(path => new Array().concat(
									...Object.values(path)
										.map(oper => oper.tags)
										.filter(tag => tag) // Ensure value is defined
								)
							)
						)).sort(),
						components: {},
						...contents.oapi,
					};
					
					oapi.components.securitySchemes = securitySchemes;

					fs.writeFileSync('dist/docs/rest.json', JSON.stringify(oapi, null, 2), 'utf8');
					return oapi;
				})
				.then(oapi => widdershins.convert(oapi, settings.widdershins))
				.then(markdown => {
					fs.writeFileSync('dist/docs/rest.md', markdown, 'utf8');
					return markdown;
				})
				// NOTE: Passing null as callback to work-around shins bug in promise implementation
				.then(markdown => shins.render(markdown, settings.shins, null))
				.then(html => {
					fs.writeFileSync('dist/docs/rest.html', html, 'utf8');
					return html;
				})
				.catch(e => console.warn(e))
		}
	)
};