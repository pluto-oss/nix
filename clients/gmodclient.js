const {EventEmitter} = require("events");

module.exports.GModClient = class GModClient extends EventEmitter {
	constructor(ws, json) {
		super();
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
		}
		catch (e) {
			console.error(e);
		}
		console.log("client message:" + msg)
	}

	messageReceived(msg) {
		this.ws.send(JSON.stringify(msg));
	}
};