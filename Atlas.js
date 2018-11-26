const Raven = require('raven');
const path = require('path');
const Eris = require('eris');
const fs = require('fs').promises;

const lib = require('./lib');
const Util = require('./src/util');
const Agenda = require('./src/agenda');
const cmdUtil = require('./src/commands');
const structs = require('./src/structures');
const constants = require('./src/constants');
const PlayerManager = require('./src/structures/PlayerManager');
const GuildSettingsClass = require('./src/structures/GuildSettings');
const Player = require('./src/structures/Player');

const { version } = require('./package.json');

const DB = lib.structs.Database;

// load eris addons cus lazy
const addons = lib.utils.walkSync(path.join(__dirname, 'src/addons'));

addons.filter(a => a.endsWith('.js'))
	.forEach((a) => {
		const Prop = require(a);
		Prop(Eris);
	});

console.log(`Loaded ${addons.length} eris addons`);

module.exports = class Atlas {
	constructor({
		client,
		clusterID,
	}) {
		module.exports = this;

		this.version = version;
		this.userAgent = `Atlas (https://github.com/get-atlas/bot, ${version})`;

		this.client = client;
		this.auditOverrides = [];
		// an array of ID's for things like roles where if a member gets it the event should be ignored
		// used for things like overriding the action log for "mute" to show more info
		this.ignoreUpdates = [];

		this.Raven = Raven;
		this.structs = structs;
		this.clusterID = clusterID;

		this.util = (new Util(this));

		this.constants = constants;
		this.colors = constants.colors;

		// messages sent by the responder
		this.sent = [];

		this.commands = {
			labels: new Map(),
			aliases: new Map(),
			get(label) {
				return this.labels.get(label) || this.labels.get(this.aliases.get(label));
			},
			has(label) {
				return this.labels.has(label) || this.aliases.has(label);
			},
		};

		this.locales = new Map();
		this.filters = new Map();
		this.plugins = new Map();
		this.agenda = new Agenda();

		this.DB = new DB({
			GuildSettingsClass,
		});

		this.DB.init();

		this.collectors = {
			emojis: {
				map: {},
				get: id => this.collectors.emojis.map[id],
				delete: (id, collector) => {
					if (this.collectors.emojis.map[id]) {
						const index = this.collectors.emojis.map[id].findIndex(c => c === collector);
						if (this.collectors.emojis.map[id][index]) {
							return !!this.collectors.emojis.map[id].splice(index);
						}
					}
				},
				add: (id, collector) => {
					if (this.collectors.emojis.map[id]) {
						this.collectors.emojis.map[id].push(collector);
					} else {
						this.collectors.emojis.map[id] = [collector];
					}
				},
			},
		};

		// when a message ID matching the key is deleted, delete the map value (another ID)
		this.deleteAliases = new Map();

		this.version = require('./package.json').version;

		this.lib = lib;
		this.env = process.env.NODE_ENV || 'development';
	}

	// im lazy
	/**
	 * gets the bot's avatar URL
	 */
	get avatar() {
		return this.client.user.avatarURL;
	}

	/**
	 * Launch the bot,
	 * @param {boolean} reload Whether or not the bot is being reloaded
	 * @returns {void}
	 */
	async launch(reload = false) {
		// setting up sentry when possible
		if (process.env.SENTRY_DSN) {
			Raven.config(process.env.SENTRY_DSN, {
				environment: process.env.NODE_ENV,
				name: 'Atlas',
				release: require('./package.json').version,
				captureUnhandledRejections: true,
				stacktrace: true,
				autoBreadcrumbs: { http: true },
			}).install((err, sendErr, eventId) => {
				if (!sendErr) {
					console.warn(`Successfully sent fatal error with eventId ${eventId} to Sentry`);
				}
			});
		} else {
			console.warn('"SENTRY_DSN" env not found, error reporting disabled.');
		}

		const filters = await fs.readdir('src/filters');
		filters.forEach((f) => {
			const Filter = require(`./src/filters/${f}`);
			const filter = new Filter(this);

			filter.info = Filter.info;

			this.filters.set(f.split('.')[0], filter);

			console.log(`Loaded chat filter: "${f}"`);
		});

		console.log(`Loaded ${filters.length} filters`);

		const events = await fs.readdir('src/events');
		// Loading events
		events.forEach((e) => {
			const Handler = require(`./src/events/${e}`);
			const handler = new Handler(this);

			this.client.on(e.split('.')[0], handler.execute.bind(handler));

			delete require.cache[require.resolve(`./src/events/${e}`)];

			console.log(`Loaded event handler :"${e}"`);
		});

		console.log(`Loaded ${events.length} events`);

		// Loading locales
		const locales = await fs.readdir('./locales');
		for (const locale of locales) {
			console.log(`Loading locale "${locale}"`);
			const files = await fs.readdir(path.join('./locales', locale));

			const data = {};
			files.forEach((f) => {
				data[f.split('.')[0]] = require(`./locales/${locale}/${f}`);
			});

			this.locales.set(locale, data);
		}

		console.log(`Loaded ${this.locales.size} languages`);

		// set the bot status
		if (process.env.STATUS) {
			this.client.editStatus('online', {
				name: process.env.STATUS.split('{version}').join(this.version),
				type: 0,
			});
		}

		// setup the player
		this.client.voiceConnections = new PlayerManager(this.client, [
			{
				region: 'us',
				host: process.env.LAVALINK_HOST,
				password: process.env.LAVALINK_PASS,
				port: Number(process.env.LAVALINK_PORT),
			},
		], {
			numShards: this.client.options.maxShards,
			userId: this.client.user.id,
			defaultRegion: 'us',
			player: Player,
		});

		// get agenda to connect
		this.agenda.connect();
		// load commands
		cmdUtil.load(this, reload);
	}

	/**
	 * Gets a colour
	 * @param {string} name the name of the colour to get
	 * @returns {Object} the color, see ./src/colors for what can be returned
	 */
	color(name) {
		const colour = this.colors.find(m => m.name === name.toUpperCase());
		if (!colour) {
			throw new Error(`Color does not exist with name "${name}"`);
		}

		return parseInt(colour.color.replace(/#/ig, ''), 16);
	}
};
