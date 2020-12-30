const {GModClient} = require("./clients/gmodclient");
const WebSocket = require("ws");
const discord = require("discord.js");
const config = require("./config");
const {post} = require("axios");

class NixServer {
	constructor() {
		this.discord = new discord.Client();
		this.discord.on("ready", () => this.onDiscordReady());
		this.discord.login(config.discord.token);
		this.wss = new WebSocket.Server({port: config.port});
		this.wss.on("connection", (ws, req) => this.onConnection(ws, req))

		this.gmodclients = Object.create(null); // [name]: cl
	}

	onConnection(ws, req) {
		ws.once("message", msg => {
			try {
				let json = JSON.parse(msg);
				if (json && json.client_type === "gmod" && json.client_secret === config.secret && "client_name" in json) {
					console.log("new client!");
					let cl = new GModClient(ws, json);
					cl.on("message", msg => this.onGModMessage(cl, msg))

					this.gmodclients[json.client_name] = cl;
					cl.id = json.client_name;
				}
			}
			catch (e) {
				ws.close();
			}
		})
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