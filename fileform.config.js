const path = require('path')

exports.form = {
	description: String,
	org: [String, ['alloc', 'aleclarson']],
	tsup: [String, ['tsup', 'tsup-node']],
	target: [String, 'esnext'],
	module: [String, ['esnext', 'commonjs']],
}

exports.context = {
	name: path.basename(__dirname),
	format: (_body, ctx) => ctx.module == 'commonjs' ? 'cjs' : 'esm',
}
