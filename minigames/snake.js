const {NixHTTPApp} = require("../http");
const {v1} = require("uuid");
const {EventEmitter} = require("events");

class SnakeBoard {
	constructor(boardSize) {
		this.size = boardSize;
		this.rows = [];
		for (let y = 0; y < boardSize; y++) {
			let row = [];
			for (let x = 0; x < boardSize; x++) {
				row.push(null);
			}

			this.rows.push(row);
		}
	}

	get(x, y) {
		return this.rows[y][x]
	}

	set(x, y, data) {
		this.rows[y][x] = data
	}
};

class Snake {
	constructor(x, y, length) {
		this.head = [x, y];
		this.direction = "right";
		this.lastDirection = "right";
		this.length = length;
		this.history = [this.head.slice(0)];
	}

	changeDirection(direction) {
		switch (direction) {
		case "up":
			if (this.lastDirection != "down")
				this.direction = "up";
			break;
		case "down":
			if (this.lastDirection != "up")
				this.direction = "down";
			break;
		case "left":
			if (this.lastDirection != "right")
				this.direction = "left";
			break;
		case "right":
		default:
			if (this.lastDirection != "left")
				this.direction = "right";
			break;
		}
	}

	moveForwards(boardSize) {
		// add to history the current position
		switch (this.direction) {
		case "up":
			this.head[1] = (((this.head[1] - 1) % boardSize) + boardSize) % boardSize;
			break;
		case "down":
			this.head[1] = (((this.head[1] + 1) % boardSize) + boardSize) % boardSize;
			break;
		case "left":
			this.head[0] = (((this.head[0] - 1) % boardSize) + boardSize) % boardSize;
			break;
		case "right":
		default:
			this.head[0] = (((this.head[0] + 1) % boardSize) + boardSize) % boardSize;
			break;
		}
		this.history.push(this.head.slice(0));
	}
};

class SnakeGame extends EventEmitter {
	constructor(boardSize, tickrate) {
		super();
		this.board = new SnakeBoard(boardSize);
		this.snakes = Object.create(null); // [auth]: snake
		this.currentTick = 0;
		this.snakeid = 0;
		this.tickrate = tickrate;
		this.interval = setInterval(() => this.tick(), tickrate);
	}

	delete() {
	}

	tick() {
		this.currentTick++;

		for (let auth in this.snakes) {
			let snake = this.snakes[auth];
			if (snake.dead) {
				continue;
			}
			snake.lastHead = snake.head.slice(0);

			// preemptive updating for smoother input
			if (snake.nextDirection) {
				snake.changeDirection(snake.nextDirection)
				delete snake.nextDirection;
			}

			// update and move the snake
			snake.lastDirection = snake.direction
			snake.moveForwards(this.board.size);

			let old = this.board.get(...snake.head);

			if (old && old.what == "food") {
				snake.length++;
				if (snake.length == this.board.size) {
					snake.length++;
				}
			}

			// remove outdated history from game board
			while (snake.history.length > snake.length) {
				let [x, y] = snake.history.shift();
				this.board.set(x, y, null);
			}
		}

			
		for (let auth in this.snakes) {
			let snake = this.snakes[auth];
			if (snake.dead) {
				continue;
			}

			let [x, y] = snake.head;

			let old = this.board.get(x, y);

			if (old && old.what instanceof Snake) {
				let collider = old.what;

				// snake competition
				let [lhx, lhy] = collider.lastHead || [-1, -1];
				let [hx, hy] = collider.head;
				if (lhx == snake.head.x && lhy == snake.head.y || hx == snake.head.x && hy == snake.head.y) {
					if (collider.length == snake.length) { // both lose
						this.killSnake(snake.auth);
						this.killSnake(collider.auth);
						continue;
					}
					else {
						let loser = collider.length > snake.length ? snake : collider;
						this.killSnake(loser.auth);
						snake.length++;
						if (snake.length == this.board.size) {
							snake.length++;
						}

						if (loser == snake) {
							continue;
						}
					}
				}
				else {
					this.killSnake(snake.auth);
					continue;
				}
			}

			if (snake.lastHead && snake.length != 1) {
				let [lx, ly] = snake.lastHead;
				this.board.get(lx, ly).direction = snake.lastDirection;
			}

			this.board.set(x, y, {
				direction: null,
				what: snake
			});
		}

		if (Math.random() < 1 / 3) {
			this.addFood();
		}
	}

	killSnake(id) {
		let snake = this.snakes[id];
		snake.dead = true;

		// mark all previous history as food now that it died

		while (snake.history.length != 0) {
			let [x, y] = snake.history.shift();
			let boardData = this.board.get(x, y);
			if (!boardData || boardData.what !== snake) {
				continue;
			}
			this.board.set(x, y, {
				what: "food"
			});
		}

		this.emit("snakedeath", snake);

		for (let id in this.snakes) {
			let snake = this.snakes[id]
			if (!snake.dead)
				return;
		}

		// GAME DEAD

		this.endGame()
	}

	endGame() {
		clearInterval(this.interval);
		this.emit("gameend");
	}

	addSnake(id, info) {
		let snakeid = this.snakeid++;

		let snake = new Snake(Math.floor(Math.random() * this.board.size), (snakeid * 2) % this.board.size, 3);
		snake.id = snakeid;
		snake.auth = id;
		snake.info = info;
		this.snakes[id] = snake;

		this.board.set(snake.head[0], snake.head[1], {
			direction: null,
			what: snake
		});
	}

	addFood() {
		let available = [];
		for (let x = 0; x < this.board.size; x++) {
			for (let y = 0; y < this.board.size; y++) {
				if (!this.board.get(x, y)) {
					available.push([x, y]);
				}
			}
		}

		let pos = available[Math.floor(Math.random() * available.length)];

		if (!pos) {
			return false;
		}

		this.board.set(pos[0], pos[1], {what: "food"});

		return pos;
	}
};

module.exports.SnakeMinigameApp = class SnakeMinigameApp extends NixHTTPApp {
	constructor(nix) {
		super();

		this.nix = nix;

		this.lobby = Object.create(null);
		this.tryStartNewGame();
	}

	tryStartNewGame() {
		if (this.timeout) {
			clearTimeout(this.timeout);
		}

		if (Object.keys(this.lobby).length >= 1) {
			this.createNewGame()
		}
		else {
			this.timeout = setTimeout(() => this.tryStartNewGame(), 5000)
		}
	}

	createNewGame() {
		this.game = new SnakeGame(Math.max(5, Math.min(20, 2 * Object.keys(this.lobby).length)), 350);
		for (let steamid in this.lobby) {
			let queue = this.lobby[steamid];
			this.game.addSnake(queue.auth, queue.info);
		}

		this.game.once("gameend", () => {
			delete this.game;
			this.timeout = setTimeout(() => {
				this.tryStartNewGame();
			}, 5000);
		});
	}

	isAuthorized(authorization) {
		if (!this.game) {
			return false;
		}

		return !!this.game.snakes[authorization];
	}

	async handlePost(req, res) {
		let snake = this.game.snakes[req.params.auth];

		snake.changeDirection(req.body.direction);

		return {};
	}

	handleMessage(json, ws) {
		if (json.what == "add") {
			let steamid = json.steamid;
			if (this.lobby[steamid]) {
				let queue = this.lobby[steamid];
				return {
					created: false,
					info: queue.info,
					auth: queue.auth
				};
			}

			let queue = {
				info: json,
				auth: v1(),
				socket: ws
			}

			ws.on("close", () => {
				if (this.lobby[steamid] === ws) {
					delete this.lobby[steamid];
				}
			});

			this.lobby[steamid] = queue;
			return {
				created: true,
				info: queue.info,
				auth: queue.auth
			};
		}
		else if (json.what == "delete") {
			delete this.lobby[json.steamid];
		}
	}

	handleGet(req, res) {
		if (!this.game) {
			return res.end(JSON.stringify({
				waiting: true
			}));
		}

		let data = {
			snakes: [],
			board: [],
			boardSize: this.game.board.size,
			tick: this.game.currentTick,
			tickrate: this.game.tickrate
		};

		for (let auth in this.game.snakes) {
			let snake = this.game.snakes[auth];

			data.snakes.push({
				id: snake.id,
				info: snake.info,
				length: snake.length,
				dead: snake.dead
			});
		}

		for (let x = 0; x < this.game.board.size; x++) {
			for (let y = 0; y < this.game.board.size; y++) {
				let boardData = this.game.board.get(x, y);
				if (boardData) {
					if (boardData.what == "food") {
						data.board.push({
							x,
							y,
							what: "food"
						});
					}
					else if (boardData.what instanceof Snake) {
						data.board.push({
							x,
							y,
							what: "snake",
							snake: boardData.what.id,
							direction: boardData.direction
						});
					}
				}
			}
		}

		res.end(JSON.stringify(data));
	}

	status() {
		if (!this.game) {
			return `Waiting for players...`;
		}

		let alive = 0;
		for (let id in this.game.snakes) {
			let snake = this.game.snakes[id]
			if (!snake.dead)
				alive++;
		}
		return `Board ${this.game.board.size}x${this.game.board.size}; tick ${this.game.currentTick}@${this.game.tickrate}ms; alive ${alive}`
	}
};
