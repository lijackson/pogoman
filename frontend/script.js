let canvas = document.getElementById("paper");
let ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
ctx.mozImageSmoothingEnabled = false;

// Milliseconds Per (physics game-)tick
const MSPT = 5;
// This is about 60fps. Faster monitors or browsers might be different but I'm not checking for that
const EXPECTED_FRAMERATE = 17;
// this adjusts for different FPS to make movement consistent
const FMOD = MSPT / 15;

const STICK_HEIGHT = 24;
const JUMP_STRENGTH = 7;

// Color map for obstacle types: "<type>": [<regular color>, <highlighted color>]
const OBST_COLORS = {
    "obstacle": ["#000000", "#333333"],
    "win":      ["#008800", "#33AA33"],
};

function obj_AABB(obs1, obs2) {
    return coord_AABB(obs1.x, obs1.y, obs1.width, obs1.height, obs2.x, obs2.y, obs2.width, obs2.height);
}

function coord_AABB(x1, y1, w1, h1, x2, y2, w2, h2) {
    let x_overlap = x1 < x2 + w2 && x1 + w1 > x2;
    let y_overlap = y1 < y2 + h2 && y1 + h1 > y2;
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

    update(hit_ground) {

        let momentum = JUMP_STRENGTH;

        // hit ground
        if (/*touching ground?*/ hit_ground) {
            // rotation should be dampened significantly on landing
            if (this.in_air) {
                this.drot *= 0.25;
                this.y -= this.dy / 2;
                this.x -= this.dx / 2;
                momentum = Math.max(JUMP_STRENGTH, Math.sqrt(this.dy ** 2 + this.dx ** 2) * 0.95);
                if (InputHandler.down)
                    momentum *= 0.85;
            }

            this.in_air = false;
            this.dy = 0;
            this.dx = 0;
        } else {
            this.in_air = true;
        }

        // acceleration
        this.x += this.dx * FMOD;
        this.y += this.dy * FMOD;
        this.rotate(this.drot * FMOD);
        if (this.in_air) {
            this.dy += 0.15 * FMOD;
        } else {
            this.drot += 0.15 * Math.sin(this.rotation / 180 * Math.PI);
        }

        // jumping
        if (!this.in_air) {
            this.in_air = true;
            this.dx = momentum * Math.sin(this.rotation / 180 * Math.PI);
            this.dy = -momentum *  Math.cos(this.rotation / 180 * Math.PI);
            this.x += 2* this.dx * FMOD;
            this.y += 2* this.dy * FMOD;

            this.drot += 0.75 * this.dx;
        }
        
        // lean input
        if (InputHandler.left)
            this.drot -= (0.2 + 0.1 * (this.drot>0)) * FMOD;
        
        if (InputHandler.right)
            this.drot += (0.2 + 0.1 * (this.drot<0)) * FMOD;
        

        // Control the spin (dont let it get too crazy)
        const drot_decay = Math.pow(0.99, FMOD);
        this.drot *= drot_decay;
        if (this.drot > 4)
            this.drot = 4;
        
        if (this.drot < -4)
            this.drot = -4;
    }

    draw(offset) {
        ctx.save();
        ctx.translate(this.x - offset.x, this.y - offset.y);
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
        this.x += dx;
        this.y += dy;
    }
}

class Obstacle {
    static next_id = 0;

    constructor(x, y, width, height, type = "obstacle") {
        this.x = x;
        this.y = y;
        this.id = Obstacle.next_id++;
        this.width = width;
        this.height = height;
        this.rotation = 0;
        this.type = type;
    }

    point_intersects(x, y) {
        let width_intersects = x < this.x + this.width && x > this.x;
        let height_intersects = y < this.y + this.height && y > this.y;
        return width_intersects && height_intersects;
    }

    change_dims(new_width, new_height) {
        this.width = new_width;
        this.height = new_height;
    }

    move_to(new_x, new_y) {
        this.x = new_x;
        this.y = new_y;
    }

    move_by(new_x, new_y) {
        this.x += new_x;
        this.y += new_y;
    }

    validate() {
        if (this.width < 0) {
            this.x = this.x + this.width;
            this.width = -this.width;
        }
        if (this.height < 0) {
            this.y = this.y + this.height;
            this.height = -this.height;
        }
    }

    draw(offset, highlight=false) {
        ctx.fillStyle = OBST_COLORS[this.type][+highlight];
        ctx.fillRect(   this.x - offset.x, this.y - offset.y,
                        this.width, this.height);
    }
}

class Level {
    
    worldborder = 50;
    player_start = [0, 0]
    obstacles = {};
    name = "unnamed_level";

    constructor(jsonlvl = {}) {
        this.worldborder = 0;

        if ("name" in jsonlvl){
            this.name = jsonlvl["name"];
        }

        if ("player_start" in jsonlvl){
            this.player_start = jsonlvl["player_start"];
            this.worldborder = this.player_start[1];
        }

        if ("obstacles" in jsonlvl) {
            for (let i = 0; i < jsonlvl["obstacles"].length; i++) {
                var dat = jsonlvl["obstacles"][i];
                var new_obst = new Obstacle(dat[0], dat[1], dat[2], dat[3]);
                this.obstacles[new_obst.id] = new_obst;
                this.worldborder = Math.max(this.worldborder, dat[1] + dat[3])
            }
        }

        if ("win_blocks" in jsonlvl) {
            for (let i = 0; i < jsonlvl["win_blocks"].length; i++) {
                var dat = jsonlvl["win_blocks"][i];
                var new_obst = new Obstacle(dat[0], dat[1], dat[2], dat[3], "win");
                this.obstacles[new_obst.id] = new_obst;
                this.worldborder = Math.max(this.worldborder, dat[1] + dat[3])
            }
        }
        this.worldborder += 50;
    }

    insert_obst(obst) {
        this.obstacles[obst.id] = obst;
        this.worldborder = Math.max(this.worldborder, obst.y + obst.height)
    }

    remove_by_id(id) {
        if (id in this.obstacles)
            delete this.obstacles[id];
    }

    set_player_start(x, y) {
        this.player_start = [x, y];
    }

    json() {
        var obstacles = [];
        var win_blocks = [];
        for (let id in this.obstacles) {
            // Unwrap obstacle
            let x = this.obstacles[id].x;
            let y = this.obstacles[id].y;
            let width = this.obstacles[id].width;
            let height = this.obstacles[id].height;

            if (this.obstacles[id].type == "obstacle")
                obstacles.push([x, y, width, height]);
            else if (this.obstacles[id].type == "win")
                win_blocks.push([x, y, width, height]);
        }

        var obj = {
            "player_start": this.player_start,
            "obstacles": obstacles,
            "win_blocks": win_blocks
        }

        console.log(JSON.stringify(obj));
        return obj;
    }
}

function play_lvl_fn(lvl) {
    return function() {
        StateHandler.state = "game";
        Game.load_level(lvl);
        Game.restart();
    };
};

class Menu {
    buttons = [];
    is_visible = true;

    constructor(btns) {
        this.buttons = btns;
    }

    draw() {
        if (!this.is_visible)
            return;

        // Draw Buttons
        for (let i = 0; i < this.buttons.length; i++) {
            this.buttons[i].exist();
            this.buttons[i].draw();
        }
    }

    // Check if the given coords overlap any button contained in the menu
    on_button(coords) {
        for (let i = 0; i < this.buttons.length; i++) {
            if (this.buttons[i].point_intersects(coords[0], coords[1]))
                return true;
        }
        return false;
    }
}

class Button {
    constructor(x, y, w, h, txt, on_click = function(){}) {
        this.img = new Image(8, 8);
        this.img.src = "assets/obstacle.png";

        this.hover_img = new Image(8, 8);
        this.hover_img.src = "assets/btn_hover.png";

        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
        this.txt = txt;

        this.on_click = on_click;
    }

    point_intersects(x, y) {
        let width_intersects = x < this.x + this.width && x > this.x;
        let height_intersects = y < this.y + this.height && y > this.y;
        return width_intersects && height_intersects;
    }

    exist() {
        this.hovered = this.point_intersects(InputHandler.mouseX, InputHandler.mouseY)
        if (this.hovered && InputHandler.click)
            this.on_click();
    }

    draw() {
        // Set background
        var img = this.img;
        if (this.hovered)
            img = this.hover_img;
        
        ctx.drawImage(img, this.x, this.y, this.width, this.height);

        // Draw text
        var fontsize = 32;
        ctx.fillStyle = "white";
        ctx.font = fontsize.toString() + "px Courier New";
        var txtw = this.txt.length * fontsize * 0.6;
        var txth = fontsize * 0.6;
        ctx.fillText(this.txt, this.x + this.width/2 - txtw/2, this.y + this.height/2 + txth/2);
    }
}

// TODO: idk? put this somewhere neater?
var level1 = new Level(level1json);
var level2 = new Level(level2json);
var level3 = new Level(level3json);
var level4 = new Level(level4json);
var level5 = new Level(level5json);
var level6 = new Level(level6json);
var level7 = new Level(level7json);

// These are the old levels, they will be removed at some point
var oldlevel1 = new Level({"player_start":[360,240],"obstacles":[[200,300,1000,30],[500,250,50,50],[800,230,50,70],[1100,210,50,90]],"win_blocks":[[1200,300,200,30]]});
var oldlevel2 = new Level({"player_start":[360,240],"obstacles":[[200,300,300,30],[400,100,100,200],[50,0,100,300],[500,100,300,20],[500,100,300,20],[800,50,100,250],],"win_blocks":[[800,0,100,50,"win"]]});
var oldlevel3 = new Level({"player_start":[360,240],"obstacles":[[200,300,300,30],[200,-300,30,600],[470,-300,30,600],],"win_blocks":[[200,-330,300,30]]});
var oldlevel4 = new Level({"player_start":[360,240],"obstacles":[[200,300,500,30],[700,-100,30,430],[300,-100,200,200]],"win_blocks":[[300,-130,200,30]]});
var oldlevel5 = new Level({"player_start":[360,240],"obstacles":[[200,300,1000,30],[500,-500,400,550],[1200,-300,30,630]],"win_blocks":[[-30,-30,60,60,"win"]]});
var oldlevel6 = new Level({"player_start":[0,0],"obstacles":[[-50,100,300,30],[400,-200,100,500],[-50,120,100,400],[400,500,400,30],[1100,0,100,500]],"win_blocks":[[1000,0,60,60,"win"]]});

class MainMenu {
    static buttons = [
        // Levels
        new Button(100, 100, 80, 80, "1", play_lvl_fn(level1)),
        new Button(200, 100, 80, 80, "2", play_lvl_fn(level2)),
        new Button(300, 100, 80, 80, "3", play_lvl_fn(level3)),
        new Button(400, 100, 80, 80, "4", play_lvl_fn(level4)),
        new Button(500, 100, 80, 80, "5", play_lvl_fn(level5)),
        new Button(600, 100, 80, 80, "6", play_lvl_fn(level6)),
        new Button(700, 100, 80, 80, "7", play_lvl_fn(level7)),

        // Old levels
        new Button(100, 200, 80, 80, "o1", play_lvl_fn(oldlevel1)),
        new Button(200, 200, 80, 80, "o2", play_lvl_fn(oldlevel2)),
        new Button(300, 200, 80, 80, "o3", play_lvl_fn(oldlevel3)),
        new Button(400, 200, 80, 80, "o4", play_lvl_fn(oldlevel4)),
        new Button(500, 200, 80, 80, "o5", play_lvl_fn(oldlevel5)),
        new Button(600, 200, 80, 80, "o6", play_lvl_fn(oldlevel6)),
    
        // Level editor
        new Button(100, 800, 1000, 80, "Level Editor", function() {
            StateHandler.state = "lvledit";
        })
    ];

    static animframe() {
        // TODO: this is super hacky, please fix.
        // The problem is that dynamically changing menu layout is gonna need a lot more
        // consideration of the screen state and how to "position" the buttons dynamically
        MainMenu.buttons[13].y = ctx.canvas.height-180;

        MainMenu.draw();
        
        StateHandler.handle();
    }

    static draw() {
        // Draw Background
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#55BBFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Buttons
        for (let i = 0; i < MainMenu.buttons.length; i++) {
            MainMenu.buttons[i].exist();
            MainMenu.buttons[i].draw();
        }
    }
}

class Timer {
    static clocktxt = "0.00";
    static lastclock = 0;

    static draw(force = false) {
        let t = Game.clock;
        
        Timer.clocktxt = (t/1000).toFixed(2);
        Timer.lastclock = t;
        
        ctx.fillStyle = "white";
        ctx.font = "32px Helvetica";
        ctx.fillText(Timer.clocktxt, 30, 50);
    }
}

class DBHandler {
    static leaderboards = {};
    static logged_in_username = null;

    static async update_leaderboard(lvl_id) {
        fetch(`/api/records/${lvl_id}`).then(function(res) {
            DBHandler.leaderboards[lvl_id] = res;
            console.log(DBHandler.leaderboards[lvl_id]);
        });
    }

    static async post_to_leaderboard(lvl_id, time, replay={}) {
        if (DBHandler.logged_in_username == null)
            return;
        
        // await DBHandler.update_leaderboard(lvl_id);
        
        var res = await fetch(`/api/records/submit`, {
            method: 'POST',
            headers: {
                Accept: 'application.json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                level_id: lvl_id,
                username: DBHandler.logged_in_username,
                time: time
            })
        });

        console.log(`finished posting new time, got result: ${res} from server`);

        await DBHandler.update_leaderboard(lvl_id);
    }
}

class Leaderboard {

    static level = "level1"

    static draw(x, y, width, height) {
        const border = 10;
        const rh = 60; // Record height
        ctx.fillStyle = "#444444";
        ctx.fillRect(x, y, width, height);
        if (!(Leaderboard.level in DBHandler.leaderboards)) 
            DBHandler.leaderboards[Leaderboard.level] = [];
        for (var i = 0; i < Math.min(10, DBHandler.leaderboards[Leaderboard.level].length); i++) {
            this.draw_record(x+border, y+(rh+border)*i+border, width-border*2, rh, 
                DBHandler.leaderboards[Leaderboard.level]["username"], DBHandler.leaderboards[Leaderboard.level]["time"]);
        }
    }

    static draw_record(x, y, width, height, name, time) {
        ctx.fillStyle = "#CC9900";
        ctx.fillRect(x, y, width, height);
        var time_txt = (time).toFixed(2);
        
        ctx.fillStyle = "white";
        ctx.font = "24px Helvetica";
        ctx.fillText(name, x, y);
        ctx.fillText(time_txt, x+width-100, y);
    }
}

class StateHandler {
    static last_state = "none"
    static state = "mainmenu";
    static just_changed_state = true;
    static handle() {

        // The ESC key should always return to main menu
        // It is the only input that should override the described input handling of the animation frames
        if (InputHandler.esc)
            StateHandler.state = "mainmenu";

        StateHandler.just_changed_state = false;
        if (StateHandler.state != StateHandler.last_state) {
            StateHandler.last_state = StateHandler.state;
            StateHandler.just_changed_state = true;
        }

        const next_frame_from_state = {
            "mainmenu": MainMenu.animframe,
            "game": Game.animframe,
            "bonk": PauseScreen.animframe,
            "worldborder": PauseScreen.animframe,
            "win": PauseScreen.animframe,
            "lvledit": LevelEditor.animframe,
        };
        if (StateHandler.state != "lvledit")
            LevelEditor.is_open = false;
        var next_frame = next_frame_from_state[StateHandler.state];

        window.requestAnimationFrame(next_frame);
    }
}

class LevelEditor {

    static level = new Level({"player_start": [0, 0]});
    static pogo_dude = new PogoDude(0, 0);
    static offset = {x: -canvas.width/2, y: -canvas.height/2};
    static last_input = {
        clicked: false,
        click_pos: null,
        left: false,
        right: false,
        up: false,
        down: false,
    };
    static obstacle_creator = null;
    static selection_window = null;
    static last_registered_mouse_position = null;
    static menu = new Menu([
        new Button(10, 10, 200, 50, "obstacle", function(){
            LevelEditor.mode = "obstacle";
        }),
        new Button(10, 70, 200, 50, "winblock", function(){
            LevelEditor.mode = "win";
        }),
        new Button(10, 130, 200, 50, "drag", function(){
            LevelEditor.mode = "drag";
        }),
        new Button(10, 190, 200, 50, "select", function(){
            LevelEditor.mode = "select";
        }),
        new Button(10, 250, 200, 50, "reset", LevelEditor.reset),
        new Button(10, 310, 200, 50, "play", function() {
            StateHandler.state = "game";
            Game.load_level(LevelEditor.level);
            Game.restart();
        }),
    ]);

    static on_open() {
        LevelEditor.offset = {x: -canvas.width/2, y: -canvas.height/2};
        LevelEditor.last_input.clicked = false;
        LevelEditor.obstacle_creator = null;
        LevelEditor.selection_window = null
        LevelEditor.selected_objs = new Set();
        LevelEditor.is_open = true;
        LevelEditor.mode = "obstacle";
    }

    static get_selected_objects() {
        var selected = new Set();
        if (LevelEditor.selection_window == null)
            return selected;

        // Fix negative width and height for collision detection
        var selected_area = {x: LevelEditor.selection_window.x,
            y: LevelEditor.selection_window.y,
            width: LevelEditor.selection_window.width,
            height: LevelEditor.selection_window.height};
        if (selected_area.width < 0) {
            selected_area.x += selected_area.width;
            selected_area.width = - selected_area.width;
        }
        if (selected_area.height < 0) {
            selected_area.y += selected_area.height;
            selected_area.height = - selected_area.height;
        }

        // Calculate which obstacles are overlapped with the selection area
        for (let id in LevelEditor.level.obstacles) {
            if (obj_AABB(selected_area, LevelEditor.level.obstacles[id])) {
                selected.add(id);
            }
        }

        return selected;
    }

    static reset() {
        LevelEditor.level.json();
        LevelEditor.level = new Level({"player_start": [0, 0]});
        LevelEditor.pogo_dude.move_to(0, 0);
        LevelEditor.on_open();
    }

    static interacting_with_menu() {
        return LevelEditor.menu.is_visible && (
                LevelEditor.menu.on_button([InputHandler.mouseX, InputHandler.mouseY])) || (
                 LevelEditor.menu.on_button(InputHandler.start_click_coords ||
                 InputHandler.start_click_coords != null));
    }

    static animframe() {
        if (!LevelEditor.is_open)
            LevelEditor.on_open();
        

        var rel_x = InputHandler.mouseX + LevelEditor.offset.x;
        var rel_y = InputHandler.mouseY + LevelEditor.offset.y;

        var just = {
            clicked: !LevelEditor.last_input.clicked && InputHandler.click,
            unclicked: LevelEditor.last_input.clicked && !InputHandler.click,
            up: !LevelEditor.last_input.up && InputHandler.up,
            down: !LevelEditor.last_input.down && InputHandler.down,
            left: !LevelEditor.last_input.left && InputHandler.left,
            right: !LevelEditor.last_input.right && InputHandler.right,
        };
        
        LevelEditor.last_input.clicked = InputHandler.click;
        LevelEditor.last_input.up = InputHandler.up;
        LevelEditor.last_input.down = InputHandler.down;
        LevelEditor.last_input.left = InputHandler.left;
        LevelEditor.last_input.right = InputHandler.right;

        if (!LevelEditor.interacting_with_menu()) {
            // Single pixel adjustment for all selected obstacles
            let px_dx = just.right - just.left;
            let px_dy = just.down - just.up;
            if (px_dx != 0 || px_dy != 0 || InputHandler.eq_del) {
                for (let id of LevelEditor.selected_objs) {
                    LevelEditor.level.obstacles[id].move_by(px_dx, px_dy);
                    if (InputHandler.eq_del) {
                        LevelEditor.level.remove_by_id(id);
                        LevelEditor.selected_objs.delete(id);
                    }
                }
            }
            // Check for deleting selected objects 


            switch (LevelEditor.mode) {
            case "obstacle": case "win":
                if (InputHandler.click) {
                    if (just.clicked)
                        LevelEditor.obstacle_creator = new Obstacle(rel_x, rel_y, 0, 0, LevelEditor.mode);
                    
                    let new_width = rel_x - LevelEditor.obstacle_creator.x;
                    let new_height = rel_y - LevelEditor.obstacle_creator.y;
                    LevelEditor.obstacle_creator.change_dims(new_width, new_height);
                }
                // When click is released and there is an obstacle that can be created
                else if (just.unclicked && LevelEditor.obstacle_creator) {
                    // Dont add obstacles that have 0 area
                    if (LevelEditor.obstacle_creator.width != 0 && LevelEditor.obstacle_creator.height != 0) {
                        LevelEditor.obstacle_creator.validate();
                        LevelEditor.level.insert_obst(LevelEditor.obstacle_creator);
                    }

                    LevelEditor.obstacle_creator = null;
                }

                break;
            case "drag":
                if (InputHandler.click) {
                    if (LevelEditor.last_input.click_pos == null)
                        LevelEditor.last_input.click_pos = [InputHandler.mouseX, InputHandler.mouseY];

                    var dx = LevelEditor.last_input.click_pos[0] - InputHandler.mouseX;
                    var dy = LevelEditor.last_input.click_pos[1] - InputHandler.mouseY;

                    // If anything is selected, move it
                    if (LevelEditor.selected_objs.size > 0) {
                        for (let id in LevelEditor.level.obstacles) {
                            if (LevelEditor.selected_objs.has(id))
                                LevelEditor.level.obstacles[id].move_by(-dx, -dy);
                        }
                    // Otherwise move the whole screen
                    } else {
                        LevelEditor.offset.x += dx;
                        LevelEditor.offset.y += dy;
                    }
                    
                    LevelEditor.last_input.click_pos = [InputHandler.mouseX, InputHandler.mouseY];
                } else {
                    LevelEditor.last_input.click_pos = null;
                }
                break;
            case "select":
                // Handle drawing the selection window
                if (InputHandler.click) {
                    if (just.clicked) {
                        LevelEditor.selection_window = {x: rel_x, y: rel_y, width: 0, height: 0};
                    } else {
                        if (LevelEditor.selection_window == null)
                            break;
                        let new_width = rel_x - LevelEditor.selection_window.x;
                        let new_height = rel_y - LevelEditor.selection_window.y;

                        LevelEditor.selection_window.width = new_width;
                        LevelEditor.selection_window.height = new_height;
                        LevelEditor.selected_objs = LevelEditor.get_selected_objects();
                    }
                }
                // When click is released and there is a selection window
                else if (just.unclicked && LevelEditor.selection_window) {
                    LevelEditor.selection_window = null;
                }
                break;
            }
        }

        LevelEditor.menu.is_visible =   LevelEditor.selection_window == null &&
                                        LevelEditor.obstacle_creator == null &&
                                        LevelEditor.last_input.click_pos == null;

        LevelEditor.draw();

        StateHandler.handle();
    }

    static draw_selection_window() {
        if (LevelEditor.selection_window == null)
            return;
        
        ctx.beginPath();
        ctx.strokeStyle = 'white';
        ctx.rect(this.selection_window.x - LevelEditor.offset.x, this.selection_window.y - LevelEditor.offset.y,
                    this.selection_window.width, this.selection_window.height);
        ctx.stroke();
    }

    static draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#55BBFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();

        for (let id in LevelEditor.level.obstacles) {
            LevelEditor.level.obstacles[id].draw(LevelEditor.offset, LevelEditor.selected_objs.has(id));
        }
        
        if (LevelEditor.obstacle_creator)
            LevelEditor.obstacle_creator.draw(LevelEditor.offset);

        LevelEditor.pogo_dude.draw(LevelEditor.offset);

        LevelEditor.draw_selection_window();
        
        this.menu.draw();
    }
}

class PauseScreen {

    static pause_text_of = {
        "bonk" : ["You Bonked your head", "Press Space to try again"],
        "worldborder" : ["You fell out of the world", "Press Space to try again"],
        "win" : ["Yay you made it", "Nice job"],
        "pause" : ["Game paused", "Press space to resume"]
    }

    static animframe() {
        Game.draw_game_state();
        Game.draw_clock(true);

        var pausetxt = PauseScreen.pause_text_of[StateHandler.state];
        PauseScreen.draw(pausetxt[0], pausetxt[1]);

        if (InputHandler.space) {
            StateHandler.state = "game";
            Game.restart();
        }

        if (StateHandler.state == "win" && DBHandler.logged_in_username != null) {
            if (StateHandler.just_changed_state) {
                console.log(`posting new time: ${Game.phystime} on level: ${Game.level.name}`);
                Leaderboard.level = Game.level.name;
                DBHandler.post_to_leaderboard(Leaderboard.level, Game.clock)
                DBHandler.update_leaderboard(Leaderboard.level);
            }
            Leaderboard.draw(50,50,400,600);
        }

        StateHandler.handle();
    }

    static draw(main_text, sub_text) {
        ctx.fillStyle = "white";
        ctx.font = "32px Courier New";
        ctx.fillText(main_text, canvas.width/2 - main_text.length * 10, canvas.height/2 - 20);
        ctx.font = "20px Courier New";
        ctx.fillText(sub_text, canvas.width/2 - sub_text.length * 6.25, canvas.height/2 + 20);
    }
}

class Game {
    static pogo_dude = new PogoDude(0, 0);
    static offset = {x: -canvas.width / 2, y: -canvas.height / 2};
    static level = new Level();
    static phystime = 0;
    static clock = 0;
    static worldborder = 0;

    static load_level(lvl) {
        if (!lvl)
            return;
        Game.level = lvl;
        Game.restart();
    }

    static restart() {
        if (Game.level) {
            Game.pogo_dude.reset(Game.level.player_start[0],
                                 Game.level.player_start[1]);
        }
        
        Game.phystime = get_time();
        Game.clock = 0;
    }

    static animframe() {
        var numticks = 0;
        var now = get_time();
        // Run physics to catch up to realtime
        while (Game.phystime < now && StateHandler.state == "game") {
            Game.phystick();
            numticks++;
        }
        // Check if we were lagging by over 3x expected frames
        if (numticks >= EXPECTED_FRAMERATE * 3 / MSPT)
            console.log(numticks, " ticks (calculated in ", get_time() - now , "ms)\nThe browser likely implements the clock display very poorly (Firefox is known to have this issue).\nThis will cause jittery in animation.");
    
        Game.draw();
        
        // Loop
        StateHandler.handle();
    }

    static phystick() {
        Game.clock += MSPT;
        Game.phystime += MSPT;
        let collision = false;

        let spring_pt = Game.pogo_dude.get_base_point();
        let head_pt = Game.pogo_dude.get_head_point();
        
        if (Game.pogo_dude.y > Game.level.worldborder) {
            StateHandler.state = "worldborder";
        }

        for (let id in Game.level.obstacles) {
            if (Game.level.obstacles[id].point_intersects(spring_pt.x, spring_pt.y)) {
                if (Game.level.obstacles[id].type == "win") {
                    StateHandler.state = "win";
                    break;
                } else {
                    collision = true;
                }
            }
            if (Game.level.obstacles[id].point_intersects(head_pt.x, head_pt.y)) {
                if (Game.level.obstacles[id].type == "win") {
                    StateHandler.state = "win";
                } else {
                    StateHandler.state = "bonk";
                }
                break;
            }
        }

        Game.pogo_dude.update(collision);

        Game.offset = {x: Game.pogo_dude.x - canvas.width / 2, y: Game.pogo_dude.y - canvas.height / 2};
    }

    static draw_game_state() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#55BBFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let id in Game.level.obstacles) {
            Game.level.obstacles[id].draw(Game.offset);
        }
        Game.pogo_dude.draw(Game.offset);
    }
    
    static draw_clock(force=false) {
        Timer.draw(force);
    }
    
    static draw() {
        Game.draw_game_state();
        Game.draw_clock();
    }
}

class InputHandler {
    static left = false;
    static right = false;
    static up = false;
    static down = false;
    static space = false;
    static esc = false;
    static eq_del = false;
    static del = false;
    static back = false;
    static mouseX = 0;
    static mouseY = 0;
    static click = false;
    static start_click_coords = null;
}

var game = new Game();

function get_time() {
    let d = new Date();
    let t = d.getTime();
    return t;
}

document.addEventListener("keydown", function(k) {
    switch(k.keyCode) {
        case 37:
            InputHandler.left = true;
            break;
        case 38:
            InputHandler.up = true;
            break;
        case 39:
            InputHandler.right = true;
            break;
        case 40:
            InputHandler.down = true;
            break;
        case 32:
            InputHandler.space = true;
            break;
        case 27:
            InputHandler.esc = true;
            break;
        case 46:
            InputHandler.del = true;
            InputHandler.eq_del = true;
            break;
        case 8:
            InputHandler.back = true;
            InputHandler.eq_del = true;
            break;
        }
});

document.addEventListener("keyup", function(k) {
    switch(k.keyCode) {
        case 37:
            InputHandler.left = false;
            break;
        case 38:
            InputHandler.up = false;
            break;
        case 39:
            InputHandler.right = false;
            break;
        case 40:
            InputHandler.down = false;
            break;
        case 32:
            InputHandler.space = false;
            break;
        case 27:
            InputHandler.esc = false;
            break;
        case 46:
            InputHandler.del = false;
            InputHandler.eq_del = InputHandler.back;
            break;
        case 8:
            InputHandler.back = false;
            InputHandler.eq_del = InputHandler.del;
            break;
    }
});

document.addEventListener("mousemove", function(e) {
    InputHandler.mouseX = e.clientX;
    InputHandler.mouseY = e.clientY;
}); 

document.addEventListener("mousedown", function(e) {
    InputHandler.mouseX = e.clientX;
    InputHandler.mouseY = e.clientY;
    if (e.button == 0) {
        if (!InputHandler.click)
            InputHandler.start_click_coords = [e.clientX, e.clientY];
        InputHandler.click = true;
    }
}); 
document.addEventListener("mouseup", function(e) {
    InputHandler.mouseX = e.clientX;
    InputHandler.mouseY = e.clientY;
    if (e.button == 0) {
        InputHandler.click = false;
        InputHandler.start_click_coords = null;
    }
}); 

function resize_window() {
    ctx.canvas.width  = window.innerWidth;
    ctx.canvas.height = window.innerHeight;
}

window.addEventListener("resize", resize_window);
resize_window();

requestAnimationFrame(StateHandler.handle);