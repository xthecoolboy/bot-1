const TagError = require('./../../TagError');

module.exports = (func, argIndex = 0) => async ({
	guild,
	channel,
	Atlas,
	...randomData
}, args, ...randomShit) => {
	if (args[argIndex]) {
		channel = await Atlas.util.findRoleOrChannel(guild, args[argIndex], {
			type: 'channel',
		});

		if (!channel) {
			throw new TagError('Invalid channel query.');
		}
	}


	return func({
		guild,
		channel,
		Atlas,
		...randomData,
	}, args, ...randomShit);
};
