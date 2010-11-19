/****************************************************************
 * Horizons
 *
 * (c) 2010 Bobby Richter
 ****************************************************************/

/**********************************************************
 * VARS
 **********************************************************/

/*** FPS ***/
var FPS = 50;
var SPF = 1000/FPS;

/*** canvas & gl ***/
var main_canvas;
var main_canvas_ctx;
var gl;

/*** stats ***/
var stats_div = null;

/*** scene ***/
var scene;
var octree;

/*** level ***/
var current_level;
var levels = [];

/*** timer ***/
var timerMilliseconds;
var timerSeconds = 0;
var timerLastSeconds = 0;
var frameCounter = 0;

/*** game engine ***/
var game_engine;

/*** game object ***/

/*** physics ***/
var physics_world;

/*** testing ***/
var test_player_game_object;
var test_light;
var xp = 0;

/*** sockets ***/
var game_socket;

/*** descriptions ***/
var descriptions = [];
var test_description_1 = new ObjectDescription('test1');
var test_description_2 = new ObjectDescription('test2');
test_description_1.children = [{name:'test2',offset:[0,1]}];
descriptions['test1'] = test_description_1;
descriptions['test2'] = test_description_2;

/*** interval ***/
var main_loop_interval;

/**********************************************************
 * INIT
 **********************************************************/

/**
 * init_gl
 * Initialize gl & cubicvr
 *
 * @canvas: canvas to initialize for 3d
 **/
function init_gl(canvas) {
  gl = null;
  try {
    gl = canvas.getContext("experimental-webgl");
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  catch(e) {
    throw(e);
  } //try

  if (!gl) {
    alert("Error: Could not initialize WebGL. Make sure WebGL is enabled in your browser settings.");
    return;
  } //if

  CubicVR.core.init(gl,"core-shader-vs","core-shader-fs");

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
} //init_gl

/**
 * init_socket
 * Initialize WebSockets
 **/
function init_socket() {
  game_socket = new GameSocket();
} //init_socket


/**
 * document.ready
 * Entry point
 **/
jQuery(document).ready(function() {
  main_canvas = document.getElementById("main-canvas");
  main_canvas.width = window.innerWidth;
  main_canvas.height = window.innerHeight;
  init_gl(main_canvas);

  init_game_engine();
  init_graphics();
  init_physics();
  init_socket();

  load_level(0);

  //for testing - begin build player
  var box_material = new CubicVR.material("test");
  box_material.color = [1,0,0];
  var box_object = new CubicVR.object();
  CubicVR.genBoxObject(box_object, .5, box_material);
  box_object.calcNormals();
  box_object.triangulateQuads();
  box_object.compile();
  var scene_object = new CubicVR.sceneObject(box_object);
  scene_object.position = [0, 0, 0];
  scene.bindSceneObject(scene_object);

  var sd = new b2BoxDef();
	var bd = new b2BodyDef();
	bd.AddShape(sd);
	sd.density = 1.0;
  sd.restitution = 0.0;
	sd.friction = 1;
	sd.extents.Set(1, 1);
  bd.position.Set(0, 10);
  var body = physics_world.CreateBody(bd);

  var ic = new WindowInputComponent();
  var lc = new InputLogicComponent();

  test_player_game_object = new GameObject();
  test_player_game_object.attach_physics_component(body);
  test_player_game_object.attach_graphics_component(scene_object);
  test_player_game_object.attach_input_component(ic);
  test_player_game_object.attach_logic_component(lc);
  game_engine.add_game_object(test_player_game_object);
  //for testing - end build player

  start_main_loop();

  show_stats();
}); //document ready

/**********************************************************
 * STATS
 **********************************************************/

/**
 * show_stats
 * Shows the statistics window.
 **/
function show_stats() {
  if (stats_div === null) {
    jQuery("#main-stats").show();
    stats_div = document.getElementById("main-stats");
  } //if
} //show_stats

/**
 * hide_stats
 * Hides the statistics window.
 **/
function hide_stats() {
  jQuery("#main-stats").hide();
  stats_div = null;
} //hide_stats

/**********************************************************
 * GAME SOCKET
 **********************************************************/
/**
 * GameSocket
 * Send/Receives realtime data to/from server
 **/
function GameSocket() {
  this.current_player_id = -1;
  this.ready = false;
  this.response_id = 0;
  this.response_listeners = [];
  this.socket = new WebSocket("ws://localhost:9000/game");
  var that = this;
  this.socket.onopen = function(e) {that.on_connect(e);};
  this.socket.onmessage = function(e) {that.on_receive(e);};
  this.socket.onclose = function(e) {that.on_close(e);};
} //GameSocket

/**
 * GameSocket::send_message
 * Sends a message to the server and waits for a response if response_listener !== null
 **/
GameSocket.prototype.send_message = function(message, data, response_listener, that) {
  if (response_listener !== undefined && response_listener !== null) {
    this.socket.send(JSON.stringify({message: message, data:data, response_id: this.response_id}));
    this.response_listeners.push({id:this.response_id, listener:response_listener, that: that});
    ++this.response_id;
  }
  else {
    this.socket.send({message: message, data:data});
  } //if
} //GameSocket::send_message

GameSocket.prototype.receive_player_id = function(d) {
  this.current_player_id = d;
} //GameSocket::receive_player_id

GameSocket.prototype.on_connect = function(e) {
  this.ready = true;
  this.send_message('get_player_id', null, this.receive_player_id, this);
} //GameSocket::on_connect

GameSocket.prototype.on_close = function(e) {
  this.ready = false;
} //GameSocket::on_close

GameSocket.prototype.on_receive = function(e) {
  var data = JSON.parse(e.data);
  if (data.response_id !== null && data.response_id !== undefined) {
    var response_listener = null;
    for (var i = 0, l = this.response_listeners.length; i < l; ++i) {
      if (this.response_listeners[i].id === data.response_id) {
        response_listener = this.response_listeners[i];
        this.response_listeners.splice(i, 1);
        break;
      } //if
    } //for
    if (response_listener !== null) {
      if (response_listener.that !== undefined) response_listener.listener.call(response_listener.that, data.data);
      else response_listener.listener(data.data);
    } //if
  } //if
} //GameSocket::on_receive

/**********************************************************
 * GAME ENGINE
 **********************************************************/
/**
 * GameEngine
 * To basically drive the objects in the game
 **/
function GameEngine() {
  this.game_objects = [];
} //GameEngine

GameEngine.prototype.add_game_object = function (game_object) {
  this.game_objects.push(game_object);
} //GameEngine::add_game_object

GameEngine.prototype.update = function () {
  var go = this.game_objects;
  for (var i = 0, l = go.length; i < l; ++i) {
    go[i].update();
  } //for
} //GameEngine::update

/**********************************************************
 * INPUT COMPONENT
 **********************************************************/
/**
 * WindowInputComponent
 * GameObject Input Component to receive input from window.
 **/
function WindowInputComponent() {
  this.update = function() {};
  this.action = {
    up:     false,
    down:   false,
    left:   false,
    right:  false,
    fire:   false
  } //action
  this.keys = [];
  for (var i = 0; i < 256; ++i) { this.keys[i] = false; }
  this.mouse = {
    buttons: [false, false],
    position: [0, 0]
  };
  var that = this;
  window.addEventListener("MozOrientation", function(e){that.moz_orientation_change.call(that, e);}, false);
  window.addEventListener("orientationchange", function(e){that.orientation_change.call(that,e);}, false);
  window.addEventListener("keydown", function(e){that.keydown.call(that,e);}, false);
  window.addEventListener("keyup", function(e){that.keyup.call(that,e);}, false);
  window.addEventListener("mousedown", function(e){that.mousedown.call(that,e);}, false);
  window.addEventListener("mouseup", function(e){that.mouseup.call(that,e);}, false);
  window.addEventListener("mousemove", function(e){that.mousemove.call(that,e);}, false);
  window.addEventListener("mouseout", function(e){that.mouseout.call(that,e);}, false);
  window.addEventListener("mouseover", function(e){that.mouseover.call(that,e);}, false);
} //WindowInputComponent::Constructor

/**
 * WindowInputComponent::moz_orientation_change
 * Listener for window orientation change on Mozilla browsers
 **/
WindowInputComponent.prototype.moz_orientation_change = function (e) {
  this.action.left = e.x < 0 ? true : false;
  this.action.right = e.x > 0 ? true : false;
  this.action.up = e.y < 0 ? true : false;
  this.action.down = e.y > 0 ? true : false;
} //WindowInputComponent::moz_orientation_change

/**
 * WindowInputComponent::mouseout
 * Listener for window's mouseout event.
 **/
WindowInputComponent.prototype.mouseout = function (e) {
} //WindowInputComponent::mouseout

/**
 * WindowInputComponent::mousemove
 * Listener for window's mousemove event.
 **/
WindowInputComponent.prototype.mousemove = function (e) {
  this.mouse.position[0] = e.pageX;
  this.mouse.position[1] = e.pageY;
} //WindowInputComponent::mousemove

/**
 * WindowInputComponent::mouseover
 * Listener for window's mouseover event.
 **/
WindowInputComponent.prototype.mouseover = function (e) {
} //WindowInputComponent::mouseover

/**
 * WindowInputComponent::mousedown
 * Listener for window's mousedown event.
 **/
WindowInputComponent.prototype.mousedown = function (e) {
} //WindowInputComponent::mousedown

/**
 * WindowInputComponent::mouseup
 * Listener for window's mouseup event.
 **/
WindowInputComponent.prototype.mouseup = function (e) {
} //WindowInputComponent::mousedown

/**
 * WindowInputComponent::keydown
 * Listener for window's keydown event.
 **/
WindowInputComponent.prototype.keydown = function (e) {
  this.keys[e.keyCode] = true;
  switch (e.keyCode) {
    case 37: this.action.left = true; break;
    case 38: this.action.up = true; break;
    case 39: this.action.right = true; break;
    case 40: this.action.down = true; break;
    default: break;
  } //switch
} //WindowInputComponent::keydown

/**
 * WindowInputComponent::keyup
 * Listener for window's keyup event.
 **/
WindowInputComponent.prototype.keyup = function (e) {
  this.keys[e.keyCode] = false;
  switch (e.keyCode) {
    case 37: this.action.left = false; break;
    case 38: this.action.up = false; break;
    case 39: this.action.right = false; break;
    case 40: this.action.down = false; break;
    default: break;
  } //switch
} //WindowInputComponent::keyup

/**********************************************************
 * LOGIC COMPONENT
 **********************************************************/
/**
 * BasicLogicComponent
 **/
function BasicLogicComponent() {
  this.game_object = null;
} //BasicLogicComponent

/**
 * BasicLogicComponent::update
 **/
BasicLogicComponent.prototype.update = function() {
  var go = this.game_object;
  if (go !== null) {
    var pc = go.physics_component;
    var gc = go.graphics_component;
    var op = pc.GetOriginPosition();
    if (pc !== null) {
      go.position[0] = op.x;
      go.position[1] = op.y;
      go.rotation[2] = pc.GetRotation();
    } //if
    if (gc !== null) {
      gc.position[0] = go.position[0];
      gc.position[1] = go.position[1];
      gc.position[2] = go.position[2];
      gc.rotation[0] = go.rotation[0];
      gc.rotation[1] = go.rotation[1];
      gc.rotation[2] = go.rotation[2];
    } //if
  } //if
} //BasicLogicComponent::update

/**
 * InputLogicComponent
 * GameObject Logic Component for interacting with an Input Component.
 **/
function InputLogicComponent() {
  BasicLogicComponent.call(this);
} //InputLogicComponent

/**
 * InputLogicComponent::update
 * Advances logic for this frame.
 **/
InputLogicComponent.prototype.update = function () {
  var go = this.game_object;
  var ic = go.input_component;
  var pc = go.physics_component;
  if (ic !== null && pc !== null) {
    if (ic.action.up === true) {
      pc.ApplyImpulse(new b2Vec2(0, 1), pc.GetCenterPosition());
    } //if
    if (ic.action.down === true) {
      pc.ApplyImpulse(new b2Vec2(0, -1), pc.GetCenterPosition());
    } //if
    if (ic.action.left === true) {
      pc.ApplyImpulse(new b2Vec2(1, 0), pc.GetCenterPosition());
    } //if
    if (ic.action.right === true) {
      pc.ApplyImpulse(new b2Vec2(-1, 0), pc.GetCenterPosition());
    } //if
  } //if
  BasicLogicComponent.prototype.update.call(this);
} //InputLogicComponent::update

/**********************************************************
 * OBJECT DESCRIPTION
 **********************************************************/
/**
 * ObjectDescription
 * Describes an object. May be compiled from smaller objects.
 **/
function ObjectDescription(name) {
  this.name = name;
  this.children = [];
} //ObjectDescription::Constructor

/**
 * ObjectDescription::get_instance
 * Constructs an instance of the object from its description.
 **/
ObjectDescription.prototype.get_instance = function () {
  return new ObjectDescriptionInstance(this);
} //ObjectDescriptoin::get_instance

/**
 * ObjectDescriptionInstace
 * Holds instanced information of a description
 **/
function ObjectDescriptionInstance(description) {
  this.description = description;
  this.children = [];
  this.offset = [0,0];
  this.rotation = 0;
} //ObjectDescriptionInstance::Constructor

/**********************************************************
 * GAME OBJECT
 **********************************************************/
/**
 * GameObject
 * Encompasses an object in the game that may be controlled
 * by physics or input, and have sound, graphics or logic.
 **/
function GameObject() {
  this.position = [0,0,0];
  this.velocity = [0,0,0];
  this.rotation = [0,0,0];
  this.sleep = false;

  this.object_description = null;

  this.sound_component = null;
  this.physics_component = null;
  this.graphics_component = null;
  this.input_component = null;
  this.logic_component = null;
} //GameObject::Constructor

/**
 * GameObject::build_from_description
 * Constructs a game object from consituents according to description
 **/
GameObject.prototype.build_from_description = function (d) {
  this.object_description = d;
} //GameObject::build_from_description

/**
 * GameObject::break_apart
 * Breaks an object up into its constituents according to description
 *
 * @force - the force with which to scatter objects once they've broken
 **/
GameObject.prototype.break_apart = function (force) {

} //GameObject::break_apart

/**
 * GameObject::attach_physics_component
 * Attaches and registers physics component
 **/
GameObject.prototype.attach_physics_component = function (c) {
  this.physics_component = c;
} //GameObject::attach_physics_component

/**
 * GameObject::attach_sound_component
 * Attaches and registers sound component
 **/
GameObject.prototype.attach_sound_component = function (c) {
  this.sound_component = c;
} //GameObject::attach_sound_component

/**
 * GameObject::attach_input_component
 * Attaches and registers input component
 **/
GameObject.prototype.attach_input_component = function (c) {
  this.input_component = c;
} //GameObject::attach_input_component

/**
 * GameObject::attach_graphics_component
 * Attaches and registers graphics component
 **/
GameObject.prototype.attach_graphics_component = function (c) {
  this.graphics_component = c;
} //GameObject::attach_graphics_component

/**
 * GameObject::attach_logic_component
 * Attaches and registers logic component
 **/
GameObject.prototype.attach_logic_component = function (c) {
  if(c !== null) c.game_object = this;
  this.logic_component = c;
} //GameObject::attach_logic_component

/**
 * GameObject::update
 * Advances all components for this frame
 **/
GameObject.prototype.update = function() {
  if (this.input_component !== null) {
    this.input_component.update();
  } //if
  if (this.logic_component !== null) {
    this.logic_component.update();
  } //if
} //GameObject::update

/**********************************************************
 * LEVEL
 **********************************************************/
/**
 * Level
 * Data for a level.
 **/
function Level(level_description) {
  this.id = level_description.id;
  this.terrain = level_description.terrain;
  this.objects = level_description.objects;
} //Level::Constructor

levels.push(new Level({
  terrain: [[0,0], [1,0], [2,1], [3,-1]],
  objects: []
}));

/**
 * load_level
 * Prepares a level for use
 *
 * @level_num: id of level to load
 **/
function load_level(level_num) {
  var level = levels[level_num];
  uv_mapper = new CubicVR.uvmapper();
  uv_mapper.projection_mode = UV_PROJECTION_CUBIC;
  uv_mapper.projection_axis = UV_AXIS_Y;
  uv_mapper.wrap_w_count = 5.0;
  uv_mapper.scale = [1, 1, 1];

  var landscape;
  var landscape_size = 500;
  var landscape_material = new CubicVR.material("landscape");
  landscape_material.setTexture(new CubicVR.texture("content/terrain/grid.jpg"));
  landscape = new CubicVR.landscape(landscape_size, 2, 2, landscape_material);
  for (var i=0, l=landscape.obj.points.length; i<l ;++i) {
  } //for
  landscape.obj.calcNormals();
  uv_mapper.apply(landscape.obj, landscape_material);
  landscape.obj.compile();

  var ground_def = new b2BoxDef();
	ground_def.extents.Set(landscape_size, 1);
  ground_def.density = 0.0;
  ground_def.friction = 0;
  ground_def.restitution = 0.0;
	var ground_body = new b2BodyDef();
	ground_body.AddShape(ground_def);
	ground_body.position.Set(-50, -1);

  level.landscape_graphics_component = landscape;
  level.landscape_physics_component = physics_world.CreateBody(ground_body);

  current_level = level;
} //load_level

/**********************************************************
 * RENDER & SCENE
 **********************************************************/

/**
 * requestFrame
 **/
var requestFrame = function() {};

/**
 * start_main_loop
 * Starts the main loop
 **/
function start_main_loop() {
  if (typeof window.mozRequestAnimationFrame === "function") {
    window.addEventListener("MozBeforePaint", main_loop, false);
    (requestFrame = function() { window.mozRequestAnimationFrame(); })();
  } else {
    main_loop_interval = setInterval(main_loop, FPS);
  } //if 
} //start_main_loop

/**
 * stop_main_loop
 * Stops the main loop indirectly
 **/
function stop_main_loop() {
  if (main_loop_interval) {
    clearInterval(main_loop_interval);
  } //if
} //stop_main_loop

/**
 * init_graphics
 * Prepares a CubicVR for use. Initializes the viewport, camera and initial sceneObjects.
 **/
function init_graphics() {
  octree = new OcTree(4000, 8);
  scene = new CubicVR.scene(main_canvas.width, main_canvas.height, 40, 0.1, 300, octree);
  scene.setSkyBox(new CubicVR.skyBox("content/skybox/clouds.jpg"));
  scene.camera.position = [0, 0, 0];
  scene.camera.target = [0, 0, 1];
  scene.camera.setFOV(40);
  scene.camera.setDimensions(main_canvas.width, main_canvas.height);

  /** for testing **/
  var light = new cubicvr_light(LIGHT_TYPE_POINT);
  light.position = [0, 0, 0];
  light.distance = 200.0;
  light.intensity = 3.0;
  scene.bindLight(light);
  test_light = light;

} //init_graphics

/**
 * init_game_engine
 **/
function init_game_engine() {
  game_engine = new GameEngine();
} //init_game_engine

/**
 * init_physics
 **/
function init_physics() {
  var world_aabb = new b2AABB();
  world_aabb.minVertex.Set(-1000, -1000);
  world_aabb.maxVertex.Set(1000, 1000);

  var gravity = new b2Vec2(0, -3.0);
  var rest_sleep = true;
  physics_world = new b2World(world_aabb, gravity, rest_sleep);
} //init_physics

/**
 * run_timer
 * Advances the game timer.
 **/
function run_timer()
{
  if (!timerMilliseconds) {
    timerMilliseconds = (new Date()).getTime();
    return;
  } //if
  frameCounter++;
  var newTimerMilliseconds = (new Date()).getTime();
  timerLastSeconds = (newTimerMilliseconds-timerMilliseconds)/1000.0;
  if (timerLastSeconds > (1/10)) timerLastSeconds = (1/10);
  timerSeconds += timerLastSeconds;
  timerMilliseconds = newTimerMilliseconds;
} //run_timer

/**
 * main_loop 
 * Main Loop
 **/
var last_loop_time = new Date().getTime();
var camera_follow_speed = 0.1;
var camera_position_target = [0,0,0];
function main_loop() {
  xp += 0.01;
  //var time_before_loop = new Date();

  /** begin engine **/
  game_engine.update();
  /** end engine **/

  /** begin physics **/
  var time_step = 1.0/60;
  var iteration = 1;
  physics_world.Step(time_step, iteration);
  /** end physics **/

  /** begin render **/
  run_timer();
  
  //for testing
  test_light.position = [Math.sin(xp*10)*5, 0, 10 + Math.cos(xp*10)*5];

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  //trailing camera
  camera_position_target = [test_player_game_object.position[0], test_player_game_object.position[1], test_player_game_object.position[2] - 10];
  scene.camera.position[0] -= (scene.camera.position[0] - camera_position_target[0]) * camera_follow_speed;
  scene.camera.position[1] -= (scene.camera.position[1] - camera_position_target[1]) * camera_follow_speed;
  scene.camera.position[2] -= (scene.camera.position[2] - camera_position_target[2]) * camera_follow_speed;
  scene.camera.target = [test_player_game_object.position[0], test_player_game_object.position[1], test_player_game_object.position[2]];

  scene.render();

  if (current_level.landscape !== null) {
    var landscape = current_level.landscape_graphics_component;
    var camera = scene.camera;
  	CubicVR.renderObject(landscape.obj, camera.mvMatrix, camera.pMatrix,cubicvr_identity, []);
  } //if
  
  /** end render **/

  /*** statistics ***/
  var time_after_loop = new Date().getTime();
  var elapsed_loop_time = time_after_loop - last_loop_time;
  var limited = false;
  
  last_loop_time = time_after_loop;

  /** stats **/
  if (stats_div !== null) {
    var s = "FPS: " + Math.round(1000/elapsed_loop_time) + " ["+(limited?'Capped (too fast)':'Uncapped (too slow)')+"] | CANVAS: (" + main_canvas.width + ", " + main_canvas.height + ")";
    if (game_socket.ready) s += "| Connected to Server: " + game_socket.current_player_id;
    else s += "| Disconnected from Server";
    stats_div.innerHTML = s;
  } //if
  requestFrame();
} //main_loop
