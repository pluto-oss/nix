const {EventEmitter} = require("events");

module.exports.GModClient = class GModClient extends EventEmitter {
	constructor(ws, json, app, nix) {
		super();
		this.nix = nix;
		this.app = app;
		this.json = json;
		this.ws = ws;
		ws.on("message", msg => this.onMessage(msg, ws));
		this.on("messageReceived", msg => this.messageReceived(msg));
	}

	onMessage(msg, cl) {
		try {
			let json = JSON.parse(msg);
			if (json.type == "msg") {
				this.emit("message", json);
			}
			else if (json.type == "snake") {
				this.ws.send(JSON.stringify({
					type: "snake",
					response: this.app.apps.snake.handleMessage(json, this.ws)
				}));
			}
			else if (json.type === "maps") {
				this.emit("mapRequest", cl);
			}
		}
		catch (e) {
			console.error(e);
		}
	}

	messageReceived(msg) {
		this.ws.send(JSON.stringify(msg));
	}
};