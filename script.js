let canvas = document.getElementById("paper");
let ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.mozImageSmoothingEnabled = false;

let STICK_HEIGHT = 24;
let JUMP_STRENGTH = 7;

let OBSTACLES_PER_CHUNK = 10;
let RENDER_DIST = 2;

AABB = function(obs1, obs2) {
    let x_overlap = obs1.x < obs2.x + obs2.width && obs1.x + obs1.width < obs2.x;
    let y_overlap = obs1.y < obs2.y + obs2.height && obs1.y + obs1.height < obs2.y;
    return x_overlap && y_overlap;
}

class PogoDude {
    constructor(x, y) {
        this.reset(x, y);
        this.sprite = new Image(12, 48);
        this.sprite.src = "assets/placeholder_pogo_man.png";
    }

    reset(x, y) {
        this.x = x;
        this.y = y;
        this.dx = 0;
        this.dy = 0;
        this.drot = 0;
        this.rotation = 0; // in degrees: 0 is up, - is left, + is right, -180 == 180 == down
        this.in_air = false;
    }

    update(input, hit_ground, dt) {

        // this adjusts for different FPS to make movement consistent
        let frame_mod = 15 / dt;

        let momentum = JUMP_STRENGTH;

        // hit ground
        if (/*touching ground?*/ hit_ground) {
            // rotation should be dampened significantly on landing
            if (this.in_air) {
                this.drot *= 0.25;
                this.y -= this.dy / 2;
                this.x -= this.dx / 2;
                momentum = Math.max(JUMP_STRENGTH, Math.sqrt(this.dy ** 2 + this.dx ** 2) * 0.9);
            }

            this.in_air = false;
            this.dy = 0;
            this.dx = 0;
        } else {
            this.in_air = true;
        }

        // acceleration
        this.x += this.dx * frame_mod;
        this.y += this.dy * frame_mod;
        this.rotate(this.drot);
        if (this.in_air) {
            this.dy += 0.15;
        } else {
            this.drot += 0.1 * Math.sin(this.rotation / 180 * Math.PI);
        }

        // jumping
        if (!this.in_air) {
            this.in_air = true;
            this.dx = momentum * Math.sin(this.rotation / 180 * Math.PI);
            this.dy = -momentum *  Math.cos(this.rotation / 180 * Math.PI);
            this.x += this.dx;
            this.y += this.dy;

            this.drot += this.dx * 0.75;
        }
        
        // lean input
        if (input.left) {
            this.drot -= 0.1;
            if (this.in_air) {
                this.drot -= 0.1;
            }
        }
        if (input.right) {
            this.drot += 0.1;
            if (this.in_air) {
                this.drot += 0.1;
            }
        }

        // Control the spin (dont let it get too crazy)
        this.drot *= 0.99;
        if (this.drot > 4) {
            this.drot = 4;
        }
        if (this.drot < -4) {
            this.drot = -4;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(this.rotation / 180 * Math.PI);
        ctx.drawImage(this.sprite, this.sprite.width / -2, this.sprite.height / -2, this.sprite.width, this.sprite.height);
        ctx.restore();
    }

    rotate(deg) {
        deg = deg % 360;
        let theta1 = this.rotation;
        let theta2 = deg;
        let theta3 = theta1 + theta2;
        this.rotation += deg;
        if (this.rotation <= -180) {
            this.rotation += 360;
        }
        if (this.rotation > 180) {
            this.rotation -= 360;
        }
        if (!this.in_air) {
            this.move_by( STICK_HEIGHT * (Math.sin(theta3 / 180.0 * Math.PI) - Math.sin(theta1 / 180.0 * Math.PI)),
                          -STICK_HEIGHT * (Math.cos(theta3 / 180.0 * Math.PI) - Math.cos(theta1 / 180.0 * Math.PI)));
        }
    }

    get_base_point() {
        return {x: this.x - STICK_HEIGHT * Math.sin(this.rotation / 180 * Math.PI),
                y: this.y + STICK_HEIGHT * Math.cos(this.rotation / 180 * Math.PI)}
    }

    get_head_point() {
        return {x: this.x + STICK_HEIGHT * Math.sin(this.rotation / 180 * Math.PI),
                y: this.y - STICK_HEIGHT * Math.cos(this.rotation / 180 * Math.PI)}
    }

    move_to(x, y) {
        this.x = x;
        this.y = y;
    }

    move_by(dx, dy) {
        this.move_to(this.x + dx, this.y + dy);
    }
}

class Obstacle {
    constructor(x, y, width, height, type = "block") {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.rotation = 0;
        this.sprite = new Image(8, 8);
        this.sprite.src = "assets/obstacle.png";
        if (type == "win") {
            this.interaction = "win";
            this.sprite.src = "assets/win_block.png";
        } else {
            this.interaction = "bounce"
            this.sprite.src = "assets/obstacle.png";
        }
    }

    point_intersects(x, y) {
        let width_intersects = x < this.x + this.width && x > this.x;
        let height_intersects = y < this.y + this.height && y > this.y;
        return width_intersects && height_intersects;
    }

    draw(offset) {
        ctx.drawImage(this.sprite, this.x - offset.x, this.y - offset.y, this.width, this.height);
    }
}

class Level {
    player_start = [0, 0];
    obstacles = [];
    constructor(jsonlvl = null) {
        this.player_start = jsonlvl["player_start"];
        for (let i = 0; i < jsonlvl["obstacles"].length; i++) {
            var dat = jsonlvl["obstacles"][i];
            this.obstacles.push(new Obstacle(dat[0], dat[1], dat[2], dat[3]));
        }
        for (let i = 0; i < jsonlvl["win_blocks"].length; i++) {
            var dat = jsonlvl["win_blocks"][i];
            this.obstacles.push(new Obstacle(dat[0], dat[1], dat[2], dat[3], "win"));
        }
    }
}

var level1 = new Level(
    {
        "player_start": [360, 240],
        "obstacles" : [
            [200, 300, 1000, 30],
            [500, 250, 50, 50],
            [800, 230, 50, 70],
            [1100, 210, 50, 90]
        ],
        "win_blocks": [
            [1200, 300, 200, 30]
        ]
    }
);

var level2 = new Level(
    {
        "player_start": [360, 240],
        "obstacles": [
            [200, 300, 300, 30],
            [400, 100, 100, 200],
            [50, 0, 100, 300],
            [500, 100, 300, 20],
            [500, 100, 300, 20],
            [800, 50, 100, 250],
        ],
        "win_blocks": [
            [800, 0, 100, 50, "win"]
        ]
    }
);

var level3 = new Level(
    {
        "player_start": [360, 240],
        "obstacles": [
            [200, 300, 300, 30],
            [200, -300, 30, 600],
            [470, -300, 30, 600],
        ],
        "win_blocks": [
            [200, -330, 300, 30]
        ]
    }
);

var level4 = new Level(
    {
        "player_start": [360, 240],
        "obstacles": [
            [200, 300, 500, 30],
            [700, -100, 30, 430],
            [300, -100, 200, 200]
        ],
        "win_blocks": [
            [300, -130, 200, 30]
        ]
    }
);

var level5 = new Level(
    {
        "player_start": [360, 240],
        "obstacles": [
            [200, 300, 1000, 30],
            [500, -500, 400, 550],
            [1200, -300, 30, 630]
        ],
        "win_blocks": [
            [-30, -30, 60, 60, "win"]
        ]
    }
);

class Chunk {
    constructor(x, y, num_obstacles) {
        this.x = x;
        this.y = y;
        this.obstacles = [];
        for (let i = 0; i < num_obstacles; i++) {
            this.push_random_obstacle();
        }
    }

    push_random_obstacle() {
        let p = Math.random();
            if (p < 0.5) {
                this.push_long_obstacle();
            } else if (p < 0.7) {
                this.push_tall_obstacle();
            } else {
                this.push_box_obstacle();
            }
    }

    push_long_obstacle() {
        let w = Math.floor((1 + Math.random()) * 1600 / 3);
        let h = Math.floor((1 + Math.random()) * 1000 / 20);
        let x = this.x * canvas.width + Math.floor(Math.random() * (canvas.width - w));
        let y = this.y * canvas.height + Math.floor(Math.random() * (canvas.height - h));
        
        let obs = new Obstacle(x, y, w, h);
        this.obstacles.push(obs);
    }
    push_tall_obstacle() {
        let w = Math.floor((1 + Math.random()) * 1600 / 20);
        let h = Math.floor((1 + Math.random()) * 1000 / 4);
        let x = this.x * canvas.width + Math.floor(Math.random() * (canvas.width - w));
        let y = this.y * canvas.height + Math.floor(Math.random() * (canvas.height - h));
        
        let obs = new Obstacle(x, y, w, h);
        this.obstacles.push(obs);
    }
    push_box_obstacle() {
        let w = Math.floor((1 + Math.random()) * 1600 / 10);
        let x = this.x * canvas.width + Math.floor(Math.random() * (canvas.width - w));
        let y = this.y * canvas.height + Math.floor(Math.random() * (canvas.height - w));
        
        let obs = new Obstacle(x, y, w, w);
        this.obstacles.push(obs);
    }
    
}

class Menu {
    constructor(btns) {
        this.buttons = btns;
    }

    draw() {
        for (let i = 0; i < this.buttons.length; i++)
            this.buttons[i].draw();
    }
}

class Button {
    constructor(x, y, w, h, txt) {
        this.sprite = new Image(8, 8);
        this.sprite.src = "assets/obstacle.png";
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
        this.txt = txt;
    }

    draw() {
        // Draw background
        ctx.drawImage(this.sprite, this.x, this.y, this.width, this.height);

        // Draw text
        let fontsize = 32;
        ctx.fillStyle = "white";
        ctx.font = fontsize.toString() + "px Courier New";
        let txtw = this.txt.size * 2/3;
        let txth = fontsize;
        ctx.fillText(this.txt, this.x + this.width/2 - txtw/2, this.y + this.height/2 - txth/2);
    }
}

main_menu = new Menu([
    new Button(100, 100, 50, 50, "1"),
    new Button(200, 100, 50, 50, "2"),
]);

class Game {
    constructor() {
        this.run_state = "menu";
        this.pogo_dude = new PogoDude(0, 0);
        this.input = {
            left: false,
            right: false,
            jump: false
        };
    }

    resize_window() {
        ctx.canvas.width  = window.innerWidth;
        ctx.canvas.height = window.innerHeight;
    }

    load_level(lvl) {
        if (!lvl)
            return;
        this.level = lvl;
        this.pogo_dude.reset(   this.level.player_start[0],
                                this.level.player_start[1]);
        this.obstacles = this.level.obstacles;
    }

    restart() {
        this.infinite_generation = !this.level;
        this.run_state = "running";
        if (this.level) {
            this.pogo_dude.reset(   this.level.player_start[0],
                                    this.level.player_start[1]);
        }
        
        // this.generated_chunks = [];
        // this.obstacles = [];
        // if (!this.infinite_generation) {
        //     this.obstacles = world;
        // } else {
        //     this.generate_chunk(0, 0, 0);
        // }
        this.clock = 0;
    }

    generate_chunk(chunk_x, chunk_y, num_obstacles) {
        if (chunk_x + "," + chunk_y in this.generated_chunks) {
            return;
        }
        console.log("generating chunk... %i %i", chunk_x, chunk_y);
        this.generated_chunks[chunk_x + "," + chunk_y] = new Chunk(chunk_x, chunk_y, num_obstacles);        
    }

    step_game(dt) {
        this.clock += dt;
        let collision = false;

        let spring_pt = this.pogo_dude.get_base_point();
        let head_pt = this.pogo_dude.get_head_point();

        if (this.infinite_generation) {
            let offset_vecs = [];
            for (let a = -RENDER_DIST; a <= RENDER_DIST; a++){
                for (let b = -RENDER_DIST; b <= RENDER_DIST; b++){
                    offset_vecs.push([a, b]);
                }
            }
            this.obstacles = [];
            for (let i = 0; i < offset_vecs.length; i++) {
                let chunk_x = Math.floor(this.pogo_dude.x / canvas.width) + offset_vecs[i][0];
                let chunk_y = Math.floor(this.pogo_dude.y / canvas.width) + offset_vecs[i][1];
                
                this.generate_chunk(chunk_x, chunk_y, OBSTACLES_PER_CHUNK);

                this.obstacles = this.obstacles.concat(this.generated_chunks[chunk_x + "," + chunk_y].obstacles);
            }
        } else {
            if (this.pogo_dude.y > 1000) {
                this.run_state = "worldborder";
            }
        }

        for (let i = 0; i < this.obstacles.length; i++) {
            if (this.obstacles[i].point_intersects(spring_pt.x, spring_pt.y)) {
                if (this.obstacles[i].interaction == "win") {
                    this.run_state = "win";
                    break;
                } else {
                    collision = true;
                }
            }
            if (this.obstacles[i].point_intersects(head_pt.x, head_pt.y)) {
                if (this.obstacles[i].interaction == "win") {
                    this.run_state = "win";
                    break;
                } else {
                    this.run_state = "bonk";
                }
                break;
            }
        }

        this.pogo_dude.update(this.input, collision, dt);
    }

    check_reset() {
        if (this.input.jump) {
            if (this.infinite_generation)
                this.restart();
            else
                this.restart(this.obstacles);
        }
    }

    update(dt) {
        switch (this.run_state) {
            case "running":
                this.step_game(dt);
                break;
            case "bonk": case "worldborder": case "win":
                this.check_reset();
        }
    }

    draw_bonk_text() {
        // display bonk failure
        ctx.fillStyle = "white";
        ctx.font = "32px Courier New";
        ctx.fillText("You Bonked your head", canvas.width/2 - 200, canvas.height/2 - 20);
        ctx.font = "20px Courier New";
        ctx.fillText("Press Space to try again", canvas.width/2 - 150, canvas.height/2 + 20);
    }

    draw_oob_text() {
        // display fall out of world failure
        ctx.fillStyle = "white";
        ctx.font = "32px Courier New";
        ctx.fillText("You fell out of the world", canvas.width/2 - 240, canvas.height/2 - 20);
        ctx.font = "20px Courier New";
        ctx.fillText("Press Space to try again", canvas.width/2 - 150, canvas.height/2 + 20);
    }

    draw_win_text() {
        // display win message
        ctx.fillStyle = "white";
        ctx.font = "32px Courier New";
        ctx.fillText("Yay you made it", canvas.width/2 - 160, canvas.height/2 - 20);
        ctx.font = "20px Courier New";
        ctx.fillText("Nice job", canvas.width/2 - 80, canvas.height/2 + 20);
    }

    draw_game_objs() {
        let offset = {x: this.pogo_dude.x - canvas.width / 2, y: this.pogo_dude.y - canvas.height / 2};
        for (let i = 0; i < this.obstacles.length; i++) {
            this.obstacles[i].draw(offset);
        }
        this.draw_clock();
    }

    draw_player() {
        this.pogo_dude.draw();
    }

    draw_in_play() {
        this.draw_game_objs();
        this.draw_player();
    }

    draw_clock() {
        ctx.fillStyle = "white";
        ctx.font = "32px Helvetica";
        ctx.fillText(parseFloat(this.clock/1000).toFixed(2), 30, 50);
    }

    draw_menu() {
        main_menu.draw();
    }

    draw() {
        this.resize_window();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#55BBFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        switch (this.run_state) {
            case "running":
                this.draw_in_play();
                break;
            case "bonk":
                this.draw_in_play();
                this.draw_bonk_text();
                break;
            case "worldborder":
                this.draw_in_play();
                this.draw_oob_text();
                break;
            case "win":
                this.draw_in_play();
                this.draw_win_text();
                break;
            case "menu":
                this.draw_menu();
                break;
        }
    }
}

let game = new Game();

get_time = function() {
    let d = new Date();
    let t = d.getTime();
    return t;
}

let last_time = get_time();
let current_time = get_time();
setInterval(function() {
    current_time = get_time();
    game.update(current_time - last_time);
    game.draw();
    last_time = current_time;
}, 15);

document.addEventListener("keydown", function(k) {
    switch(k.keyCode) {
        case 37:
            game.input.left = true;
            break;
        case 39:
            game.input.right = true;
            break;
        case 32:
            game.input.jump = true;
            if (game.run_state != "running") {
                game.restart();
            }
            break;
        case 49:
            if (game.run_state != "running") {
                game.load_level(level1);
            }
            break;
        case 50:
            if (game.run_state != "running") {
                game.load_level(level2);
            }
            break;
        case 51:
            if (game.run_state != "running") {
                game.load_level(level3);
            }
            break;
        case 52:
            if (game.run_state != "running") {
                game.load_level(level4);
            }
            break;
        case 53:
            if (game.run_state != "running") {
                game.load_level(level5);
            }
            break;
        case 54:
            if (game.run_state != "running") {
                game.load_level();
            }
            break;
        case 55:
            game.restart();
            break;
        default:
    }
});

document.addEventListener("keyup", function(k) {
    switch(k.keyCode) {
        case 37:
            game.input.left = false;
            break;
        case 39:
            game.input.right = false;
            break;
        case 32:
            game.input.jump = false;
            break;
    }
});