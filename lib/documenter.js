const _ = require('lodash');
const fs = require('fs');
const glob = require('globby');
const fspath = require('path');
const pluralize = require('pluralize');
const widdershins = require('widdershins');
const shins = require('shins');
const debug = require('debug')('docs:documenter');

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
	if (!_.has(global.app, 'db')) throw new Error('Cant find initialised database - task depends on "load:app.db"');
	// TODO: Test DB has actually been loaded.

	let settings = {
		// TODO: Define these as reusable components.schemas or components.responses?
		responseTypes: {
			// Files {{{
			Stream: {
				type: 'application/octet-stream',
				schema: {
					type: 'string',
					format: 'binary'
				}
			},
			File: {
				type: 'application/octet-stream',
				schema: {
					type: 'string',
					format: 'binary'
				}
			},
			PDF: {
				type: 'application/pdf',
				schema: {
					type: 'string',
					format: 'binary'
				}
			},
			GIF: {
				type: 'image/gif',
				schema: {
					type: 'string',
					format: 'base64'
				}
			},
			JPEG: {
				type: 'image/jpeg',
				schema: {
					type: 'string',
					format: 'base64'
				}
			},
			PNG: {
				type: 'image/png',
				schema: {
					type: 'string',
					format: 'base64'
				}
			},
			// }}}
			
			// Text {{{
			String: {
				type: 'text/plain',
				schema: {
					type: 'string',
					// TODO: Specify format?
				}
			},
			HTML: {
				type: 'text/html',
				schema: {
					type: 'string',
					format: 'html',
				}
			},
			// FIXME: Should Date be a "YYYY-MM-DD" "date" while DateTime is an ISO Date "date-time? 
			Date: {
				type: 'text/plain',
				schema: {
					type: 'string',
					format: 'date',
				}
			},
			DateTime: {
				type: 'text/plain',
				schema: {
					type: 'string',
					format: 'date-time',
				}
			},
			// }}}
			
			// JSON {{{
			Array: {
				type: 'application/json',
				schema: {
					type: 'array'
				}
			},
			Object: {
				type: 'application/json',
				schema: {
					type: 'object'
				}
			},
			// }}}
		},

		widdershins: {
			codeSamples: true,
			//expandBody: true,
			user_templates: fspath.join(__dirname, '../templates/widdershins'),
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
				// Load all .doop files
				.parseFiles(glob.sync([
					// TODO: Configurable glob
					'**/*.doop',
				]), {
					responseTypes: settings.responseTypes,
				})
				.then(contents => {
					console.log("Running custom @doop/docs");
					if (!contents.oapi) throw new Error('Invalid response');

					// Automatic schema discovery {{{
					for (collection in contents.oapi.components.schemas) {
						// TODO: Support looking up collection for schema via original before @name
						if (!_.has(app.db, collection)) continue;

						_.merge(contents.oapi.components.schemas[collection], {
							properties: _(app.db[collection]?.schema?.paths || app.db[collection]?.$mongooseModel?.schema?.paths) // Support either Mongoosy or Monoxide
								.mapValues(p => {
									var t = {};
									switch (p.instance) {
										case 'Date':
											t.type = 'string';
											t.format = 'date-time';
											break;
										case 'ObjectID':
											t.type = 'string';
											t.format = 'uuid'; // TODO: objectid? 
											break;
										default:
											t.type = p.instance.toLowerCase();
											break;
									}
			
									return {
										...t,
									};
								})
								.value(),
						});
					}
					// }}}

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
							// Define unique operation identity {{{
							let operationId;
							switch (match.groups?.type) {
								case 'api':
									// Categorise paths by controller
									contents.oapi.paths[path][method].tags = [controllerName];

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
												case ':id?':
													operationId = `Create&#47;Update ${controllerNameSingular}`;	
													break;
											}
											break;
									}
									break;
								case 'go':
									operationId = `Redirect ${controllerNameSingular}`;
									contents.oapi.paths[path][method].tags = ['Redirects'];
									break;
							}
							if (!contents.oapi.paths[path][method].operationId && operationId)
								contents.oapi.paths[path][method].operationId = operationId;
							// }}}

							// Configure path security to match config {{{
							contents.oapi.paths[path][method].security = [];
							if (app.config.session?.authApiKey?.enabled)
								contents.oapi.paths[path][method].security.push({ apiKey: [] });
							if (app.config.session?.authHeader?.enabled)
								contents.oapi.paths[path][method].security.push({ authHeader: [] });
							if (app.config.session?.cookie?.enabled)
								contents.oapi.paths[path][method].security.push({ cookie: [] });
							// }}}
						}
					}
					// }}}

					// Define possible security policies {{{
					if (!_.has(contents.oapi.components, 'securitySchemes'))
						contents.oapi.components.securitySchemes = {};

					if (app.config.session?.authApiKey?.enabled)
						contents.oapi.components.securitySchemes.apiKey = {
							type: 'apiKey',
							in: 'query', // TODO: Where?
							//description: 'apiKey',
							name: 'apiKey', // TODO: Name of header?
						};

					if (app.config.session?.authHeader?.enabled)
						contents.oapi.components.securitySchemes.authHeader = {
							type: 'apiKey',
							in: 'header',
							//description: 'authHeader',
							name: 'authHeader', // TODO: Name of header?
						};

					if (app.config.session?.cookie?.enabled)
						contents.oapi.components.securitySchemes.cookie = {
							type: 'apiKey',
							in: 'cookie',
							description: 'Session (Express)',
							name: app.config.session.cookie.name,
						};
					// }}}

					// Find unique tags and sort {{{
					contents.oapi.tags = _.uniq(new Array().concat(
						...Object.values(contents.oapi.paths)
							.map(path => new Array().concat(
								...Object.values(path)
									.map(oper => oper.tags)
									.filter(tag => tag) // Ensure value is defined
							)
						)
					)).sort();
					contents.oapi.tags.push('Redirects');
					// }}}

					// InitialiseOpenAPI meta-data {{{
					// FIXME: Could be at the top of the file.
					_.merge(contents.oapi, {
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
					});
					// }}}

					// settings.log("[INFO]", "OpenAPI", contents.oapi);
					settings.log("\nRunning custom @doop/docs\n")

					fs.writeFileSync('dist/docs/rest.json', JSON.stringify(contents.oapi, null, 2), 'utf8');
					return contents.oapi;
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