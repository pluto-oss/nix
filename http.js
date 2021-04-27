const express = require("express");
const expressWs = require("express-ws");

module.exports.NixHTTPApp = class NixHTTPApp {
	constructor() {
		this.requests = 0;
	}

	isAuthorized(authorization) {
		if (!authorization) {
			return false;
		}

		return true;
	}

	async handlePost(req, res) {
		this.requests++;

		return {
			data: {}
		}
	}

	async handleGet(req, res) {
		this.requests++;
		res.end();
	}

	status() {
		return "Unknown";
	}
}

module.exports.NixHTTPServer = class NixHTTPServer {
	constructor(port) {
		this.requests = {
			handled: 0,
			gotten: 0,
			auth_failure: 0
		}
		this.app = express();
		expressWs(this.app);

		this.apps = Object.create(null);

		this.app.use(express.json());
		this.app.use(express.urlencoded({
			extended: true
		}));
		this.app.post('/app/:appid/:auth', this.appValidator.bind(this), this.authorizationHandler.bind(this), this.postHandler.bind(this));
		this.app.get('/app/:appid', this.appValidator.bind(this), this.getHandler.bind(this));

		this.app.listen(port, () => {
			console.log(`NixHTTPServer listening on port ${port}`);
		})
	}

	resultData(status, data) {
		return JSON.stringify({
			status,
			data
		})
	}

	appValidator(req, res, next) {
		let app = this.apps[req.params.appid]
		this.requests.gotten++;
		if (!app) {
			this.requests.auth_failure++;
			return res.send(this.resultData("unknown appid"));
		}

		req.nixapp = app;
		next();
	}

	authorizationHandler(req, res, next) {
		if (!req.params.auth) {
			this.requests.auth_failure++;
			return res.send(this.resultData("missing authorization"));
		}

		if (!req.nixapp.isAuthorized(req.params.auth)) {
			return res.send(this.resultData("invalid authorization"));
		}

		next();
	}

	async postHandler(req, res) {
		try {
			let response = await req.nixapp.handlePost(req, res);
			this.requests.handled++;
			res.end(this.resultData(response.status, response.data));
		}
		catch (e) {
			console.error(e.stack);
			res.end(this.resultData("internal error"));
		}
	}

	async getHandler(req, res) {
		this.requests.handled++;
		req.nixapp.handleGet(req, res);
	}
}
