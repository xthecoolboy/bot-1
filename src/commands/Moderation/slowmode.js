const Endpoints = require('eris/lib/rest/Endpoints');
const Command = require('../../structures/Command.js');

/*!
    Note:
        At the time of writing this command, slowmode is still in beta and can't be toggled through the client or Eris
        so i've had to call it directly
*/
module.exports = class Mute extends Command {
	constructor(Atlas) {
		super(Atlas, module.exports.info);
	}

	async action(msg, args, {
		settings, // eslint-disable-line no-unused-vars
	}) {
		const responder = new this.Atlas.structs.Responder(msg);

		if (!args[0]) {
			return responder.embed(this.helpEmbed(msg)).send();
		}
		const num = Number(args[0]);

		if (this.Atlas.constants.disableTriggers.includes(args[0].toLowerCase()) || num === 0) {
			await this.Atlas.client.requestHandler.request('PATCH', Endpoints.CHANNEL(msg.channel.id), true, {
				rate_limit_per_user: 0,
			});

			return responder.text('slowmode.disabled', msg.channel.mention).send();
		}

		if (!num) {
			return responder.embed(this.helpEmbed(msg)).send();
		}

		if (num < 0 || num > 120) {
			return responder.error('slowmode.invalid').send();
		}

		await this.Atlas.client.requestHandler.request('PATCH', Endpoints.CHANNEL(msg.channel.id), true, {
			rate_limit_per_user: num,
		});

		return responder.text('slowmode.success', this.Atlas.lib.utils.prettyMs(num * 1000)).send();
	}
};

module.exports.info = {
	name: 'slowmode',
	usage: 'info.slowmode.usage',
	description: 'info.slowmode.description',
	examples: [
		'120',
		'0',
		'off',
	],
	requirements: {
		permissions: {
			user: {
				manageChannels: true,
			},
			bot: {
				manageChannels: true,
			},
		},
	},
	guildOnly: true,
};
