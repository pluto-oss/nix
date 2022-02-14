const {GModClient} = require("./clients/gmodclient");
const discord = require("discord.js");
const config = require("./config");
const {post} = require("axios");
const {NixHTTPServer} = require("./http");
const {SnakeMinigameApp} = require("./minigames/snake");
const {readFileSync, writeFileSync} = require("fs");


class NixServer {
	constructor() {
		this.http = new NixHTTPServer(config.port, this);

		try {
			this.mapConfig = JSON.parse(readFileSync("map.json", "ascii"));
		}
		catch (e) {
			this.mapConfig = {};
			this.saveMapConfig();
		}

		this.discord = new discord.Client();
		this.discord.on("ready", () => this.onDiscordReady());
		this.discord.login(config.discord.token);
		this.discord.on("message", msg => {
			if (!msg.author || config.discord.admins.indexOf(msg.author.id) === -1) {
				return;
			}

			if (msg.content.indexOf("nix ") === 0) {
				let [_, cmd, arg] = msg.content.slice("nix ".length).match(/^([^ ]+) ?(.*)$/)
				if (cmd == "apps") {
					let data = [];
					for (let appid in this.http.apps) {
						data.push(`${appid}: ${this.http.apps[appid].status()}`);
					}
					msg.reply("```\n" + data.join("\n") + "```");
				}
				else if (cmd == "addmap") {
					let [_, mapname, workshopid] = arg.match(/^([^ ]+) (\d+)$/);

					if (!mapname) {
						msg.reply("Incorrect arguments, arguments are: mapname workshop");
						return;
					}

					this.mapConfig[mapname] = workshopid;
					this.saveMapConfig();
					msg.reply(`Set ${mapname} to ${workshopid}`);
				}
				else if (cmd == "disablemap") {
					this.mapConfig[arg.trim()] = false;
					this.saveMapConfig();
					msg.reply(`${arg} has been disabled`);
				}
				else if (cmd == "deletemap") {
					delete this.mapConfig[arg.trim()];
					this.saveMapConfig();
					msg.reply(`${arg} deleted`);
				}
				else if (cmd == "mapconfig") {
					msg.reply(`${config.base_url}/mapconfig.json`);
				}
			}
		})
		this.http.app.ws("", (ws, req) => this.onConnection(ws, req));

		this.http.apps["snake"] = new SnakeMinigameApp(this);

		this.gmodclients = Object.create(null); // [name]: cl
	}

	saveMapConfig() {
		writeFileSync("map.json", JSON.stringify(this.mapConfig));

		for (let client_name in this.gmodclients) {
			this.sendMapConfig(this.gmodclients[client_name]);
		}
	}

	sendMapConfig(cl) {
		cl.send(JSON.stringify({
			"type": "map",
			"response": this.mapConfig
		}));
	}

	broadcastMessage(message) {
		for (let id in this.gmodclients) {
			let cl = this.gmodclients[id];
			cl.send(JSON.stringify(message));
		}
	}

	onConnection(ws, req) {
		ws.once("message", msg => {
			try {
				let json = JSON.parse(msg);
				if (!json || json.client_secret !== config.secret || !("client_name" in json)) {
					return;
				}
				console.log("new client!");
				if (json.client_type === "gmod") {
					let cl = new GModClient(ws, json, this.http, this);
					cl.on("message", msg => this.onGModMessage(cl, msg))
					cl.on("mapRequest", cl => this.sendMapConfig(cl));

					this.gmodclients[json.client_name] = cl;
					cl.id = json.client_name;
				}
			}
			catch (e) {
				ws.close();
			}
		});
	}

	onGModMessage(cl, json) {
		if (json.author) {
			this.sendToDiscord(json.content, json.author + " - " + cl.json.client_name, json.avatar);
		}
		else {
			this.sendToDiscord(json.content, cl.json.client_name);
		}

		for (let k in this.gmodclients) {
			if (cl === this.gmodclients[k]) {
				continue;
			}

			this.gmodclients[k].emit("messageReceived", {
				type: "msg",
				from: cl.id,
				author: json.author,
				content: json.content
			});
		}
	}

	onDiscordMessage(msg) {
		if (!msg.author || msg.author.bot || msg.channel.id !== config.discord.channel) {
			return;
		}

		let guildie = msg.guild.member(msg.author);

		for (let k in this.gmodclients) {
			this.gmodclients[k].emit("messageReceived", {
				type: "msg",
				from: "discord",
				author: guildie.displayName ? guildie.displayName : msg.author.username,
				content: msg.cleanContent
			});
		}
	}

	onDiscordReady() {
		this.discord.on("message", msg => this.onDiscordMessage(msg));
	}

	safeForDiscord(text) {
		return text.replace(/(https?:\/\/[^\s]+)/g, text => "<" + (new URL(text)).toString() + ">");
	}

	sendToDiscord(msg, name, avatar) {
		post(config.discord.webhook, {
			username: name,
			avatar_url: avatar,
			content: this.safeForDiscord(msg),
			allowed_mentions: {parse: []},
		})
	}
}

const nix = new NixServer();