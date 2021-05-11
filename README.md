@DOOP/Docs
==================
Doop documentation module

This module generally lives inside a build script.


```javascript
/**
* Scan files for inline comments and build documentation 
*/
let gulp = require('gulp');
let {documenter} = require('@doop/docs');

gulp.task('build.vue', ['load:app', 'load:app.db', 'load:app.git'], ()=>
	documenter({
		log: gulp.log, // Fancy logging output
	})
);
```


API
===
This module exports only one sub-module currently, the `documenter` function.


Documenter(options)
-----------------
Scan project for inline documentation and process placing resulting files in the `dist/docs` directory within the parent Doop project.

This function expects the Doop global `app` to be available and it will use it for pathing, config information.

Options:

| Name            | Type       | Default          | Description                                                                      |
|-----------------|------------|------------------|----------------------------------------------------------------------------------|
| `widdershins`        | `Object`   | `{ codeSamples: true, user_templates: '../templates/widdershins' }` | Upstream widdershins config, see notes                                             |
| `shins`   | `Object`   | `shins: { inline: true, logo: './assets/logo/logo.png', 'logo-url': app.config.publicUrl },` | Upstream shins config, see notes                            |
| `log`           | `function` | `console.log`    | Logging function for any output                                                  |
| `responseTypes` | `Object` | `{ File: { type: 'application/octet-stream', schema: { type: 'string', format: 'binary' }}}` | Predefined content-type and schema for `@returns`


Usage
=============

* `@returns {Object}` where a collection is available will automagically be replaced with `@returns {ModelName}`
* `@returns {ModelName}` will create an `application/json` response with schema properties matching that of the Mongo collection.


Predefined Response Types
-------------------------

These types may be used in `@returns {Type}` and allow association of a response with a content-type and schema.

| Name            | Type       | Schema Type      | Schema Format    |
|-----------------|------------|------------------|------------------|
| `Stream`        | `application/octet-stream` | `string` | `binary` |
| `File`          | `application/octet-stream` | `string` | `binary` |
| `PDF`           | `application/pdf` | `string` | `binary` |
| `GIF`           | `image/gif` | `string` | `base64` |
| `JPEG`          | `image/jpeg` | `string` | `base64` |
| `PNG`           | `image/png` | `string` | `base64` |
| `String`        | `text/plain` | `string` | |
| `HTML`          | `text/html` | `string` | `html` |
| `Date`          | `text/plain` | `string` | `date` |
| `DateTime`      | `text/plain` | `string` | `date-time` |
| `Array`         | `application/json` | `array` | |
| `Object`        | `application/json` | `object` | |


**NOTES:**

* https://github.com/Mermade/widdershins#options
* https://github.com/Mermade/shins
