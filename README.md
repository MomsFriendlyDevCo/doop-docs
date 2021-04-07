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

gulp.task('build.vue', ['load:app', 'load:app.git'], ()=>
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


**NOTES:**

* https://github.com/Mermade/widdershins#options
* https://github.com/Mermade/shins
