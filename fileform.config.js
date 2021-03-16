const path = require('path')

exports.form = {
	description: String,
	org: [String, ['alloc', 'aleclarson']],
	target: [String, 'esnext'],
	module: [String, ['esnext', 'commonjs']],
}

exports.context = {
	name: path.basename(__dirname),
}
