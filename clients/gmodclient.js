const {EventEmitter} = require("events");

module.exports.GModClient = class GModClient extends EventEmitter {
	constructor(ws, json, app) {
		super();
		this.app = app;
		this.json = json;
		this.ws = ws;
		ws.on("message", msg => this.onMessage(msg));
		this.on("messageReceived", msg => this.messageReceived(msg));
	}

	onMessage(msg) {
		try {
			let json = JSON.parse(msg);
			if (json.type == "msg") {
				this.emit("message", json);
			}
			else if (json.type == "snake") {
				this.ws.send(JSON.stringify({
					type: "snake",
					response: this.app.apps.snake.handleMessage(json)
				}));
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